# Imagen oficial Prowler + AWS Lambda Runtime Interface Client
FROM prowlercloud/prowler:4.5.0

USER root
RUN python3 -m pip install --no-cache-dir awslambdaric boto3 \
    && apt-get update && apt-get install -y --no-install-recommends awscli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/task
COPY handler.py normalize_prowler.py ./

# Lambda container entrypoint
ENTRYPOINT [ "python3", "-m", "awslambdaric" ]
CMD [ "handler.handler" ]
