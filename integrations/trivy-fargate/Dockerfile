# Trivy scanner for Track_AWS (ECR images in customer account)
FROM aquasec/trivy:0.66.0

USER root
RUN apk add --no-cache aws-cli python3 py3-pip bash \
    && mkdir -p /opt/trackaws

COPY entrypoint.sh /opt/trackaws/entrypoint.sh
COPY normalize_trivy.py /opt/trackaws/normalize_trivy.py
RUN chmod +x /opt/trackaws/entrypoint.sh

ENTRYPOINT ["/opt/trackaws/entrypoint.sh"]
