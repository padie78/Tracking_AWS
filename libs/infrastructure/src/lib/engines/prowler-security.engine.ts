import { randomUUID } from 'node:crypto';
import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import {
  IAMClient,
  GetAccountPasswordPolicyCommand,
  GetAccountSummaryCommand,
  ListUsersCommand,
  ListMFADevicesCommand,
} from '@aws-sdk/client-iam';
import {
  EC2Client,
  DescribeSecurityGroupsCommand,
} from '@aws-sdk/client-ec2';
import {
  S3Client,
  ListBucketsCommand,
  GetBucketAclCommand,
  GetPublicAccessBlockCommand,
} from '@aws-sdk/client-s3';
import {
  AuditFinding,
  AwsAssumeRoleError,
  type AuditPayload,
  type ProwlerFinding,
  type AuditSeverity,
} from '@track-aws/domain';

type SessionCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

/**
 * Motor SecOps legacy (checks TS locales). Producción usa Prowler
 * como Lambda container (`integrations/prowler-lambda`). Conservado para tests.
 */
export class ProwlerSecurityEngine {
  private readonly sts = new STSClient({});

  async run(payload: AuditPayload): Promise<{
    prowlerFindings: ProwlerFinding[];
    auditFindings: AuditFinding[];
  }> {
    const credentials = await this.assume(payload);
    const findings: ProwlerFinding[] = [];

    findings.push(...(await this.checkRootAndIam(credentials, payload)));
    findings.push(...(await this.checkSecurityGroups(credentials, payload)));
    findings.push(...(await this.checkS3Public(credentials, payload)));

    const auditFindings = findings.map((f) =>
      AuditFinding.create({
        tenantId: payload.tenantId,
        auditId: payload.auditId,
        findingId: f.findingId,
        domain: 'secops',
        category: f.complianceFramework,
        severity: f.severity,
        resourceArn: f.resourceArn,
        resourceId: f.resourceId,
        region: f.region,
        title: f.title,
        rationale: f.rationale,
        recommendedAction: f.recommendedAction,
        estimatedMonthlySavingsUsd: 0,
        checkId: f.checkId,
      }),
    );

    return { prowlerFindings: findings, auditFindings };
  }

  private async assume(payload: AuditPayload): Promise<SessionCreds> {
    try {
      const assumed = await this.sts.send(
        new AssumeRoleCommand({
          RoleArn: payload.roleArn,
          RoleSessionName: `prowler-${payload.auditId}`.slice(0, 64),
          ExternalId: payload.externalId,
          DurationSeconds: 900,
        }),
      );
      const c = assumed.Credentials;
      if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
        throw new AwsAssumeRoleError('STS sin credenciales');
      }
      return {
        accessKeyId: c.AccessKeyId,
        secretAccessKey: c.SecretAccessKey,
        sessionToken: c.SessionToken,
      };
    } catch (err) {
      throw new AwsAssumeRoleError(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private finding(
    partial: Omit<ProwlerFinding, 'findingId'> & { findingId?: string },
  ): ProwlerFinding {
    return { findingId: partial.findingId ?? randomUUID(), ...partial };
  }

  private async checkRootAndIam(
    credentials: SessionCreds,
    payload: AuditPayload,
  ): Promise<ProwlerFinding[]> {
    const iam = new IAMClient({ region: 'us-east-1', credentials });
    const out: ProwlerFinding[] = [];
    const accountArn = `arn:aws:iam::${payload.accountId}:root`;

    try {
      await iam.send(new GetAccountPasswordPolicyCommand({}));
    } catch {
      out.push(
        this.finding({
          checkId: 'iam_password_policy_exists',
          severity: 'HIGH',
          resourceArn: accountArn,
          resourceId: payload.accountId,
          region: 'global',
          title: 'Sin password policy de cuenta',
          rationale: 'CIS: la cuenta no tiene password policy configurada.',
          recommendedAction: 'Definir password policy con longitud ≥14 y rotación.',
          complianceFramework: 'cis',
        }),
      );
    }

    try {
      const summary = await iam.send(new GetAccountSummaryCommand({}));
      const mfa = summary.SummaryMap?.AccountMFAEnabled;
      if (mfa === 0 || mfa === undefined) {
        out.push(
          this.finding({
            checkId: 'iam_root_mfa_enabled',
            severity: 'CRITICAL',
            resourceArn: accountArn,
            resourceId: 'root',
            region: 'global',
            title: 'MFA de root no habilitado',
            rationale: 'CIS 1.5 / WAF Security: root sin MFA.',
            recommendedAction: 'Habilitar hardware MFA en la cuenta root.',
            complianceFramework: 'cis',
          }),
        );
      }
    } catch {
      /* summary puede fallar por permisos — skip */
    }

    try {
      const users = await iam.send(new ListUsersCommand({ MaxItems: 50 }));
      for (const user of users.Users ?? []) {
        if (!user.UserName) continue;
        const mfaDevices = await iam.send(
          new ListMFADevicesCommand({ UserName: user.UserName }),
        );
        if ((mfaDevices.MFADevices ?? []).length === 0) {
          out.push(
            this.finding({
              checkId: 'iam_user_mfa_enabled',
              severity: 'HIGH',
              resourceArn: user.Arn ?? `arn:aws:iam::${payload.accountId}:user/${user.UserName}`,
              resourceId: user.UserName,
              region: 'global',
              title: `Usuario IAM sin MFA: ${user.UserName}`,
              rationale: 'CIS: usuarios consolidados deben tener MFA.',
              recommendedAction: 'Forzar MFA o migrar a Identity Center / roles.',
              complianceFramework: 'iam',
            }),
          );
        }
      }
    } catch {
      /* optional */
    }

    // touch STS identity to validate session
    await new STSClient({ credentials }).send(new GetCallerIdentityCommand({}));

    return out;
  }

  private async checkSecurityGroups(
    credentials: SessionCreds,
    payload: AuditPayload,
  ): Promise<ProwlerFinding[]> {
    const regions =
      payload.regions.length > 0 ? payload.regions : ['us-east-1'];
    const out: ProwlerFinding[] = [];
    const riskyPorts = new Set([22, 3389, 3306, 5432, 27017]);

    for (const region of regions) {
      const ec2 = new EC2Client({ region, credentials });
      try {
        const sgs = await ec2.send(new DescribeSecurityGroupsCommand({}));
        for (const sg of sgs.SecurityGroups ?? []) {
          for (const perm of sg.IpPermissions ?? []) {
            const from = perm.FromPort ?? 0;
            const to = perm.ToPort ?? from;
            const open = (perm.IpRanges ?? []).some(
              (r) => r.CidrIp === '0.0.0.0/0',
            );
            if (!open) continue;
            for (let p = from; p <= to; p++) {
              if (!riskyPorts.has(p)) continue;
              out.push(
                this.finding({
                  checkId: `ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_${p}`,
                  severity: (p === 22 || p === 3389
                    ? 'CRITICAL'
                    : 'HIGH') as AuditSeverity,
                  resourceArn: `arn:aws:ec2:${region}:${payload.accountId}:security-group/${sg.GroupId}`,
                  resourceId: sg.GroupId ?? 'unknown',
                  region,
                  title: `SG ${sg.GroupName} abre puerto ${p} a 0.0.0.0/0`,
                  rationale: 'CIS / Network: exposición administrativa a Internet.',
                  recommendedAction:
                    'Restringir CIDR a bastion/VPN o usar SSM Session Manager.',
                  complianceFramework: 'network',
                }),
              );
            }
          }
        }
      } catch {
        /* region may be denied */
      }
    }
    return out;
  }

  private async checkS3Public(
    credentials: SessionCreds,
    payload: AuditPayload,
  ): Promise<ProwlerFinding[]> {
    const s3 = new S3Client({ region: 'us-east-1', credentials });
    const out: ProwlerFinding[] = [];
    try {
      const buckets = await s3.send(new ListBucketsCommand({}));
      for (const bucket of (buckets.Buckets ?? []).slice(0, 40)) {
        const name = bucket.Name;
        if (!name) continue;
        try {
          const block = await s3.send(
            new GetPublicAccessBlockCommand({ Bucket: name }),
          );
          const cfg = block.PublicAccessBlockConfiguration;
          const fullyBlocked =
            cfg?.BlockPublicAcls &&
            cfg.BlockPublicPolicy &&
            cfg.IgnorePublicAcls &&
            cfg.RestrictPublicBuckets;
          if (!fullyBlocked) {
            out.push(
              this.finding({
                checkId: 's3_bucket_level_public_access_block',
                severity: 'HIGH',
                resourceArn: `arn:aws:s3:::${name}`,
                resourceId: name,
                region: 'global',
                title: `S3 sin Public Access Block completo: ${name}`,
                rationale: 'CIS Storage: bucket potencialmente público.',
                recommendedAction: 'Activar los 4 switches de Public Access Block.',
                complianceFramework: 'storage',
              }),
            );
          }
        } catch {
          try {
            await s3.send(new GetBucketAclCommand({ Bucket: name }));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ListBuckets denied */
    }
    return out;
  }
}
