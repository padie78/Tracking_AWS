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
};

type LocalePack = {
  headline: string;
  why: string;
  action: string;
  area: string;
};

type Rule = {
  test: (hay: string) => boolean;
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
    test: (h) => /0\.0\.0\.0\/0|open.to.the.world|unrestricted|publicly.accessible/.test(h),
    es: {
      headline: 'Hay un servicio demasiado expuesto a Internet',
      why: 'Cuanto más abierto está, más fácil es que lo encuentren los bots.',
      action: 'Revisá el grupo de seguridad y limitá quién puede conectarse.',
      area: 'Red',
    },
    en: {
      headline: 'A service is too exposed to the internet',
      why: 'The more open it is, the easier it is for bots to find it.',
      action: 'Review the security group and limit who can connect.',
      area: 'Network',
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
    test: (h) => /iam|permission|policy|role|privilege/.test(h),
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
    test: (h) => /cloudtrail|logging|log.group|retention|audit.log/.test(h),
    es: {
      headline: 'El registro de actividad no está bien configurado',
      why: 'Sin buenos logs cuesta investigar un incidente o demostrar cumplimiento.',
      action: 'Activá/ajustá el registro y definí una retención razonable (p. ej. 30–90 días).',
      area: 'Cumplimiento',
    },
    en: {
      headline: 'Activity logging is not set up well',
      why: 'Without good logs it is hard to investigate incidents or prove compliance.',
      action: 'Enable/tune logging and set sensible retention (e.g. 30–90 days).',
      area: 'Compliance',
    },
  },
  {
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
  return [f.checkId, f.title, f.category, f.rationale, f.recommendedAction, f.domain]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function shortResource(
  resourceId: string | null | undefined,
  lang: UiLang,
): string {
  if (!resourceId) return lang === 'en' ? 'unnamed resource' : 'recurso sin nombre';
  const s = resourceId.trim();
  if (s.length <= 48) return s;
  if (s.includes('/')) {
    const parts = s.split('/');
    return parts[parts.length - 1] || s.slice(0, 48);
  }
  return `${s.slice(0, 20)}…${s.slice(-12)}`;
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

export function humanizeFinding(f: FindingLike, lang: UiLang = 'es'): FriendlyFinding {
  const urgencyLabel = friendlySeverity(f.severity, lang);
  const whereParts = [
    f.region && f.region !== 'global' && f.region !== 'unknown' ? f.region : null,
    shortResource(f.resourceId, lang),
  ].filter(Boolean);

  const persisted = pickPersisted(f, lang);
  if (persisted) {
    return {
      headline: persisted.headline,
      whyItMatters: persisted.why,
      whatToDo: persisted.action,
      where: whereParts.join(' · '),
      urgencyLabel,
      areaLabel: persisted.area || friendlyDomain(f.domain, lang),
    };
  }

  const matched = RULES.find((r) => r.test(haystack(f)));
  if (matched) {
    const pack = matched[lang];
    return {
      headline: pack.headline,
      whyItMatters: pack.why,
      whatToDo: pack.action,
      where: whereParts.join(' · '),
      urgencyLabel,
      areaLabel: pack.area,
    };
  }

  const fallbackHeadline =
    lang === 'en'
      ? f.domain === 'finops'
        ? 'Cost-saving opportunity detected'
        : 'There is a security item to review'
      : f.domain === 'finops'
        ? 'Oportunidad de ahorro detectada'
        : 'Hay un tema de seguridad para revisar';

  return {
    headline: softenTechnical(f.title, fallbackHeadline, lang),
    whyItMatters: softenTechnical(
      f.rationale,
      lang === 'en'
        ? 'Review it to reduce risk or unnecessary spend.'
        : 'Conviene revisarlo para reducir riesgo o gasto innecesario.',
      lang,
    ),
    whatToDo: softenTechnical(
      f.recommendedAction,
      lang === 'en'
        ? 'Open the resource in the AWS console and apply the fix suggested by your team.'
        : 'Abrí el detalle del recurso en la consola de AWS y aplicá la corrección sugerida por tu equipo.',
      lang,
    ),
    where: whereParts.join(' · '),
    urgencyLabel,
    areaLabel: friendlyDomain(f.domain, lang),
  };
}
