import type { AppSyncResolverEvent, AppSyncResolverHandler } from 'aws-lambda';
import {
  enqueueInventoryScan,
  generateSavingsDossier,
  getAudits,
  getAuditReport,
  getSavingsDossier,
  linkAwsAccount,
  listAlertChannels,
  listAuditFindings,
  listAwsAccounts,
  listFindingsByScan,
  startAudit,
  upsertAlertChannel,
  deleteAlertChannel,
  verifyAwsAccountLink,
} from './composition-root';
import { AppSyncTypedError, requireTenantId, rethrowAsTyped } from './errors';

type CognitoIdentity = {
  claims?: Record<string, unknown>;
  sub?: string;
};

type ResolverArgs =
  | {
      fieldName: 'startAudit';
      args: {
        input: {
          accountId: string;
          regions?: string[] | null;
        };
      };
    }
  | {
      fieldName: 'startScan';
      args: {
        input: {
          accountId: string;
          regions?: string[] | null;
        };
      };
    }
  | {
      fieldName: 'linkAwsAccount';
      args: {
        input: {
          accountId: string;
          displayName?: string | null;
          roleName?: string | null;
          regions?: string[] | null;
        };
      };
    }
  | {
      fieldName: 'verifyAwsAccountLink';
      args: { input: { accountId: string } };
    }
  | { fieldName: 'listAwsAccounts'; args: Record<string, never> }
  | {
      fieldName: 'listAudits';
      args: { auditId?: string | null; limit?: number | null };
    }
  | {
      fieldName: 'listAuditFindings';
      args: {
        auditId: string;
        domain?: 'finops' | 'secops' | 'architecture' | null;
      };
    }
  | {
      fieldName: 'getAuditReport';
      args: { auditId: string };
    }
  | { fieldName: 'listFindingsByScan'; args: { scanId: string } }
  | {
      fieldName: 'getSavingsDossier';
      args: { dossierId?: string | null; scanId?: string | null };
    }
  | {
      fieldName: 'generateSavingsDossier';
      args: {
        input: {
          scanId: string;
          accountId: string;
          roleTone?: 'finops_admin' | 'analyst' | 'viewer' | null;
        };
      };
    }
  | { fieldName: 'listAlertChannels'; args: Record<string, never> }
  | {
      fieldName: 'upsertAlertChannel';
      args: {
        input: {
          channelId?: string | null;
          kind: 'webhook' | 'slack' | 'email';
          target: string;
          label?: string | null;
          categories?: string[] | null;
        };
      };
    }
  | { fieldName: 'deleteAlertChannel'; args: { channelId: string } }
  | { fieldName: 'ping'; args: { message: string } };

async function dispatch(
  op: ResolverArgs,
  identity: CognitoIdentity | null | undefined,
): Promise<unknown> {
  const tenantId = requireTenantId(identity);

  switch (op.fieldName) {
    case 'startAudit': {
      const result = await startAudit.execute({
        tenantId,
        accountId: op.args.input.accountId,
        regions: op.args.input.regions ?? undefined,
      });
      return {
        accepted: true,
        auditId: result.auditId,
        correlationId: result.correlationId,
        executionArn: result.executionArn,
        tenantId,
        accountId: op.args.input.accountId,
      };
    }

    case 'startScan': {
      const result = await enqueueInventoryScan.execute({
        tenantId,
        accountId: op.args.input.accountId,
        regions: op.args.input.regions ?? undefined,
      });
      return {
        accepted: true,
        scanId: result.scanId,
        correlationId: result.correlationId,
        tenantId,
        accountId: op.args.input.accountId,
      };
    }

    case 'linkAwsAccount':
      return linkAwsAccount.execute({
        tenantId,
        accountId: op.args.input.accountId,
        displayName: op.args.input.displayName ?? undefined,
        roleName: op.args.input.roleName ?? undefined,
        regions: op.args.input.regions ?? undefined,
      });

    case 'verifyAwsAccountLink':
      return verifyAwsAccountLink.execute({
        tenantId,
        accountId: op.args.input.accountId,
      });

    case 'listAwsAccounts':
      return listAwsAccounts.execute({ tenantId });

    case 'listAudits':
      return getAudits.execute({
        tenantId,
        auditId: op.args.auditId ?? undefined,
        limit: op.args.limit ?? undefined,
      });

    case 'listAuditFindings':
      return listAuditFindings.execute({
        tenantId,
        auditId: op.args.auditId,
        domain: op.args.domain ?? undefined,
      });

    case 'getAuditReport':
      return getAuditReport.execute({
        tenantId,
        auditId: op.args.auditId,
      });

    case 'listFindingsByScan':
      return listFindingsByScan.execute({
        tenantId,
        scanId: op.args.scanId,
      });

    case 'getSavingsDossier': {
      if (!op.args.dossierId && !op.args.scanId) {
        throw new AppSyncTypedError(
          'ValidationError',
          'dossierId o scanId requerido.',
        );
      }
      return getSavingsDossier.execute({
        tenantId,
        dossierId: op.args.dossierId ?? undefined,
        scanId: op.args.scanId ?? undefined,
      });
    }

    case 'generateSavingsDossier': {
      const result = await generateSavingsDossier.execute({
        tenantId,
        scanId: op.args.input.scanId,
        accountId: op.args.input.accountId,
        roleTone: op.args.input.roleTone ?? 'analyst',
      });
      return getSavingsDossier.execute({
        tenantId,
        dossierId: result.dossierId,
      });
    }

    case 'listAlertChannels':
      return listAlertChannels.execute(tenantId);

    case 'upsertAlertChannel':
      return upsertAlertChannel.execute({
        tenantId,
        channelId: op.args.input.channelId ?? undefined,
        kind: op.args.input.kind,
        target: op.args.input.target,
        label: op.args.input.label ?? undefined,
        categories: op.args.input.categories ?? undefined,
      });

    case 'deleteAlertChannel': {
      await deleteAlertChannel.execute(tenantId, op.args.channelId);
      return true;
    }

    case 'ping':
      return `pong: ${op.args.message}`;

    default:
      throw new Error(
        `Field no soportado: ${(op as { fieldName: string }).fieldName}`,
      );
  }
}

export const handler: AppSyncResolverHandler<Record<string, unknown>, unknown> = async (
  event: AppSyncResolverEvent<Record<string, unknown>>,
) => {
  const identity = event.identity as CognitoIdentity | null | undefined;
  const op = {
    fieldName: event.info.fieldName,
    args: event.arguments,
  } as ResolverArgs;

  try {
    return await dispatch(op, identity);
  } catch (err) {
    rethrowAsTyped(err);
  }
};
