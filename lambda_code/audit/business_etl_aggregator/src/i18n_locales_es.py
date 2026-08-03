"""
locales/es.json — simulado en código.
Explicaciones orientadas a novatos / negocio (“con manzanas”).
Marcadores: {gb}, {instance_type}, {retention_days}, {calculated_savings}
"""

from __future__ import annotations

from typing import Final

from models import LocaleEntry

LOCALES_ES: Final[dict[str, LocaleEntry]] = {
    "aws_iam_user_mfa_enabled": {
        "explanation": (
            "Un usuario puede entrar sin doble verificación (MFA en el celular). "
            "Es como dejar la puerta de la oficina sin llave."
        ),
        "business_impact": (
            "Si alguien roba la contraseña, puede entrar a tu nube y cambiar o borrar "
            "sistemas críticos. Activá MFA en todos los usuarios humanos."
        ),
    },
    "iam_user_unused_credentials_90_days": {
        "explanation": (
            "Hay claves o contraseñas sin usar hace más de 90 días. Las credenciales "
            "olvidadas son una puerta típica para atacantes."
        ),
        "business_impact": (
            "Aumenta el riesgo de una filtración silenciosa. Desactivá o borrá lo que "
            "ya no se usa; dejá acceso solo a quien trabaja hoy."
        ),
    },
    "aws_security_group_ssh_open": {
        "explanation": (
            "El acceso remoto SSH está abierto a todo Internet (0.0.0.0/0). "
            "Cualquiera puede intentar entrar a tus servidores."
        ),
        "business_impact": (
            "Es una causa frecuente de ransomware y minado de criptomonedas. "
            "Limitá el acceso a la IP de la oficina o a una VPN."
        ),
    },
    "ebs_volume_unattached": {
        "explanation": (
            "Estás pagando un disco de {gb} GB que no está conectado a ningún servidor: "
            "como alquilar un depósito que nunca abrís."
        ),
        "business_impact": (
            "Desperdicio estimado ≈ ${calculated_savings}/mes. Sacá un respaldo si hace "
            "falta y después borrá o conectá el disco."
        ),
    },
    "ec2_instance_low_utilization": {
        "explanation": (
            "El servidor tipo {instance_type} está casi sin trabajo. Pagás como si "
            "trabajara todo el mes (~730 horas)."
        ),
        "business_impact": (
            "Bajar de tamaño o apagarlo fuera de horario puede liberar unos "
            "${calculated_savings}/mes sin cambiar lo que ve el cliente."
        ),
    },
    "cloudwatch_log_group_infinite_retention": {
        "explanation": (
            "Los logs se guardan para siempre (retention_days={retention_days} = sin "
            "vencimiento). El costo de almacenamiento crece cada mes."
        ),
        "business_impact": (
            "Poner retención razonable (30–90 días) puede ahorrar unos "
            "${calculated_savings}/mes y alcanza para soporte reciente."
        ),
    },
    "api_gateway_no_auth": {
        "explanation": (
            "Una API pública acepta pedidos sin login ni claves: cualquiera en Internet "
            "puede llamar."
        ),
        "business_impact": (
            "Pueden robar datos, saturar el servicio o inflar la factura. Agregá "
            "autenticación antes de exponerla fuera de la empresa."
        ),
    },
    "secrets_manager_secret_unencrypted": {
        "explanation": (
            "Un secreto (contraseña o clave de API) no tiene el cifrado esperado."
        ),
        "business_impact": (
            "Si se filtra, el atacante reutiliza el acceso en otros sistemas. Corregí el "
            "cifrado y rotá el secreto ya."
        ),
    },
    "SEC_IAM_HARDENING": {
        "explanation": (
            "Detectamos una debilidad de identidad o permisos (usuarios, claves o roles)."
        ),
        "business_impact": (
            "El acceso débil es el origen más común de brechas en la nube. Ajustá quién "
            "entra y qué puede hacer."
        ),
    },
    "SEC_NETWORK_EXPOSED": {
        "explanation": (
            "Una regla de red deja un servicio alcanzable desde demasiados lugares de Internet."
        ),
        "business_impact": (
            "Puertos abiertos atraen escáneres y bots. Reducí quién puede conectarse."
        ),
    },
    "COST_EBS_UNUSED": {
        "explanation": (
            "Hay almacenamiento en disco sin uso (~{gb} GB) que igual se factura."
        ),
        "business_impact": (
            "Limpiarlo puede ahorrar unos ${calculated_savings}/mes."
        ),
    },
    "COST_EC2_OVERSIZED": {
        "explanation": (
            "La capacidad de cómputo ({instance_type}) parece más grande de lo necesario."
        ),
        "business_impact": (
            "Ajustar el tamaño suele recuperar unos ${calculated_savings}/mes."
        ),
    },
    "COST_SERVERLESS_WASTE": {
        "explanation": (
            "Hay gasto serverless/logs más alto de lo necesario "
            "(retention_days={retention_days})."
        ),
        "business_impact": (
            "Afinar retención o recursos idle puede ahorrar unos ${calculated_savings}/mes."
        ),
    },
    "SEC_SERVERLESS_RISK": {
        "explanation": (
            "Un componente serverless (API, función o secreto) tiene un hueco de seguridad."
        ),
        "business_impact": (
            "Suelen terminar en filtraciones o facturas sorpresa. Priorizá auth y cifrado."
        ),
    },
    "SEC_VULNERABILITY": {
        "explanation": (
            "Hay una vulnerabilidad conocida (CVE) en una imagen o paquete de software."
        ),
        "business_impact": (
            "Los CVE sin parche se explotan activamente. Actualizá o reconstruí la imagen."
        ),
    },
    "SEC_GENERIC_ALERT": {
        "explanation": (
            "Detectamos un tema de seguridad que conviene revisar (detalle en el log técnico)."
        ),
        "business_impact": (
            "Tratalo como prioridad hasta que alguien confirme que es seguro ignorarlo."
        ),
    },
    "COST_GENERIC_ALERT": {
        "explanation": (
            "Detectamos una ineficiencia de costos que puede desperdiciar presupuesto cada mes."
        ),
        "business_impact": (
            "Oportunidad estimada ≈ ${calculated_savings}/mes. Actuá si el monto importa "
            "para el negocio."
        ),
    },
}
