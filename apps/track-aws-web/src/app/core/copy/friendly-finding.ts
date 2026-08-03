/**
 * Capa de copy amigable para novatos / negocio.
 * No cambia datos en Dynamo: solo presenta findings técnicos en español claro.
 */

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
};

export type FriendlyFinding = {
  headline: string;
  whyItMatters: string;
  whatToDo: string;
  where: string;
  urgencyLabel: string;
  areaLabel: string;
};

const SEVERITY_ES: Record<string, string> = {
  CRITICAL: 'Crítico',
  HIGH: 'Alto',
  MEDIUM: 'Medio',
  LOW: 'Bajo',
  INFO: 'Info',
};

const DOMAIN_ES: Record<string, string> = {
  secops: 'Seguridad',
  finops: 'Costos',
  architecture: 'Arquitectura',
};

type Rule = {
  test: (hay: string) => boolean;
  headline: string;
  why: string;
  action: string;
  area: string;
};

const RULES: Rule[] = [
  {
    test: (h) => /mfa|multi.factor|2fa/.test(h),
    headline: 'Falta la doble verificación (MFA) en un usuario',
    why: 'Si alguien roba la contraseña, puede entrar a tu nube sin freno.',
    action: 'Activá MFA para ese usuario desde la consola de IAM (tarda unos minutos).',
    area: 'Accesos',
  },
  {
    test: (h) => /unused.credential|access.key.*90|credential.*90|stale.*key/.test(h),
    headline: 'Hay claves de acceso viejas sin usar',
    why: 'Las claves olvidadas son una puerta típica para ataques silenciosos.',
    action: 'Desactivá o borrá las claves que nadie usa hace más de 90 días.',
    area: 'Accesos',
  },
  {
    test: (h) => /root/.test(h) && /(mfa|access|key|user)/.test(h),
    headline: 'La cuenta raíz está demasiado expuesta',
    why: 'La cuenta root es la “llave maestra”. Si se filtra, pierden el control total.',
    action: 'Usá un usuario admin con MFA y evitá usar root en el día a día.',
    area: 'Accesos',
  },
  {
    test: (h) => /ssh|port.?22|0\.0\.0\.0\/0.*22|security.group.*ssh/.test(h),
    headline: 'El acceso remoto SSH está abierto a Internet',
    why: 'Cualquiera puede intentar entrar a tus servidores (ransomware, minado, etc.).',
    action: 'Cerrá el puerto 22 al mundo y dejalo solo para tu oficina o VPN.',
    area: 'Red',
  },
  {
    test: (h) => /rdp|port.?3389|0\.0\.0\.0\/0.*3389/.test(h),
    headline: 'Escritorio remoto (RDP) abierto a Internet',
    why: 'Es un blanco frecuente de ataques automatizados.',
    action: 'Restringí el puerto 3389 a IPs conocidas o usá un bastión/VPN.',
    area: 'Red',
  },
  {
    test: (h) => /0\.0\.0\.0\/0|open.to.the.world|unrestricted|publicly.accessible/.test(h),
    headline: 'Hay un servicio demasiado expuesto a Internet',
    why: 'Cuanto más abierto está, más fácil es que lo encuentren los bots.',
    action: 'Revisá el grupo de seguridad y limitá quién puede conectarse.',
    area: 'Red',
  },
  {
    test: (h) => /s3.*public|bucket.*public|public.*bucket|block.public/.test(h),
    headline: 'Un almacenamiento S3 puede verse desde fuera',
    why: 'Datos de clientes o backups pueden filtrarse sin que lo notes.',
    action: 'Activá el bloqueo de acceso público y revisá las políticas del bucket.',
    area: 'Almacenamiento',
  },
  {
    test: (h) => /ebs.*unattached|unattached.*ebs|volume.*not.attach|disco.*huerf|sin adjunt/.test(h),
    headline: 'Estás pagando un disco que no está en uso',
    why: 'Es como alquilar un depósito vacío: el cargo sigue todos los meses.',
    action: 'Sacá un respaldo si hace falta y borrá o reconectá el disco.',
    area: 'Costos',
  },
  {
    test: (h) => /elastic.?ip|eip.*idle|idle.*eip|eip.*unassoci/.test(h),
    headline: 'Hay una IP pública que no está asociada',
    why: 'AWS cobra por IPs elásticas sin usar.',
    action: 'Liberá la IP o asociala a un recurso que la necesite.',
    area: 'Costos',
  },
  {
    test: (h) => /rightsiz|sobredimension|low.util|underutil|cpu.*low|idle.*instance/.test(h),
    headline: 'Hay un servidor más grande de lo necesario',
    why: 'Pagás potencia que casi no se usa.',
    action: 'Bajá de tamaño o apagalo fuera de horario laboral.',
    area: 'Costos',
  },
  {
    test: (h) => /moderniz|t2\b|legacy.*instance/.test(h),
    headline: 'Hay servidores de generación vieja',
    why: 'Las familias nuevas suelen dar más rendimiento por el mismo dinero.',
    action: 'Planificá migrar a una familia moderna (por ejemplo t3) con una prueba corta.',
    area: 'Costos',
  },
  {
    test: (h) => /encryption|unencrypted|not.encrypt|sin cifr/.test(h),
    headline: 'Hay datos o secretos sin el cifrado esperado',
    why: 'Si alguien accede al medio de almacenamiento, puede leer información sensible.',
    action: 'Activá cifrado (KMS) y rotá secretos si estaban expuestos.',
    area: 'Datos',
  },
  {
    test: (h) => /cve-|vulnerab|trivy|package.*severity/.test(h),
    headline: 'Hay una falla conocida en el software (CVE)',
    why: 'Los atacantes buscan estas fallas en Internet apenas se publican.',
    action: 'Actualizá el paquete o reconstruí la imagen con versiones parcheadas.',
    area: 'Aplicaciones',
  },
  {
    test: (h) => /iam|permission|policy|role|privilege/.test(h),
    headline: 'Hay permisos más amplios de lo recomendable',
    why: 'Si una cuenta o rol se compromete, el daño puede extenderse a toda la nube.',
    action: 'Reducí permisos al mínimo necesario (principio de menor privilegio).',
    area: 'Accesos',
  },
  {
    test: (h) => /cloudtrail|logging|log.group|retention|audit.log/.test(h),
    headline: 'El registro de actividad no está bien configurado',
    why: 'Sin buenos logs cuesta investigar un incidente o demostrar cumplimiento.',
    action: 'Activá/ajustá el registro y definí una retención razonable (p. ej. 30–90 días).',
    area: 'Cumplimiento',
  },
  {
    test: (h) => /api.gateway|no.auth|without.auth|unauthenticated/.test(h),
    headline: 'Una API pública no pide autenticación',
    why: 'Cualquiera puede usarla: riesgo de abuso, datos filtrados o factura inflada.',
    action: 'Agregá login, API keys o un autorizador antes de exponerla.',
    area: 'Aplicaciones',
  },
];

function haystack(f: FindingLike): string {
  return [f.checkId, f.title, f.category, f.rationale, f.recommendedAction, f.domain]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function shortResource(resourceId: string | null | undefined): string {
  if (!resourceId) return 'recurso sin nombre';
  const s = resourceId.trim();
  if (s.length <= 48) return s;
  if (s.includes('/')) {
    const parts = s.split('/');
    return parts[parts.length - 1] || s.slice(0, 48);
  }
  return `${s.slice(0, 20)}…${s.slice(-12)}`;
}

function softenTechnical(text: string | null | undefined, fallback: string): string {
  const t = (text || '').trim();
  if (!t) return fallback;
  // Evita pegar check_ids crudos como único mensaje
  if (/^[a-z0-9_.-]{8,}$/i.test(t) && !/\s/.test(t)) return fallback;
  return t
    .replace(/\bFAIL\b/gi, 'problema')
    .replace(/\bPASSED?\b/gi, 'ok')
    .replace(/\bwaste\b/gi, 'desperdicio')
    .replace(/\bmisconfiguration[s]?\b/gi, 'configuración incorrecta');
}

export function friendlySeverity(severity: string | null | undefined): string {
  if (!severity) return 'Medio';
  return SEVERITY_ES[severity.toUpperCase()] ?? severity;
}

export function friendlyDomain(domain: string | null | undefined): string {
  if (!domain) return 'General';
  return DOMAIN_ES[domain.toLowerCase()] ?? domain;
}

export function humanizeFinding(f: FindingLike): FriendlyFinding {
  const hay = haystack(f);
  const matched = RULES.find((r) => r.test(hay));
  const urgencyLabel = friendlySeverity(f.severity);
  const whereParts = [
    f.region && f.region !== 'global' && f.region !== 'unknown' ? f.region : null,
    shortResource(f.resourceId),
  ].filter(Boolean);

  if (matched) {
    return {
      headline: matched.headline,
      whyItMatters: matched.why,
      whatToDo: matched.action,
      where: whereParts.join(' · '),
      urgencyLabel,
      areaLabel: matched.area,
    };
  }

  // Fallback: limpiar título técnico sin inventar hechos
  const headline = softenTechnical(
    f.title,
    f.domain === 'finops'
      ? 'Oportunidad de ahorro detectada'
      : 'Hay un tema de seguridad para revisar',
  );
  return {
    headline,
    whyItMatters: softenTechnical(
      f.rationale,
      'Conviene revisarlo para reducir riesgo o gasto innecesario.',
    ),
    whatToDo: softenTechnical(
      f.recommendedAction,
      'Abrí el detalle del recurso en la consola de AWS y aplicá la corrección sugerida por tu equipo.',
    ),
    where: whereParts.join(' · '),
    urgencyLabel,
    areaLabel: friendlyDomain(f.domain),
  };
}
