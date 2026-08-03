"""
locales/en.json — simulado en código.
Dos niveles: native_code específico + finding_id macro de respaldo.
Marcadores: {gb}, {instance_type}, {retention_days}, {calculated_savings}
"""

from __future__ import annotations

from typing import Final

from models import LocaleEntry

LOCALES_EN: Final[dict[str, LocaleEntry]] = {
    # —— native codes ——
    "aws_iam_user_mfa_enabled": {
        "explanation": (
            "A user account can sign in without MFA (a second check on your phone). "
            "That is like leaving the office door unlocked."
        ),
        "business_impact": (
            "If someone steals a password, they can enter your cloud and change or delete "
            "critical systems. Turn on MFA for every human user."
        ),
    },
    "iam_user_unused_credentials_90_days": {
        "explanation": (
            "There are access keys or passwords that nobody has used for 90+ days. "
            "Forgotten keys are a common way attackers get in."
        ),
        "business_impact": (
            "Old unused credentials raise the chance of a silent breach. Disable or delete "
            "them so only active people keep access."
        ),
    },
    "aws_security_group_ssh_open": {
        "explanation": (
            "SSH (remote admin access) is open to the whole internet (0.0.0.0/0). "
            "Anyone can try passwords against your servers."
        ),
        "business_impact": (
            "Exposed SSH is a top cause of ransomware and crypto-mining on cloud servers. "
            "Restrict it to your office IP or a VPN."
        ),
    },
    "ebs_volume_unattached": {
        "explanation": (
            "You are paying for a disk ({gb} GB, type tied to pricing) that is not attached "
            "to any running server — like renting a storage unit you never open."
        ),
        "business_impact": (
            "Estimated waste ≈ ${calculated_savings}/month. Snapshot if needed, then delete "
            "or attach the volume to stop the bleed."
        ),
    },
    "ec2_instance_low_utilization": {
        "explanation": (
            "Server type {instance_type} is mostly idle. You pay as if it worked full time "
            "(~730 hours/month)."
        ),
        "business_impact": (
            "Downsizing or stopping off-hours can free about ${calculated_savings}/month "
            "without changing what the app does for customers."
        ),
    },
    "cloudwatch_log_group_infinite_retention": {
        "explanation": (
            "Logs are kept forever (retention_days={retention_days} means no expiry). "
            "Storage cost grows every month even if nobody reads old logs."
        ),
        "business_impact": (
            "Setting a sensible retention (e.g. 30–90 days) can save about "
            "${calculated_savings}/month while keeping recent logs for support."
        ),
    },
    "api_gateway_no_auth": {
        "explanation": (
            "A public API endpoint accepts requests without login or API keys — "
            "anyone on the internet can call it."
        ),
        "business_impact": (
            "Attackers can abuse the API (data theft, spam, bill shock). Add authentication "
            "before exposing it outside your company."
        ),
    },
    "secrets_manager_secret_unencrypted": {
        "explanation": (
            "A secret (password, API key) is stored without the expected encryption controls."
        ),
        "business_impact": (
            "If that secret leaks, attackers reuse it across systems. Fix encryption and "
            "rotate the secret immediately."
        ),
    },
    # —— macro fallbacks ——
    "SEC_IAM_HARDENING": {
        "explanation": (
            "We found an identity/access weakness (users, keys, or permissions)."
        ),
        "business_impact": (
            "Weak access controls are how most cloud breaches start. Tighten who can log in "
            "and what they can do."
        ),
    },
    "SEC_NETWORK_EXPOSED": {
        "explanation": (
            "A network rule leaves a service reachable from too many places on the internet."
        ),
        "business_impact": (
            "Open ports invite scanners and bots. Narrow who can connect to reduce breach risk."
        ),
    },
    "COST_EBS_UNUSED": {
        "explanation": (
            "Unused disk storage is still billed (~{gb} GB counted toward savings)."
        ),
        "business_impact": (
            "Cleaning unused disks can save about ${calculated_savings}/month."
        ),
    },
    "COST_EC2_OVERSIZED": {
        "explanation": (
            "Compute capacity ({instance_type}) looks larger than needed for the workload."
        ),
        "business_impact": (
            "Rightsizing typically recovers about ${calculated_savings}/month."
        ),
    },
    "COST_SERVERLESS_WASTE": {
        "explanation": (
            "Serverless/logging spend is higher than needed (retention_days={retention_days})."
        ),
        "business_impact": (
            "Tuning retention or idle resources can save about ${calculated_savings}/month."
        ),
    },
    "SEC_SERVERLESS_RISK": {
        "explanation": (
            "A serverless component (API, function, or secret) has a security gap."
        ),
        "business_impact": (
            "These gaps often lead to data leaks or unexpected usage bills. Fix auth and "
            "encryption first."
        ),
    },
    "SEC_VULNERABILITY": {
        "explanation": (
            "A known software vulnerability (CVE) was detected in an image or package."
        ),
        "business_impact": (
            "Unpatched CVEs are actively exploited on the internet. Patch or rebuild the "
            "image as soon as possible."
        ),
    },
    "SEC_GENERIC_ALERT": {
        "explanation": (
            "We detected a security issue that needs review (details in the technical log)."
        ),
        "business_impact": (
            "Treat it as a priority until a specialist confirms it is safe to ignore."
        ),
    },
    "COST_GENERIC_ALERT": {
        "explanation": (
            "We detected a cost inefficiency that may waste budget every month."
        ),
        "business_impact": (
            "Estimated opportunity ≈ ${calculated_savings}/month. Review and act if the "
            "saving is material for your company."
        ),
    },
}
