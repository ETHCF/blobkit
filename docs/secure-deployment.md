# Secure Deployment Guide

This guide covers secure deployment practices for the BlobKit proxy server in production environments.

## Key Management

The proxy server requires a private key to sign blob transactions. **Never store private keys in plain text in production.**

### Supported Key Management Options

#### 1. AWS Key Management Service (KMS)

**Recommended for AWS deployments**

```bash
# Set up AWS KMS key
export AWS_KMS_KEY_ID="arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
export AWS_REGION="us-east-1"

# The proxy will automatically use KMS
npm start
```

**Prerequisites:**

- Install AWS SDK: `npm install @aws-sdk/client-kms`
- Configure AWS credentials (IAM role recommended)
- Create an asymmetric ECC_SECG_P256K1 key in KMS
- Grant permissions to use the key

**IAM Policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["kms:Sign", "kms:GetPublicKey"],
      "Resource": "arn:aws:kms:region:account:key/key-id"
    }
  ]
}
```

#### 2. Environment Variable (Development Only)

**For development and testing only**

```bash
export PRIVATE_KEY="0x..."
```

## Network Security

### 1. TLS/HTTPS

Always use HTTPS in production:

```nginx
server {
    listen 443 ssl http2;
    server_name proxy.example.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 2. Rate Limiting

Configure rate limits via environment variables:

```bash
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
```

### 3. Request Signing

Enable request signing between SDK and proxy:

```bash
REQUEST_SIGNING_SECRET="minimum-32-character-secret-here"
```

## Monitoring

### Prometheus Metrics

The proxy exposes metrics at `/metrics`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'blobkit-proxy'
    static_configs:
      - targets: ['proxy.example.com:3000']
```

Key metrics to monitor:

- `blobkit_blob_submissions_total` - Submission success/failure rates
- `blobkit_errors_total` - Error counts by type
- `blobkit_job_processing_duration_seconds` - Performance metrics

### Logging

Configure structured JSON logging:

```bash
LOG_LEVEL=info  # debug, info, warn, error
NODE_ENV=production
```

## Docker Deployment

Use the provided Dockerfile:

```bash
# Build
docker build -t blobkit-proxy .

# Run with environment file
docker run -d \
  --name blobkit-proxy \
  --env-file .env.production \
  -p 3000:3000 \
  blobkit-proxy
```

## Health Checks

Configure health check endpoints:

- `/api/v1/health` - Basic health status
- `/api/v1/health/detailed` - Detailed system status

```bash
# Kubernetes example
livenessProbe:
  httpGet:
    path: /api/v1/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

## Environment Variables

Required for production:

```bash
# Network
RPC_URL=$MAINNET_RPC_URL
CHAIN_ID=1

# Security
AWS_KMS_KEY_ID=arn:aws:kms:...  # OR use PRIVATE_KEY for dev
REQUEST_SIGNING_SECRET=your-32-char-secret

# Redis
REDIS_URL=redis://redis.example.com:6379

# Contracts
ESCROW_CONTRACT=0x...

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
```

## Security Checklist

- [ ] Private key secured in KMS (not environment variable)
- [ ] HTTPS/TLS enabled
- [ ] Request signing configured
- [ ] Rate limiting enabled
- [ ] Monitoring and alerting set up
- [ ] Regular security updates applied
- [ ] Access logs enabled
- [ ] Firewall rules configured
- [ ] Redis password protected
- [ ] No default or test values in production
