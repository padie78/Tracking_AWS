# Komiser Fargate — inventario financiero on-demand (RunTask.sync)
# Binario oficial (GitHub releases) + AWS CLI + curl para export headless.
FROM debian:bookworm-slim

# Pin estable (cli.komiser.io es poco confiable en CI). Override: --build-arg KOMISER_VERSION=v3.1.21
ARG KOMISER_VERSION=v3.1.22

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      bash \
      python3 \
      awscli \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/trackaws /usr/local/bin

# Repo canónico de releases: mlabouardy/komiser (Linux amd64 → Fargate)
RUN set -eux; \
  curl -fsSL \
    "https://github.com/mlabouardy/komiser/releases/download/${KOMISER_VERSION}/komiser_Linux_x86_64" \
    -o /usr/local/bin/komiser; \
  chmod +x /usr/local/bin/komiser; \
  komiser version

COPY entrypoint.sh /opt/trackaws/entrypoint.sh
RUN chmod +x /opt/trackaws/entrypoint.sh

ENV PATH="/usr/local/bin:${PATH}"
ENTRYPOINT ["/opt/trackaws/entrypoint.sh"]
