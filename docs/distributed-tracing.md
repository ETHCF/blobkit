# Distributed Tracing

BlobKit Proxy Server includes basic distributed tracing support for request correlation and debugging.

## Overview

The tracing system provides:

- Automatic trace ID generation for each request
- Request correlation in logs
- Basic performance timing
- Error tracking with trace context

## HTTP Headers

The proxy server uses these headers for trace propagation:

- `X-Trace-Id`: Unique identifier for the request
- `X-Span-Id`: Identifier for the current operation

### Example Request

```bash
curl -X POST http://localhost:3000/api/v1/blob/write \
  -H "Content-Type: application/json" \
  -H "X-BlobKit-Signature: v1:..." \
  -d @blob-request.json
```

The server will automatically generate trace IDs if not provided.

## Trace Context in Logs

All log entries include trace context:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "service": "BlobRoute",
  "message": "Blob write completed successfully",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "spanId": "661e8400-e29b-41d4-a716-446655440001",
  "jobId": "0x123..."
}
```

## Configuration

Tracing is automatically enabled. To disable or adjust logging:

```bash
LOG_LEVEL=debug  # Options: debug, info, warn, error
```

## Integration with Monitoring

The proxy server exposes Prometheus metrics that can be correlated with traces:

- `blobkit_http_request_duration_seconds` - Request duration by endpoint
- `blobkit_blob_submissions_total` - Blob submission counts
- `blobkit_errors_total` - Error counts by type

Access metrics at: `http://localhost:3000/metrics`

## Future Enhancements

The current implementation provides basic tracing. Future versions may add:

- OpenTelemetry export support
- Distributed tracing across SDK and proxy
- Trace sampling configuration
- Integration with APM providers (Datadog, New Relic, etc.)
