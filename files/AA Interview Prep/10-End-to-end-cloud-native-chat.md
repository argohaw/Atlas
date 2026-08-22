# 11. End-to-End Cloud-Native Architecture

Practice explaining this:

```text
                     Users
                       ↓
                 DNS / HTTPS
                       ↓
                Load Balancer
                       ↓
                 Ingress Layer
                       ↓
                 API Gateway
                       ↓
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
 Booking Service  Flight Service   Customer Service
       ↓               ↓                ↓
     Booking DB     Flight DB       Customer DB
       ↓
 BookingCreated Event
       ↓
   Kafka / MSK Topic
       ├───────────────┬────────────────┐
       ↓               ↓                ↓
 Payment Service  Notification    Analytics
       ↓
   Payment DB
```

## Explain the design

### Availability

- Multiple application replicas
- Health probes
- Load balancing
- Managed database availability strategy
- Replication appropriate to each dependency

### Scalability

- Horizontal pod autoscaling
- Kafka partition-based consumer parallelism
- Load balancing
- Database scaling/read strategies where appropriate

### Reliability

- Timeouts
- Retries with backoff
- Circuit breakers
- Idempotency
- DLQ/retry mechanisms
- Outbox pattern

### Security

- TLS
- IAM least privilege
- Secrets management
- Network restrictions
- Authentication/authorization

### Observability

- Structured logs
- Metrics
- Distributed tracing
- Correlation IDs
- Alerts

### Deployment

```text
Code
 ↓
Build
 ↓
Tests
 ↓
Security/quality checks
 ↓
Docker image
 ↓
Registry
 ↓
Deployment pipeline
 ↓
Kubernetes rolling deployment
 ↓
Health verification
```