# Official Prowler image + Track_AWS entrypoint (AssumeRole → scan → S3)
FROM prowlercloud/prowler:4.5.0

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      awscli \
      python3 \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /opt/trackaws/entrypoint.sh
COPY normalize_prowler.py /opt/trackaws/normalize_prowler.py
RUN chmod +x /opt/trackaws/entrypoint.sh

# Task role credentials come from ECS; entrypoint assumes customer role
ENTRYPOINT ["/opt/trackaws/entrypoint.sh"]
