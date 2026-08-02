# Official Prowler image + Track_AWS entrypoint (AssumeRole → scan → S3)
FROM prowlercloud/prowler:5.36.0

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      awscli \
      python3 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /home/prowler/.venv/bin/prowler /usr/local/bin/prowler

ENV PATH="/home/prowler/.venv/bin:/home/prowler/.local/bin:${PATH}"

COPY entrypoint.sh /opt/trackaws/entrypoint.sh
COPY normalize_prowler.py /opt/trackaws/normalize_prowler.py
RUN chmod +x /opt/trackaws/entrypoint.sh

ENTRYPOINT ["/opt/trackaws/entrypoint.sh"]
