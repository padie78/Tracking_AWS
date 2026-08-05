# Komiser Fargate — inventario financiero on-demand (RunTask.sync)
# Binario oficial + AWS CLI + curl para export headless vía API local.
FROM debian:bookworm-slim

ARG KOMISER_VERSION=latest
ARG TARGETARCH=amd64

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      bash \
      python3 \
      awscli \
      wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/trackaws /usr/local/bin

# Binario Linux x86_64 (Fargate default). Pin: KOMISER_VERSION=v3.1.21
RUN set -eux; \
  if [ "${KOMISER_VERSION}" = "latest" ]; then \
    wget -q "https://cli.komiser.io/latest/komiser_Linux_x86_64" -O /usr/local/bin/komiser; \
  else \
    wget -q "https://github.com/tailwarden/komiser/releases/download/${KOMISER_VERSION}/komiser_Linux_x86_64" -O /usr/local/bin/komiser \
      || wget -q "https://cli.komiser.io/latest/komiser_Linux_x86_64" -O /usr/local/bin/komiser; \
  fi; \
  chmod +x /usr/local/bin/komiser; \
  komiser version || true

COPY entrypoint.sh /opt/trackaws/entrypoint.sh
RUN chmod +x /opt/trackaws/entrypoint.sh

ENV PATH="/usr/local/bin:${PATH}"
ENTRYPOINT ["/opt/trackaws/entrypoint.sh"]
