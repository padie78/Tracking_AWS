/**
 * Copy amigable bilingüe (ES / EN) para findings.
 * Prioriza campos persistidos por ETL; si no, reglas locales; si no, fallback.
 */

import type { UiLang } from '../i18n/ui-locale.service';

export type FindingLike = {
  title: string;
  rationale?: string | null;
  recommendedAction?: string | null;
  checkId?: string | null;
  category?: string | null;
  domain?: string | null;
  severity?: string | null;
  resourceId?: string | null;
  resourceArn?: string | null;
  region?: string | null;
  estimatedMonthlySavingsUsd?: number | null;
  friendlyHeadline?: string | null;
  friendlyWhy?: string | null;
  friendlyAction?: string | null;
  friendlyArea?: string | null;
  friendlyHeadlineEs?: string | null;
  friendlyWhyEs?: string | null;
  friendlyActionEs?: string | null;
  friendlyAreaEs?: string | null;
  friendlyHeadlineEn?: string | null;
  friendlyWhyEn?: string | null;
  friendlyActionEn?: string | null;
  friendlyAreaEn?: string | null;
};

export type FriendlyFinding = {
  headline: string;
  whyItMatters: string;
  whatToDo: string;
  where: string;
  urgencyLabel: string;
  areaLabel: string;
  /** Título técnico original acortado (contexto) */
  context: string | null;
  /** Servicio AWS detectado (Lambda, S3, …) */
  serviceLabel: string | null;
  /** Hallazgo saludable / PASS — no es tarea pendiente */
  isHealthy: boolean;
  /** Evidencia del motor (StatusExtended / rationale limpio) */
  evidence: string | null;
  /** Remediación técnica útil (si existe) */
  remediation: string | null;
  /** checkId legible */
  checkLabel: string | null;
  /** Título técnico original */
  technicalTitle: string | null;
  /** Deep link a consola AWS cuando se puede construir */
  consoleUrl: string | null;
  /** ARN o id completo para copiar */
  resourceRef: string | null;
};

type LocalePack = {
  headline: string;
  why: string;
  action: string;
  area: string;
};

type RuleDomain = 'secops' | 'finops' | 'architecture';

type Rule = {
  test: (hay: string) => boolean;
  /** Si falta, aplica a todos los dominios */
  domains?: RuleDomain[];
  es: LocalePack;
  en: LocalePack;
};

const SEVERITY: Record<UiLang, Record<string, string>> = {
  es: { CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFO: 'Info' },
  en: { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INFO: 'Info' },
};

const DOMAIN: Record<UiLang, Record<string, string>> = {
  es: { secops: 'Seguridad', finops: 'Costos', architecture: 'Arquitectura' },
  en: { secops: 'Security', finops: 'Cost', architecture: 'Architecture' },
};

const RULES: Rule[] = [
  {
    test: (h) =>
      /no secrets? found|secrets? (?:were )?not found|without secrets? in/.test(h),
    es: {
      headline: 'Control OK: no hay secretos en el código de la Lambda',
      why: 'El escaneo no encontró claves, tokens ni passwords hardcodeados en esta función. Es una buena señal de higiene, no un incidente.',
      action:
        'No hay nada que corregir acá. Mantené el escaneo en CI/CD para que no se cuelen secretos en futuros deploys.',
      area: 'Aplicaciones',
    },
    en: {
      headline: 'Control OK: no secrets in the Lambda code',
      why: 'The scan did not find hardcoded keys, tokens, or passwords in this function. That is good hygiene, not an incident.',
      action:
        'Nothing to fix here. Keep scanning in CI/CD so secrets do not sneak into future deploys.',
      area: 'Applications',
    },
  },
  {
    test: (h) =>
      /secret.*(?:in|inside|hardcoded).*code|hardcoded.?secret|secrets?_found|lambda.*secret|secret.*lambda|aws.?access.?key|akia[0-9a-z]{16}/i.test(
        h,
      ) && !/no secrets? found|secrets? (?:were )?not found/.test(h),
    es: {
      headline: 'Posibles secretos hardcodeados en el código',
      why: 'Claves o tokens en el código pueden filtrarse por repos, logs, backups o el historial de versiones. Un atacante podría usarlos para entrar a tu cuenta.',
      action:
        'Mové los secretos a Secrets Manager o SSM Parameter Store, rotá lo que ya estuvo en el código y redesplegá la función.',
      area: 'Aplicaciones',
    },
    en: {
      headline: 'Possible hardcoded secrets in the code',
      why: 'Keys or tokens in code can leak via repos, logs, backups, or version history. An attacker could use them to enter your account.',
      action:
        'Move secrets to Secrets Manager or SSM Parameter Store, rotate anything that was in code, and redeploy the function.',
      area: 'Applications',
    },
  },
  {
    test: (h) => /mfa|multi.factor|2fa/.test(h),
    es: {
      headline: 'Falta la doble verificación (MFA) en un usuario',
      why: 'Si alguien roba la contraseña, puede entrar a tu nube sin freno.',
      action: 'Activá MFA para ese usuario desde la consola de IAM (tarda unos minutos).',
      area: 'Accesos',
    },
    en: {
      headline: 'A user is missing multi-factor authentication (MFA)',
      why: 'If someone steals the password, they can enter your cloud unchecked.',
      action: 'Turn on MFA for that user in the IAM console (takes a few minutes).',
      area: 'Access',
    },
  },
  {
    test: (h) => /unused.credential|access.key.*90|credential.*90|stale.*key/.test(h),
    es: {
      headline: 'Hay claves de acceso viejas sin usar',
      why: 'Las claves olvidadas son una puerta típica para ataques silenciosos.',
      action: 'Desactivá o borrá las claves que nadie usa hace más de 90 días.',
      area: 'Accesos',
    },
    en: {
      headline: 'There are unused access keys',
      why: 'Forgotten keys are a common silent entry point for attackers.',
      action: 'Disable or delete keys unused for more than 90 days.',
      area: 'Access',
    },
  },
  {
    test: (h) => /root/.test(h) && /(mfa|access|key|user)/.test(h),
    es: {
      headline: 'La cuenta raíz está demasiado expuesta',
      why: 'La cuenta root es la “llave maestra”. Si se filtra, pierden el control total.',
      action: 'Usá un usuario admin con MFA y evitá usar root en el día a día.',
      area: 'Accesos',
    },
    en: {
      headline: 'The root account is too exposed',
      why: 'Root is the master key. If it leaks, you lose total control.',
      action: 'Use an admin user with MFA and avoid day-to-day root use.',
      area: 'Access',
    },
  },
  {
    test: (h) => /ssh|port.?22|0\.0\.0\.0\/0.*22|security.group.*ssh/.test(h),
    es: {
      headline: 'El acceso remoto SSH está abierto a Internet',
      why: 'Cualquiera puede intentar entrar a tus servidores (ransomware, minado, etc.).',
      action: 'Cerrá el puerto 22 al mundo y dejalo solo para tu oficina o VPN.',
      area: 'Red',
    },
    en: {
      headline: 'SSH remote access is open to the internet',
      why: 'Anyone can try to break into your servers (ransomware, crypto mining, etc.).',
      action: 'Close port 22 to the world; allow only your office IP or VPN.',
      area: 'Network',
    },
  },
  {
    test: (h) => /rdp|port.?3389|0\.0\.0\.0\/0.*3389/.test(h),
    es: {
      headline: 'Escritorio remoto (RDP) abierto a Internet',
      why: 'Es un blanco frecuente de ataques automatizados.',
      action: 'Restringí el puerto 3389 a IPs conocidas o usá un bastión/VPN.',
      area: 'Red',
    },
    en: {
      headline: 'Remote desktop (RDP) is open to the internet',
      why: 'It is a frequent target for automated attacks.',
      action: 'Restrict port 3389 to known IPs or use a bastion/VPN.',
      area: 'Network',
    },
  },
  {
    test: (h) =>
      /lambda.*public|publicly.?accessible.*lambda|lambda.*function.?url|function_url|awslambda.*invok|lambda_function_not_publicly/.test(
        h,
      ),
    es: {
      headline: 'Una función Lambda es invocable desde Internet',
      why: 'Cualquiera puede llamarla: abuso, fuga de datos o factura por invocaciones.',
      action:
        'Revisá la política de la función o la Function URL y restringí quién puede invocarla (IAM / auth).',
      area: 'Aplicaciones',
    },
    en: {
      headline: 'A Lambda function is invokable from the internet',
      why: 'Anyone can call it: abuse, data leaks, or bill shock from invocations.',
      action:
        'Review the function policy or Function URL and restrict who can invoke it (IAM / auth).',
      area: 'Applications',
    },
  },
  {
    test: (h) =>
      /security.?group|ec2.*sg|ingress.*0\.0\.0\.0|0\.0\.0\.0\/0.*(tcp|udp|port)|sg-/.test(h),
    es: {
      headline: 'Hay un puerto de red abierto a todo Internet',
      why: 'Los bots escanean rangos 0.0.0.0/0 y atacan lo primero que encuentran.',
      action: 'En el security group, limitá el CIDR a IPs conocidas o a una VPN.',
      area: 'Red',
    },
    en: {
      headline: 'A network port is open to the whole internet',
      why: 'Bots scan 0.0.0.0/0 ranges and attack whatever answers.',
      action: 'In the security group, limit the CIDR to known IPs or a VPN.',
      area: 'Network',
    },
  },
  {
    test: (h) => /0\.0\.0\.0\/0|open.to.the.world|unrestricted|publicly.accessible/.test(h),
    es: {
      headline: 'Hay un recurso demasiado expuesto a Internet',
      why: 'Cuanto más abierto está, más fácil es que lo encuentren los bots.',
      action: 'Revisá quién puede acceder (política IAM, URL pública o red) y limitá el alcance.',
      area: 'Seguridad',
    },
    en: {
      headline: 'A resource is too exposed to the internet',
      why: 'The more open it is, the easier it is for bots to find it.',
      action: 'Review who can access it (IAM policy, public URL, or network) and narrow the scope.',
      area: 'Security',
    },
  },
  {
    test: (h) => /s3.*public|bucket.*public|public.*bucket|block.public/.test(h),
    es: {
      headline: 'Un almacenamiento S3 puede verse desde fuera',
      why: 'Datos de clientes o backups pueden filtrarse sin que lo notes.',
      action: 'Activá el bloqueo de acceso público y revisá las políticas del bucket.',
      area: 'Almacenamiento',
    },
    en: {
      headline: 'An S3 bucket may be visible from outside',
      why: 'Customer data or backups can leak without you noticing.',
      action: 'Enable public access block and review the bucket policies.',
      area: 'Storage',
    },
  },
  {
    test: (h) => /ebs.*unattached|unattached.*ebs|volume.*not.attach|disco.*huerf|sin adjunt/.test(h),
    es: {
      headline: 'Estás pagando un disco que no está en uso',
      why: 'Es como alquilar un depósito vacío: el cargo sigue todos los meses.',
      action: 'Sacá un respaldo si hace falta y borrá o reconectá el disco.',
      area: 'Costos',
    },
    en: {
      headline: 'You are paying for an unused disk',
      why: 'Like renting an empty storage unit: the charge continues every month.',
      action: 'Snapshot if needed, then delete or re-attach the volume.',
      area: 'Cost',
    },
  },
  {
    test: (h) => /elastic.?ip|eip.*idle|idle.*eip|eip.*unassoci/.test(h),
    es: {
      headline: 'Hay una IP pública que no está asociada',
      why: 'AWS cobra por IPs elásticas sin usar.',
      action: 'Liberá la IP o asociala a un recurso que la necesite.',
      area: 'Costos',
    },
    en: {
      headline: 'There is an unassociated public IP',
      why: 'AWS charges for unused Elastic IPs.',
      action: 'Release the IP or associate it with a resource that needs it.',
      area: 'Cost',
    },
  },
  {
    test: (h) => /rightsiz|sobredimension|low.util|underutil|cpu.*low|idle.*instance/.test(h),
    es: {
      headline: 'Hay un servidor más grande de lo necesario',
      why: 'Pagás potencia que casi no se usa.',
      action: 'Bajá de tamaño o apagalo fuera de horario laboral.',
      area: 'Costos',
    },
    en: {
      headline: 'A server is larger than needed',
      why: 'You pay for capacity that is barely used.',
      action: 'Downsize it or stop it outside business hours.',
      area: 'Cost',
    },
  },
  {
    test: (h) => /moderniz|t2\b|legacy.*instance/.test(h),
    es: {
      headline: 'Hay servidores de generación vieja',
      why: 'Las familias nuevas suelen dar más rendimiento por el mismo dinero.',
      action: 'Planificá migrar a una familia moderna (por ejemplo t3) con una prueba corta.',
      area: 'Costos',
    },
    en: {
      headline: 'There are older-generation servers',
      why: 'Newer families usually give more performance for the same money.',
      action: 'Plan a short trial migration to a modern family (e.g. t3).',
      area: 'Cost',
    },
  },
  {
    test: (h) => /encryption|unencrypted|not.encrypt|sin cifr/.test(h),
    es: {
      headline: 'Hay datos o secretos sin el cifrado esperado',
      why: 'Si alguien accede al medio de almacenamiento, puede leer información sensible.',
      action: 'Activá cifrado (KMS) y rotá secretos si estaban expuestos.',
      area: 'Datos',
    },
    en: {
      headline: 'Data or secrets lack expected encryption',
      why: 'If someone reaches the storage medium, they can read sensitive information.',
      action: 'Enable encryption (KMS) and rotate secrets if they were exposed.',
      area: 'Data',
    },
  },
  {
    test: (h) => /appsync|graphql.*api.?key|api_key_authentication|api.key.*auth/.test(h),
    es: {
      headline: 'La API GraphQL usa una clave demasiado simple',
      why: 'Cualquiera con esa clave puede consultar o cambiar datos. Es fácil de filtrar o compartir por error.',
      action: 'Pasá a login de usuarios (Cognito/IAM) y desactivá la API Key en producción.',
      area: 'Aplicaciones',
    },
    en: {
      headline: 'The GraphQL API uses a weak API key',
      why: 'Anyone with that key can query or change data. It is easy to leak or share by mistake.',
      action: 'Switch to user auth (Cognito/IAM) and disable the API key in production.',
      area: 'Applications',
    },
  },
  {
    test: (h) => /cve-|vulnerab|trivy|package.*vulner/.test(h),
    es: {
      headline: 'Hay una falla conocida en el software (CVE)',
      why: 'Los atacantes buscan estas fallas en Internet apenas se publican.',
      action: 'Actualizá el paquete o reconstruí la imagen con versiones parcheadas.',
      area: 'Aplicaciones',
    },
    en: {
      headline: 'There is a known software flaw (CVE)',
      why: 'Attackers hunt these flaws on the internet as soon as they are published.',
      action: 'Update the package or rebuild the image with patched versions.',
      area: 'Applications',
    },
  },
  {
    domains: ['secops', 'architecture'],
    // Sin "role"/"policy" sueltos: aparecen en ARNs y hallazgos de costo
    test: (h) =>
      /\biam\b|permission|privilege|least.?privilege|overly.?permissive|admin.?access|wildcard.*action|\*:\*/.test(
        h,
      ),
    es: {
      headline: 'Hay permisos más amplios de lo recomendable',
      why: 'Si una cuenta o rol se compromete, el daño puede extenderse a toda la nube.',
      action: 'Reducí permisos al mínimo necesario (principio de menor privilegio).',
      area: 'Accesos',
    },
    en: {
      headline: 'Permissions are broader than recommended',
      why: 'If an account or role is compromised, damage can spread across the cloud.',
      action: 'Reduce permissions to the minimum needed (least privilege).',
      area: 'Access',
    },
  },
  {
    domains: ['secops', 'architecture'],
    test: (h) => /cloudtrail|audit.log|logging.*disabled|no.*cloudtrail/.test(h),
    es: {
      headline: 'El registro de actividad no está bien configurado',
      why: 'Sin buenos logs cuesta investigar un incidente o demostrar cumplimiento.',
      action: 'Activá/ajustá CloudTrail y definí una retención razonable.',
      area: 'Cumplimiento',
    },
    en: {
      headline: 'Activity logging is not set up well',
      why: 'Without good logs it is hard to investigate incidents or prove compliance.',
      action: 'Enable/tune CloudTrail and set sensible retention.',
      area: 'Compliance',
    },
  },
  {
    domains: ['finops'],
    test: (h) =>
      /log.?group|retention|never.?expire|cloudwatch.*log|reten/.test(h),
    es: {
      headline: 'Los logs se guardan sin límite de tiempo',
      why: 'Cada GB almacenado suma en la factura mes a mes.',
      action: 'Definí retención (p. ej. 30–90 días) en el grupo de CloudWatch Logs.',
      area: 'Costos',
    },
    en: {
      headline: 'Logs are kept with no time limit',
      why: 'Every stored GB adds to the bill every month.',
      action: 'Set retention (e.g. 30–90 days) on the CloudWatch log group.',
      area: 'Cost',
    },
  },
  {
    domains: ['finops'],
    test: (h) => /komiser|cost_generic/.test(h),
    es: {
      headline: 'Gasto detectado en el inventario',
      why: 'Komiser midió costo mensual en este recurso; conviene validar owners y si sigue aportando valor.',
      action: 'Revisá tags/owners, rightsizing o apagado si está idle; abrí el link de consola si está disponible.',
      area: 'Inventario',
    },
    en: {
      headline: 'Spend detected in inventory',
      why: 'Komiser measured monthly cost on this resource; validate owners and whether it still delivers value.',
      action: 'Review tags/owners, rightsizing, or stop if idle; open the console link when available.',
      area: 'Inventory',
    },
  },
  {
    domains: ['finops'],
    test: (h) =>
      /serverless.?waste|lambda.*idle|idle.*lambda|unused.*lambda|nat.?gateway|orphan|waste|infracost|saving|ahorro|cost.?optim/.test(
        h,
      ),
    es: {
      headline: 'Hay una oportunidad de bajar el gasto',
      why: 'El escaneo de costos marcó un recurso ocioso o sobredimensionado que sigue facturando.',
      action: 'Confirmá si hace falta; si no, apagalo, bajá de tamaño o eliminalo.',
      area: 'Costos',
    },
    en: {
      headline: 'There is a chance to lower spend',
      why: 'The cost scan flagged idle or oversized capacity that is still billing.',
      action: 'Confirm it is needed; otherwise stop, downsize, or delete it.',
      area: 'Cost',
    },
  },
  {
    domains: ['secops', 'architecture'],
    test: (h) => /api.gateway|no.auth|without.auth|unauthenticated/.test(h),
    es: {
      headline: 'Una API pública no pide autenticación',
      why: 'Cualquiera puede usarla: riesgo de abuso, datos filtrados o factura inflada.',
      action: 'Agregá login, API keys o un autorizador antes de exponerla.',
      area: 'Aplicaciones',
    },
    en: {
      headline: 'A public API does not require authentication',
      why: 'Anyone can use it: abuse, data leaks, or inflated bills.',
      action: 'Add login, API keys, or an authorizer before exposing it.',
      area: 'Applications',
    },
  },
];

function haystack(f: FindingLike): string {
  // Sin resourceArn: contiene ":role/" y dispara reglas IAM en hallazgos de costo
  return [
    f.checkId,
    f.title,
    f.category,
    f.rationale,
    f.recommendedAction,
    f.domain,
    f.resourceId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const SECOPS_AREAS = new Set([
  'Accesos',
  'Red',
  'Seguridad',
  'Datos',
  'Cumplimiento',
  'Aplicaciones',
  'Almacenamiento',
  'Access',
  'Network',
  'Security',
  'Data',
  'Compliance',
  'Applications',
  'Storage',
]);

function findingDomain(f: FindingLike): RuleDomain {
  const d = (f.domain || 'secops').toLowerCase();
  if (d === 'finops' || d === 'architecture') return d;
  return 'secops';
}

function matchRule(f: FindingLike, hay: string): Rule | undefined {
  const domain = findingDomain(f);
  return RULES.find((r) => {
    if (r.domains) {
      if (!r.domains.includes(domain)) return false;
    } else if (domain === 'finops' && SECOPS_AREAS.has(r.es.area)) {
      // Reglas de seguridad sin tag no aplican a costos
      return false;
    }
    return r.test(hay);
  });
}

function isSecurityCopy(pack: LocalePack): boolean {
  return (
    SECOPS_AREAS.has(pack.area) ||
    /permisos|permission|mfa|security group|puerto|secretos hardcode|expuest/i.test(
      `${pack.headline} ${pack.area}`,
    )
  );
}

const SERVICE_LABEL: Record<string, { es: string; en: string }> = {
  lambda: { es: 'Lambda', en: 'Lambda' },
  s3: { es: 'S3', en: 'S3' },
  ec2: { es: 'EC2', en: 'EC2' },
  rds: { es: 'RDS', en: 'RDS' },
  iam: { es: 'IAM', en: 'IAM' },
  apigateway: { es: 'API Gateway', en: 'API Gateway' },
  appsync: { es: 'AppSync', en: 'AppSync' },
  dynamodb: { es: 'DynamoDB', en: 'DynamoDB' },
  elasticloadbalancing: { es: 'Load Balancer', en: 'Load Balancer' },
  elbv2: { es: 'Load Balancer', en: 'Load Balancer' },
  cloudfront: { es: 'CloudFront', en: 'CloudFront' },
  ecs: { es: 'ECS', en: 'ECS' },
  eks: { es: 'EKS', en: 'EKS' },
  kms: { es: 'KMS', en: 'KMS' },
  secretsmanager: { es: 'Secrets Manager', en: 'Secrets Manager' },
  logs: { es: 'CloudWatch Logs', en: 'CloudWatch Logs' },
  sqs: { es: 'SQS', en: 'SQS' },
  sns: { es: 'SNS', en: 'SNS' },
};

type AwsResourceRef = {
  serviceKey: string | null;
  serviceLabel: string | null;
  name: string;
  region: string | null;
};

function parseAwsResource(f: FindingLike, lang: UiLang): AwsResourceRef {
  const raw = (f.resourceArn || f.resourceId || '').trim();
  const unnamed = lang === 'en' ? 'unnamed resource' : 'recurso sin nombre';
  if (!raw) {
    return { serviceKey: null, serviceLabel: null, name: unnamed, region: null };
  }

  // arn:aws:lambda:eu-central-1:123456789012:function:my-fn
  // arn:aws:s3:::bucket-name
  const arn = /^arn:aws(?:-cn|-us-gov)?:([^:]+):([^:]*):([^:]*):(.+)$/i.exec(raw);
  if (arn) {
    const serviceKey = arn[1].toLowerCase();
    const region = arn[2] || null;
    let rest = arn[4];
    // function:name or function:name:alias
    if (serviceKey === 'lambda' && rest.startsWith('function:')) {
      rest = rest.slice('function:'.length).split(':')[0] || rest;
    } else if (rest.includes('/')) {
      rest = rest.split('/').pop() || rest;
    } else if (rest.includes(':')) {
      const parts = rest.split(':');
      rest = parts[parts.length - 1] || rest;
    }
    const labels = SERVICE_LABEL[serviceKey];
    return {
      serviceKey,
      serviceLabel: labels ? labels[lang] : serviceKey.toUpperCase(),
      name: rest || unnamed,
      region: region || null,
    };
  }

  // Infer service from checkId / title when ARN missing
  const hay = haystack(f);
  let serviceKey: string | null = null;
  if (/lambda|awslambda/.test(hay)) serviceKey = 'lambda';
  else if (/\bs3\b|bucket/.test(hay)) serviceKey = 's3';
  else if (/security.?group|ec2/.test(hay)) serviceKey = 'ec2';
  else if (/appsync|graphql/.test(hay)) serviceKey = 'appsync';
  else if (/api.?gateway|apigateway/.test(hay)) serviceKey = 'apigateway';

  let name = raw;
  if (name.length > 56) {
    name = name.includes('/')
      ? name.split('/').pop() || name.slice(0, 56)
      : `${name.slice(0, 22)}…${name.slice(-16)}`;
  }
  const labels = serviceKey ? SERVICE_LABEL[serviceKey] : null;
  return {
    serviceKey,
    serviceLabel: labels ? labels[lang] : null,
    name,
    region: null,
  };
}

const LAMBDA_PUBLIC: Record<UiLang, LocalePack> = {
  es: {
    headline: 'Una función Lambda es invocable desde Internet',
    why: 'Cualquiera puede llamarla: abuso, fuga de datos o factura por invocaciones.',
    action:
      'Revisá la política de la función o la Function URL y restringí quién puede invocarla (IAM / auth).',
    area: 'Aplicaciones',
  },
  en: {
    headline: 'A Lambda function is invokable from the internet',
    why: 'Anyone can call it: abuse, data leaks, or bill shock from invocations.',
    action:
      'Review the function policy or Function URL and restrict who can invoke it (IAM / auth).',
    area: 'Applications',
  },
};

function guardPackForService(
  f: FindingLike,
  pack: LocalePack,
  lang: UiLang,
  serviceKey: string | null,
): LocalePack {
  if (serviceKey !== 'lambda') return pack;
  const wrongNetRemediation =
    /grupo de seguridad|security group|puerto de red|network port/i.test(
      `${pack.headline} ${pack.action}`,
    );
  const genericExposure =
    /demasiado expuesto|too exposed|servicio demasiado|service is too exposed|recurso demasiado expuesto/i.test(
      pack.headline,
    );
  if (wrongNetRemediation || genericExposure) {
    return LAMBDA_PUBLIC[lang];
  }
  return pack;
}

function buildWhere(
  f: FindingLike,
  lang: UiLang,
  ref: AwsResourceRef,
): string {
  const region =
    (f.region && f.region !== 'global' && f.region !== 'unknown' ? f.region : null) ||
    ref.region;
  return [ref.name, region].filter(Boolean).join(' · ');
}

function buildAreaLabel(
  thematic: string,
  serviceLabel: string | null,
): string {
  if (serviceLabel && !thematic.toLowerCase().includes(serviceLabel.toLowerCase())) {
    return `${serviceLabel} · ${thematic}`;
  }
  return serviceLabel || thematic;
}

function buildContext(f: FindingLike, headline: string): string | null {
  const rationale = (f.rationale || '').trim();
  const title = (f.title || '').trim();

  // Preferir rationale técnico (StatusExtended) cuando aporta detalle del recurso
  const rationaleOk =
    rationale &&
    rationale.length > 20 &&
    !/revisar remediaci|security hub/i.test(rationale) &&
    rationale.toLowerCase() !== headline.toLowerCase();

  if (rationaleOk) {
    return rationale.length > 180 ? `${rationale.slice(0, 177)}…` : rationale;
  }

  if (!title) return null;
  if (/^\d+(\.\d+)+$/.test(title)) return null;
  if (/^[a-z0-9_.-]{12,}$/i.test(title) && !/\s/.test(title)) {
    const check = (f.checkId || '').trim();
    if (check && check.length < 80) return check;
    return null;
  }
  const short = title.length > 140 ? `${title.slice(0, 137)}…` : title;
  if (short.toLowerCase() === headline.toLowerCase()) return null;
  if (headline.length > 20 && short.toLowerCase().includes(headline.toLowerCase().slice(0, 28))) {
    return null;
  }
  return short;
}

function softenTechnical(
  text: string | null | undefined,
  fallback: string,
  lang: UiLang,
): string {
  const t = (text || '').trim();
  if (!t) return fallback;
  if (/^[a-z0-9_.-]{8,}$/i.test(t) && !/\s/.test(t)) return fallback;
  if (/revisar remediaci|documentaci[oó]n cis|security hub|cis \/ aws/i.test(t)) {
    return fallback;
  }
  if (lang === 'en') {
    return t
      .replace(/\bFAIL\b/gi, 'issue')
      .replace(/\bPASSED?\b/gi, 'ok')
      .replace(/\bwaste\b/gi, 'waste')
      .replace(/\bmisconfiguration[s]?\b/gi, 'misconfiguration');
  }
  return t
    .replace(/\bFAIL\b/gi, 'problema')
    .replace(/\bPASSED?\b/gi, 'ok')
    .replace(/\bwaste\b/gi, 'desperdicio')
    .replace(/\bmisconfiguration[s]?\b/gi, 'configuración incorrecta');
}

function pickPersisted(f: FindingLike, lang: UiLang): LocalePack | null {
  if (lang === 'en') {
    const headline = f.friendlyHeadlineEn?.trim();
    const why = f.friendlyWhyEn?.trim();
    const action = f.friendlyActionEn?.trim();
    if (headline && why && action) {
      return {
        headline,
        why,
        action,
        area: (f.friendlyAreaEn || f.friendlyArea || '').trim() || 'General',
      };
    }
  }
  const headline = (f.friendlyHeadlineEs || f.friendlyHeadline)?.trim();
  const why = (f.friendlyWhyEs || f.friendlyWhy)?.trim();
  const action = (f.friendlyActionEs || f.friendlyAction)?.trim();
  if (headline && why && action) {
    return {
      headline,
      why,
      action,
      area: (f.friendlyAreaEs || f.friendlyArea || '').trim() || 'General',
    };
  }
  return null;
}

export function friendlySeverity(
  severity: string | null | undefined,
  lang: UiLang = 'es',
): string {
  if (!severity) return lang === 'en' ? 'Medium' : 'Medio';
  return SEVERITY[lang][severity.toUpperCase()] ?? severity;
}

export function friendlyDomain(
  domain: string | null | undefined,
  lang: UiLang = 'es',
): string {
  if (!domain) return 'General';
  return DOMAIN[lang][domain.toLowerCase()] ?? domain;
}

function isHealthyStatusText(text: string | null | undefined): boolean {
  const t = (text || '').trim().toLowerCase();
  if (!t) return false;
  return (
    /no secrets?\s+found/.test(t) ||
    /secrets?\s+(?:were\s+)?not\s+found/.test(t) ||
    /\bis not publicly/.test(t) ||
    /\bdoes not (?:allow|have|expose)/.test(t) ||
    /\bis encrypted\b/.test(t) ||
    /\bmfa is enabled\b/.test(t) ||
    /\bcomplies with\b/.test(t) ||
    /\bpassing\b|\bpassed\b|\bstatus:\s*pass\b/.test(t) ||
    /\bno findings?\b/.test(t) ||
    /\bis compliant\b/.test(t)
  );
}

function isGenericAction(text: string | null | undefined): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  return /revisar remediaci|documentaci[oó]n cis|security hub|cis \/ aws|correcci[oó]n sugerida por tu equipo|fix suggested by your team|aplic[aá] la correcci[oó]n recomendada|apply the recommended fix/i.test(
    t,
  );
}

function cleanEvidence(text: string | null | undefined, max = 280): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  if (/^[a-z0-9_.-]{8,}$/i.test(t) && !/\s/.test(t)) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function consoleUrlFor(f: FindingLike, ref: AwsResourceRef): string | null {
  const region =
    (f.region && f.region !== 'global' && f.region !== 'unknown' ? f.region : null) ||
    ref.region;
  if (!region || !ref.serviceKey || !ref.name || ref.name.includes('sin nombre') || ref.name.includes('unnamed')) {
    return null;
  }
  const name = encodeURIComponent(ref.name);
  switch (ref.serviceKey) {
    case 'lambda':
      return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${name}?tab=code`;
    case 's3':
      return `https://s3.console.aws.amazon.com/s3/buckets/${name}?region=${region}`;
    case 'ec2':
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#SecurityGroups:`;
    case 'iam':
      return `https://console.aws.amazon.com/iam/home#/home`;
    case 'appsync':
      return `https://${region}.console.aws.amazon.com/appsync/home?region=${region}#/apis`;
    case 'dynamodb':
      return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#tables`;
    case 'logs':
      return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups`;
    default:
      return `https://${region}.console.aws.amazon.com/console/home?region=${region}`;
  }
}

function checkLabelOf(f: FindingLike): string | null {
  const id = (f.checkId || '').trim();
  if (!id) return null;
  if (id.length > 90) return `${id.slice(0, 87)}…`;
  return id;
}

function softTitle(f: FindingLike, lang: UiLang, fallback: string): string {
  const title = (f.title || '').trim();
  if (!title) return fallback;
  if (/^\d+(\.\d+)+$/.test(title)) return fallback;
  if (/^[a-z0-9_.-]{12,}$/i.test(title) && !/\s/.test(title)) {
    // slug técnico → humanizar un poco
    const pretty = title
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return pretty.length > 8 ? pretty : fallback;
  }
  return softenTechnical(title, fallback, lang);
}

function buildFallbackPack(f: FindingLike, lang: UiLang): LocalePack {
  const healthy = isHealthyStatusText(f.rationale) || isHealthyStatusText(f.title);
  const fallbackHeadline =
    lang === 'en'
      ? f.domain === 'finops'
        ? 'Cost-saving opportunity detected'
        : healthy
          ? 'Security control passed'
          : 'There is a security item to review'
      : f.domain === 'finops'
        ? 'Oportunidad de ahorro detectada'
        : healthy
          ? 'Control de seguridad verificado (OK)'
          : 'Hay un tema de seguridad para revisar';

  if (healthy) {
    return {
      headline: softTitle(f, lang, fallbackHeadline),
      why:
        lang === 'en'
          ? 'This check confirms the resource meets the expected control. It is information, not an open incident.'
          : 'Este control confirma que el recurso cumple lo esperado. Es información, no un incidente abierto.',
      action:
        lang === 'en'
          ? 'No fix is required. Keep this control in future scans.'
          : 'No hace falta corregir nada. Mantené este control en las próximas revisiones.',
      area: friendlyDomain(f.domain, lang),
    };
  }

  const isCost = findingDomain(f) === 'finops';
  const whyFallback = isCost
    ? lang === 'en'
      ? 'Fixing it usually lowers monthly cloud spend.'
      : 'Corregirlo suele bajar el gasto mensual en la nube.'
    : lang === 'en'
      ? 'Review it to reduce risk or unnecessary spend.'
      : 'Conviene revisarlo para reducir riesgo o gasto innecesario.';
  const actionFallback = isCost
    ? lang === 'en'
      ? 'Review the resource size/usage in the AWS console and apply the cheaper option.'
      : 'Revisá tamaño/uso del recurso en la consola de AWS y aplicá la opción más barata.'
    : lang === 'en'
      ? 'Open the resource in the AWS console, compare with the check below, and apply the fix.'
      : 'Abrí el recurso en la consola de AWS, contrastá con el detalle del control y aplicá la corrección.';

  let why = softenTechnical(f.rationale, whyFallback, lang);
  if (isHealthyStatusText(why) || why === (f.rationale || '').trim()) {
    const titleBit = (f.title || '').trim();
    if (titleBit && titleBit.length > 12 && lang === 'es') {
      why = isCost
        ? `El hallazgo «${titleBit.length > 80 ? titleBit.slice(0, 77) + '…' : titleBit}» indica gasto evitable en este recurso.`
        : `El control «${titleBit.length > 80 ? titleBit.slice(0, 77) + '…' : titleBit}» marcó un desvío en este recurso. Conviene corregirlo para bajar riesgo o deuda técnica.`;
    } else if (titleBit && titleBit.length > 12) {
      why = isCost
        ? `Finding “${titleBit.length > 80 ? titleBit.slice(0, 77) + '…' : titleBit}” points to avoidable spend on this resource.`
        : `The check “${titleBit.length > 80 ? titleBit.slice(0, 77) + '…' : titleBit}” flagged a deviation on this resource. Fixing it reduces risk or technical debt.`;
    }
  }

  let action = softenTechnical(
    isGenericAction(f.recommendedAction) ? null : f.recommendedAction,
    actionFallback,
    lang,
  );
  if (isGenericAction(action)) {
    action = actionFallback;
  }

  return {
    headline: softTitle(
      f,
      lang,
      isCost
        ? lang === 'en'
          ? 'Cost-saving opportunity detected'
          : 'Oportunidad de ahorro detectada'
        : fallbackHeadline,
    ),
    why,
    action,
    area: friendlyDomain(f.domain, lang),
  };
}

function finalize(
  f: FindingLike,
  lang: UiLang,
  pack: LocalePack,
): FriendlyFinding {
  const ref = parseAwsResource(f, lang);
  const guarded = guardPackForService(f, pack, lang, ref.serviceKey);
  const evidence = cleanEvidence(f.rationale);
  const remediation = isGenericAction(f.recommendedAction)
    ? null
    : cleanEvidence(f.recommendedAction, 320);
  const healthy =
    findingDomain(f) !== 'finops' &&
    !(f.category || '').toUpperCase().startsWith('COST_') &&
    (isHealthyStatusText(f.rationale) ||
      isHealthyStatusText(f.title) ||
      /control ok|control passed|no hay secretos|no secrets in/i.test(guarded.headline));

  const resourceRef = (f.resourceArn || f.resourceId || '').trim() || null;

  return {
    headline: guarded.headline,
    whyItMatters: guarded.why,
    whatToDo: guarded.action,
    where: buildWhere(f, lang, ref),
    urgencyLabel: friendlySeverity(f.severity, lang),
    areaLabel: buildAreaLabel(guarded.area || friendlyDomain(f.domain, lang), ref.serviceLabel),
    context: buildContext(f, guarded.headline),
    serviceLabel: ref.serviceLabel,
    isHealthy: healthy,
    evidence,
    remediation,
    checkLabel: checkLabelOf(f),
    technicalTitle: (f.title || '').trim() || null,
    consoleUrl: consoleUrlFor(f, ref),
    resourceRef,
  };
}

export function humanizeFinding(f: FindingLike, lang: UiLang = 'es'): FriendlyFinding {
  const hay = haystack(f);
  const domain = findingDomain(f);

  // Controles PASS / saludables: regla dedicada antes que persisted basura
  if (isHealthyStatusText(f.rationale) || isHealthyStatusText(f.title)) {
    const healthyRule = matchRule(f, hay);
    if (healthyRule && /control ok|no secrets|no hay secretos/i.test(healthyRule.es.headline)) {
      return finalize(f, lang, healthyRule[lang]);
    }
    return finalize(f, lang, buildFallbackPack(f, lang));
  }

  const matched = matchRule(f, hay);

  const persisted = pickPersisted(f, lang);
  if (persisted) {
    // ETL/persisted de seguridad no debe contaminar Costos
    if (domain === 'finops' && isSecurityCopy(persisted)) {
      if (matched) return finalize(f, lang, matched[lang]);
      return finalize(f, lang, buildFallbackPack(f, lang));
    }
    if (isHealthyStatusText(persisted.why) || isGenericAction(persisted.action)) {
      if (matched) return finalize(f, lang, matched[lang]);
      return finalize(f, lang, {
        headline: persisted.headline,
        why: buildFallbackPack(f, lang).why,
        action: isGenericAction(persisted.action)
          ? buildFallbackPack(f, lang).action
          : persisted.action,
        area: domain === 'finops' ? (lang === 'en' ? 'Cost' : 'Costos') : persisted.area,
      });
    }
    return finalize(f, lang, persisted);
  }

  if (matched) {
    return finalize(f, lang, matched[lang]);
  }

  return finalize(f, lang, buildFallbackPack(f, lang));
}
