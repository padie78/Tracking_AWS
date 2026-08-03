"""
Matriz maestra de metadatos de negocio y cumplimiento (Enterprise).
Llaves = native_code específicos + finding_id macro.
"""

from __future__ import annotations

from typing import Final

from models import FindingMetadata

DICTIONARY_METADATA: Final[dict[str, FindingMetadata]] = {
    "aws_iam_user_mfa_enabled": {
        "aws_service": "IAM",
        "severity": "HIGH",
        "target_audience": "SysAdmin",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "5 mins",
        "rollback_risk": "NONE",
        "compliance": {
            "iso_27001": ["A.5.15", "A.8.5"],
            "soc_2": ["CC6.1", "CC6.6"],
            "pci_dss": ["8.4.1"],
        },
        "solution_slug": "activar-mfa",
        "macro_fallback": "SEC_IAM_HARDENING",
    },
    "iam_user_unused_credentials_90_days": {
        "aws_service": "IAM",
        "severity": "MEDIUM",
        "target_audience": "SysAdmin",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "15 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.5.15", "A.8.16"],
            "soc_2": ["CC6.1", "CC6.7"],
            "pci_dss": ["8.4.1", "8.6.3"],
        },
        "solution_slug": "rotar-credenciales-iam",
        "macro_fallback": "SEC_IAM_HARDENING",
    },
    "aws_security_group_ssh_open": {
        "aws_service": "EC2",
        "severity": "CRITICAL",
        "target_audience": "SysAdmin",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "10 mins",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.20", "A.8.16"],
            "soc_2": ["CC6.6", "CC6.7"],
            "pci_dss": ["1.2.1", "1.3.1"],
        },
        "solution_slug": "cerrar-puerto-ssh",
        "macro_fallback": "SEC_NETWORK_EXPOSED",
    },
    "ebs_volume_unattached": {
        "aws_service": "EBS",
        "severity": "MEDIUM",
        "target_audience": "Business_Owner",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "15 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.8.9"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["9.4.1"],
        },
        "solution_slug": "eliminar-disco-huerfano",
        "macro_fallback": "COST_EBS_UNUSED",
    },
    "ec2_instance_low_utilization": {
        "aws_service": "EC2",
        "severity": "MEDIUM",
        "target_audience": "Business_Owner",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "1 hour",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.9"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["12.8.1"],
        },
        "solution_slug": "reducir-tamano-ec2",
        "macro_fallback": "COST_EC2_OVERSIZED",
    },
    "cloudwatch_log_group_infinite_retention": {
        "aws_service": "CloudWatch",
        "severity": "LOW",
        "target_audience": "Developer",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "5 mins",
        "rollback_risk": "NONE",
        "compliance": {
            "iso_27001": ["A.8.10"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["10.5.1"],
        },
        "solution_slug": "limitar-retencion-logs",
        "macro_fallback": "COST_SERVERLESS_WASTE",
    },
    "api_gateway_no_auth": {
        "aws_service": "API_Gateway",
        "severity": "CRITICAL",
        "target_audience": "Developer",
        "remediation_type": "Code_Fix",
        "estimated_time_to_fix": "1 hour",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.5", "A.5.15"],
            "soc_2": ["CC6.1", "CC6.6"],
            "pci_dss": ["6.4.2", "7.2.1"],
        },
        "solution_slug": "proteger-api-gateway",
        "macro_fallback": "SEC_SERVERLESS_RISK",
    },
    "secrets_manager_secret_unencrypted": {
        "aws_service": "SecretsManager",
        "severity": "HIGH",
        "target_audience": "Developer",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "15 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.8.24"],
            "soc_2": ["CC6.1", "CC6.7"],
            "pci_dss": ["3.4.1", "8.3.2"],
        },
        "solution_slug": "cifrar-secreto",
        "macro_fallback": "SEC_SERVERLESS_RISK",
    },
    # —— macros ——
    "SEC_IAM_HARDENING": {
        "aws_service": "IAM",
        "severity": "HIGH",
        "target_audience": "SysAdmin",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "30 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.5.15", "A.8.5"],
            "soc_2": ["CC6.1", "CC6.6"],
            "pci_dss": ["8.4.1"],
        },
        "solution_slug": "fortalecer-iam",
    },
    "SEC_NETWORK_EXPOSED": {
        "aws_service": "EC2",
        "severity": "CRITICAL",
        "target_audience": "SysAdmin",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "20 mins",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.20"],
            "soc_2": ["CC6.6"],
            "pci_dss": ["1.2.1"],
        },
        "solution_slug": "cerrar-exposicion-red",
    },
    "COST_EBS_UNUSED": {
        "aws_service": "EBS",
        "severity": "MEDIUM",
        "target_audience": "Business_Owner",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "15 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.8.9"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["9.4.1"],
        },
        "solution_slug": "limpiar-ebs-sin-uso",
    },
    "COST_EC2_OVERSIZED": {
        "aws_service": "EC2",
        "severity": "MEDIUM",
        "target_audience": "Business_Owner",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "1 hour",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.9"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["12.8.1"],
        },
        "solution_slug": "rightsizing-ec2",
    },
    "COST_SERVERLESS_WASTE": {
        "aws_service": "CloudWatch",
        "severity": "LOW",
        "target_audience": "Developer",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "10 mins",
        "rollback_risk": "NONE",
        "compliance": {
            "iso_27001": ["A.8.10"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["10.5.1"],
        },
        "solution_slug": "recortar-gasto-serverless",
    },
    "SEC_SERVERLESS_RISK": {
        "aws_service": "Lambda",
        "severity": "HIGH",
        "target_audience": "Developer",
        "remediation_type": "Code_Fix",
        "estimated_time_to_fix": "1 hour",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.5", "A.8.24"],
            "soc_2": ["CC6.1", "CC6.6"],
            "pci_dss": ["6.4.2", "3.4.1"],
        },
        "solution_slug": "asegurar-serverless",
    },
    "SEC_VULNERABILITY": {
        "aws_service": "ECR",
        "severity": "HIGH",
        "target_audience": "Developer",
        "remediation_type": "Code_Fix",
        "estimated_time_to_fix": "1 hour",
        "rollback_risk": "MEDIUM",
        "compliance": {
            "iso_27001": ["A.8.8"],
            "soc_2": ["CC7.1", "CC7.2"],
            "pci_dss": ["6.3.3", "6.4.2"],
        },
        "solution_slug": "parchear-cve",
    },
    "SEC_GENERIC_ALERT": {
        "aws_service": "SecurityHub",
        "severity": "MEDIUM",
        "target_audience": "SysAdmin",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "30 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.8.16"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["12.10.1"],
        },
        "solution_slug": "revisar-alerta-seguridad",
    },
    "COST_GENERIC_ALERT": {
        "aws_service": "CostExplorer",
        "severity": "LOW",
        "target_audience": "Business_Owner",
        "remediation_type": "Console_Click",
        "estimated_time_to_fix": "30 mins",
        "rollback_risk": "LOW",
        "compliance": {
            "iso_27001": ["A.8.9"],
            "soc_2": ["CC7.2"],
            "pci_dss": ["12.8.1"],
        },
        "solution_slug": "revisar-alerta-costo",
    },
}


COST_FINDING_IDS: Final[frozenset[str]] = frozenset(
    {
        "COST_EBS_UNUSED",
        "COST_EC2_OVERSIZED",
        "COST_SERVERLESS_WASTE",
        "COST_GENERIC_ALERT",
        "ebs_volume_unattached",
        "ec2_instance_low_utilization",
        "cloudwatch_log_group_infinite_retention",
    }
)
