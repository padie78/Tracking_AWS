#!/usr/bin/env python3
"""AWS helpers for Trivy Fargate (boto3 — evita awscli Alpine/pyexpat roto)."""
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError


def _session_from_env() -> boto3.Session:
    return boto3.Session(
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.environ.get("AWS_SESSION_TOKEN"),
        region_name=os.environ.get("AWS_REGION", "eu-central-1"),
    )


def cmd_assume_role(args: argparse.Namespace) -> None:
    sts = boto3.client("sts", region_name=args.region)
    resp = sts.assume_role(
        RoleArn=args.role_arn,
        RoleSessionName=args.session_name[:64],
        ExternalId=args.external_id,
        DurationSeconds=args.duration,
    )
    creds = resp["Credentials"]
    print(
        json.dumps(
            {
                "AccessKeyId": creds["AccessKeyId"],
                "SecretAccessKey": creds["SecretAccessKey"],
                "SessionToken": creds["SessionToken"],
            }
        )
    )


def cmd_ecr_login(args: argparse.Namespace) -> None:
    ecr = _session_from_env().client("ecr")
    auth = ecr.get_authorization_token()
    data = (auth.get("authorizationData") or [None])[0]
    if not data:
        raise SystemExit("ECR authorizationData vacío")
    token = base64.b64decode(data["authorizationToken"]).decode("utf-8")
    # format: AWS:password
    password = token.split(":", 1)[1]
    registry = args.registry or data.get("proxyEndpoint", "").replace("https://", "")
    subprocess.run(
        [
            "trivy",
            "registry",
            "login",
            "--username",
            "AWS",
            "--password-stdin",
            registry,
        ],
        input=password.encode("utf-8"),
        check=False,
    )


def _json_default(o: Any) -> Any:
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return str(o)


def cmd_list_repos(args: argparse.Namespace) -> None:
    ecr = _session_from_env().client("ecr")
    repos: list[dict[str, Any]] = []
    try:
        paginator = ecr.get_paginator("describe_repositories")
        for page in paginator.paginate():
            repos.extend(page.get("repositories") or [])
    except (ClientError, BotoCoreError) as exc:
        print(f"[trivy-fargate] describe_repositories failed: {exc}", file=sys.stderr)
        repos = []
    Path(args.out).write_text(
        json.dumps({"repositories": repos}, default=_json_default),
        encoding="utf-8",
    )


def cmd_describe_images(args: argparse.Namespace) -> None:
    ecr = _session_from_env().client("ecr")
    try:
        paginator = ecr.get_paginator("describe_images")
        details: list[dict[str, Any]] = []
        for page in paginator.paginate(repositoryName=args.repository):
            details.extend(page.get("imageDetails") or [])
    except (ClientError, BotoCoreError) as exc:
        print(json.dumps({"imageDetails": [], "error": str(exc)}))
        return
    print(json.dumps({"imageDetails": details}, default=_json_default))


def cmd_s3_put(args: argparse.Namespace) -> None:
    s3 = _session_from_env().client("s3")
    body = Path(args.file).read_bytes()
    extra: dict[str, str] = {}
    if args.content_type:
        extra["ContentType"] = args.content_type
    if args.sse:
        extra["ServerSideEncryption"] = args.sse
    s3.put_object(Bucket=args.bucket, Key=args.key, Body=body, **extra)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_assume = sub.add_parser("assume-role")
    p_assume.add_argument("--role-arn", required=True)
    p_assume.add_argument("--external-id", required=True)
    p_assume.add_argument("--session-name", required=True)
    p_assume.add_argument("--region", default=os.environ.get("AWS_REGION", "eu-central-1"))
    p_assume.add_argument("--duration", type=int, default=3600)
    p_assume.set_defaults(func=cmd_assume_role)

    p_login = sub.add_parser("ecr-login")
    p_login.add_argument("--registry", default="")
    p_login.set_defaults(func=cmd_ecr_login)

    p_repos = sub.add_parser("list-repos")
    p_repos.add_argument("--out", required=True)
    p_repos.set_defaults(func=cmd_list_repos)

    p_imgs = sub.add_parser("describe-images")
    p_imgs.add_argument("--repository", required=True)
    p_imgs.set_defaults(func=cmd_describe_images)

    p_put = sub.add_parser("s3-put")
    p_put.add_argument("--bucket", required=True)
    p_put.add_argument("--key", required=True)
    p_put.add_argument("--file", required=True)
    p_put.add_argument("--content-type", default="application/json")
    p_put.add_argument("--sse", default="AES256")
    p_put.set_defaults(func=cmd_s3_put)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
