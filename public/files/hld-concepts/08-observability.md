---
tags: [hld, observability, monitoring, amazon-interview]
---
# HLD: Observability & Operations

## 🎯 Why This is Asked
"How do you know your system is healthy?" is a standard Amazon HLD closing question. Observability is the difference between a system you can operate and one you're flying blind. Amazon's own systems are built on the three pillars: metrics, logs, and traces. Knowing these cold shows operational maturity.

---

## 🔭 The Three Pillars of Observability

```
                    ┌─────────────────────────────────────┐
                    │         Observability                │
                    └──────────┬──────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
          Metrics            Logs            Traces
    (What is happening)  (What happened)  (Why it happened)
    CloudWatch, Datadog  CloudWatch Logs  X-Ray, Jaeger
    Prometheus, Grafana  ELK, Loki        Zipkin, Tempo
```

---

## 📊 Metrics

**Definition:** Numeric measurements aggregated over time — the pulse of your system.

### The Four Golden Signals (Google SRE)

| Signal | What It Measures | Alert When |
|---|---|---|
| **Latency** | Time to serve a request (p50, p99, p999) | p99 > SLO threshold |
| **Traffic** | Requests per second | Sudden spike or drop |
| **Errors** | Error rate (5xx / total) | Error rate > 1% |
| **Saturation** | How "full" the system is (CPU, memory, queue depth) | CPU > 80%, queue > 10K |

### RED Method (for services)

- **R**ate — requests per second
- **E**rrors — error rate
- **D**uration — latency distribution

### USE Method (for infrastructure)

- **U**tilization — % of time resource is busy
- **S**aturation — queue depth, wait time
- **E**rrors — error count

### Metric Types

```
Counter:   monotonically increasing (total requests, total errors)
Gauge:     point-in-time value (current connections, memory usage)
Histogram: distribution of values (request latency buckets)
Summary:   pre-computed percentiles (p50, p95, p99)
```

### Percentiles vs Averages

**Never use averages for latency.** A p99 of 2000ms hidden by a p50 of 10ms means 1% of users (10,000 out of 1M) are having a terrible experience.

```
Request latencies: [10, 12, 11, 10, 13, 10, 11, 10, 12, 2000]

Average: 209ms  ← misleading
p50:      11ms  ← typical user
p99:    2000ms  ← 1% of users are suffering
```

### Dashboards

```
┌─────────────────────────────────────────────────────────┐
│  Service Health Dashboard                               │
├──────────────┬──────────────┬──────────────┬────────────┤
│  RPS: 12,450 │ Error: 0.02% │ p99: 45ms    │ CPU: 34%   │
├──────────────┴──────────────┴──────────────┴────────────┤
│  [Latency over time graph]  [Error rate graph]          │
│  [RPS graph]                [DB connection pool graph]  │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Logging

**Definition:** Timestamped records of discrete events — what happened and when.

### Structured Logging (JSON)

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "ERROR",
  "service": "order-service",
  "traceId": "abc123def456",
  "userId": "user-789",
  "orderId": "order-456",
  "event": "payment_failed",
  "reason": "insufficient_funds",
  "duration_ms": 234,
  "environment": "production"
}
```

**Why structured?** Machine-parseable. You can query: `level=ERROR AND service=order-service AND event=payment_failed` in seconds. Unstructured logs require regex — slow and brittle.

### Log Levels

| Level | When to Use |
|---|---|
| `TRACE` | Extremely detailed — method entry/exit (dev only) |
| `DEBUG` | Diagnostic info — variable values, branch taken |
| `INFO` | Normal operations — request received, order created |
| `WARN` | Unexpected but recoverable — retry attempt, cache miss |
| `ERROR` | Failure requiring attention — payment failed, DB timeout |
| `FATAL` | System cannot continue — unrecoverable error |

**Production:** INFO and above. Never log sensitive data (passwords, card numbers, tokens).

### Log Aggregation Pipeline

```
Service Instances
      │
      │ (structured JSON logs)
      ▼
Log Shipper (Fluentd/Filebeat)
      │
      ▼
Log Storage & Search
  ├── Elasticsearch + Kibana (ELK)
  ├── CloudWatch Logs + Insights
  └── Grafana Loki (cost-efficient)
```

### What to Log

| ✅ Log | ❌ Don't Log |
|---|---|
| Request received (method, path, user ID) | Passwords, tokens, card numbers |
| Business events (order placed, payment failed) | PII without masking |
| Errors with stack traces | High-frequency debug logs in production |
| External service calls (duration, status) | Binary/blob data |

---

## 🔍 Distributed Tracing

**Definition:** Following a single request as it flows through multiple services — finding where latency comes from.

### Trace Structure

```
Trace ID: abc123
│
├── Span: API Gateway (5ms)
│
├── Span: Order Service (45ms)
│   ├── Span: Redis cache lookup (2ms) → MISS
│   ├── Span: DB query (35ms)          ← BOTTLENECK
│   └── Span: Redis cache write (3ms)
│
├── Span: Inventory Service (12ms)
│   └── Span: DynamoDB read (10ms)
│
└── Span: Notification Service (8ms)
    └── Span: SQS publish (6ms)

Total: 70ms
```

### Trace Context Propagation

```java
// Service A creates a trace
String traceId = UUID.randomUUID().toString();
String spanId  = UUID.randomUUID().toString();

// Pass to Service B via HTTP header
request.setHeader("X-Trace-Id", traceId);
request.setHeader("X-Span-Id",  spanId);

// Service B reads and creates child span
String parentSpanId = request.getHeader("X-Span-Id");
String childSpanId  = UUID.randomUUID().toString();
// Record: traceId, childSpanId, parentSpanId, service, duration
```

**W3C Trace Context standard:** `traceparent: 00-{traceId}-{spanId}-01`

### Tools

| Tool | Strengths |
|---|---|
| **AWS X-Ray** | Native AWS integration, service map |
| **Jaeger** | Open-source, Kubernetes-native |
| **Zipkin** | Lightweight, simple |
| **Datadog APM** | Full-stack observability, ML anomaly detection |
| **OpenTelemetry** | Vendor-neutral SDK — instrument once, export anywhere |

---

## 🚨 Alerting & On-Call

### Alert Design Principles

**Alert on symptoms, not causes:**
- ✅ "p99 latency > 500ms for 5 minutes" (user-facing symptom)
- ❌ "CPU > 80%" (cause — may not affect users)

**Alert on SLO burn rate:**
```
SLO: 99.9% of requests succeed (error budget: 0.1% = 43.8 min/month)

Alert when burning budget too fast:
  1-hour burn rate > 14.4x normal → page immediately (burning 1 hour of budget in 5 min)
  6-hour burn rate > 6x normal   → ticket (burning 1 day of budget in 4 hours)
```

### Runbook
Every alert must have a runbook — a step-by-step guide for the on-call engineer:

```markdown
## Alert: OrderService p99 > 500ms

### Likely Causes
1. DB slow queries (check CloudWatch DB metrics)
2. Redis cache miss spike (check cache hit rate)
3. Downstream service timeout (check Inventory Service health)

### Steps
1. Check Grafana dashboard: [link]
2. Check recent deployments: `kubectl rollout history deployment/order-service`
3. If DB: run `EXPLAIN ANALYZE` on slow query log
4. If cache: check Redis memory usage, eviction rate
5. Escalate to: @db-oncall if DB, @platform-oncall if infra
```

---

## 📈 SLI / SLO / Error Budget

### Defining SLIs

```
Availability SLI:  successful_requests / total_requests
Latency SLI:       requests_under_200ms / total_requests
Freshness SLI:     data_updated_within_5min / total_data_points
```

### Setting SLOs

```
Availability SLO: 99.9% of requests succeed over a 30-day window
Latency SLO:      95% of requests complete in < 200ms

Error budget = 1 - SLO = 0.1% = 43.8 minutes of downtime per month
```

### Error Budget Policy

```
Error budget remaining > 50%:  ship features freely
Error budget remaining 25-50%: slow down, add reliability work
Error budget remaining < 25%:  freeze feature work, focus on reliability
Error budget exhausted:        no new features until budget replenishes
```

> *"I'd define an SLO of 99.9% availability and p99 latency < 200ms. I'd set up CloudWatch alarms on the four golden signals with PagerDuty integration. Every alert has a runbook. The error budget policy means the team automatically shifts to reliability work when we're burning budget too fast — no manager needed to make that call."*

---

## 🗣️ How to Mention Observability in an Interview

After designing each component, add:

> *"I'd instrument this service with OpenTelemetry — metrics to CloudWatch, traces to X-Ray, logs to CloudWatch Logs. The key metrics are RPS, error rate, and p99 latency. I'd set up a dashboard with the four golden signals and alert on SLO burn rate. Every service exposes a `/health` endpoint that the load balancer polls every 10 seconds."*
