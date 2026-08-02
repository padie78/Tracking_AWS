# Trivy Fargate — Debian + binary Trivy (evita Alpine pyexpat roto del apk aws-cli/pip)
FROM aquasec/trivy:0.66.0 AS trivybin

FROM python:3.12-slim-bookworm

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      bash \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir 'boto3>=1.34,<2' \
    && mkdir -p /opt/trackaws

COPY --from=trivybin /usr/local/bin/trivy /usr/local/bin/trivy
COPY entrypoint.sh /opt/trackaws/entrypoint.sh
COPY normalize_trivy.py /opt/trackaws/normalize_trivy.py
COPY aws_ops.py /opt/trackaws/aws_ops.py
RUN chmod +x /opt/trackaws/entrypoint.sh /opt/trackaws/aws_ops.py /usr/local/bin/trivy

ENV PATH="/usr/local/bin:${PATH}"
ENTRYPOINT ["/opt/trackaws/entrypoint.sh"]
