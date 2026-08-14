---
tags: [lld, easy, library-design, amazon-interview]
---
# LLD: Design a Logging Library (like Log4j)

## 🎯 Why This Problem is Asked
A logging library is the **textbook Chain of Responsibility + Observer** problem. Amazon asks it because logging is infrastructure code — it must be extensible (new appenders), configurable (log levels), and have zero performance impact on the calling code. It directly tests your understanding of the patterns used in real production systems.

---

## 📋 Requirements Clarification

**Functional:**
- Log levels: TRACE < DEBUG < INFO < WARN < ERROR < FATAL
- Multiple appenders: Console, File, Database, Remote (HTTP)
- Log format: timestamp, level, thread, class, message
- Filter logs below a configured minimum level
- Support multiple loggers with hierarchical naming (`com.amazon.service`)

**Non-Functional:**
- Async logging — calling thread must never block on I/O
- Thread-safe
- Configurable at runtime without restart
- Logging overhead < 1μs on the calling thread (hot path)

---

## 🧩 Core Entities & Enums

```java
public enum LogLevel {
    TRACE(0), DEBUG(1), INFO(2), WARN(3), ERROR(4), FATAL(5);
    private final int priority;
}

public class LogMessage {
    private final LogLevel level;
    private final String message;
    private final String loggerName;
    private final long timestamp;
    private final String threadName;
    private final Throwable throwable; // optional
}

public interface Appender {
    void append(LogMessage message);
    void setFormatter(Formatter formatter);
}

public interface Formatter {
    String format(LogMessage message);
}

public class Logger {
    private final String name;
    private LogLevel minLevel;
    private final List<Appender> appenders;
}

public class LoggerFactory {
    private static final Map<String, Logger> registry = new ConcurrentHashMap<>();
    public static Logger getLogger(String name) { /* ... */ }
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Chain of Responsibility (Log Level Filtering)

```java
public abstract class LogHandler {
    protected LogLevel level;
    protected LogHandler next;

    public LogHandler setNext(LogHandler next) {
        this.next = next;
        return next; // fluent chaining
    }

    public void handle(LogMessage msg) {
        if (msg.getLevel().getPriority() >= this.level.getPriority()) {
            write(msg);
        }
        if (next != null) next.handle(msg);
    }

    protected abstract void write(LogMessage msg);
}

public class ConsoleHandler extends LogHandler {
    protected void write(LogMessage msg) {
        System.out.println(formatter.format(msg));
    }
}

public class FileHandler extends LogHandler {
    private final BufferedWriter writer;
    protected void write(LogMessage msg) {
        writer.write(formatter.format(msg));
    }
}
```

**Why Chain of Responsibility?** Each handler decides independently whether to process a message. Chain: `DEBUG → File → WARN → Console → ERROR → PagerDuty`. Adding a new handler = new class, no changes to existing handlers.

### Pattern: Strategy (Formatters)

```java
public class PatternFormatter implements Formatter {
    private final String pattern; // "[%level] %timestamp %logger - %msg"

    @Override
    public String format(LogMessage msg) {
        return pattern
            .replace("%level",     msg.getLevel().name())
            .replace("%timestamp", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(msg.getTimestamp()))
            .replace("%logger",    msg.getLoggerName())
            .replace("%thread",    msg.getThreadName())
            .replace("%msg",       msg.getMessage());
    }
}

public class JsonFormatter implements Formatter {
    @Override
    public String format(LogMessage msg) {
        return String.format(
            "{\"level\":\"%s\",\"time\":%d,\"logger\":\"%s\",\"msg\":\"%s\"}",
            msg.getLevel(), msg.getTimestamp(), msg.getLoggerName(), msg.getMessage()
        );
    }
}
```

**Why JSON formatter matters:** In production, logs go to a centralized log aggregation system (ELK, CloudWatch Logs, Loki). Structured JSON logs are machine-parseable — you can query `level=ERROR AND service=order-service` in milliseconds. Unstructured text logs require slow regex.

### Pattern: Decorator (AsyncAppender — Non-Blocking)

```java
public class AsyncAppender implements Appender {
    private final Appender delegate;
    private final BlockingQueue<LogMessage> queue = new LinkedBlockingQueue<>(10_000);

    public AsyncAppender(Appender delegate) {
        this.delegate = delegate;
        Thread worker = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    delegate.append(queue.take());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        worker.setDaemon(true);
        worker.start();
    }

    @Override
    public void append(LogMessage message) {
        if (!queue.offer(message)) {
            // Queue full — apply overflow policy
            // Options: drop (metrics/analytics), block (critical logs), drop oldest
        }
    }
}
```

**Why Decorator?** `AsyncAppender` wraps *any* `Appender` and makes it non-blocking. The calling thread (HTTP handler, business logic) enqueues the message in < 1μs and continues. The background thread handles the actual I/O. This is exactly how Log4j 2's `AsyncAppender` and Logback's `AsyncAppender` work.

### Logger Hierarchy

```java
public class LoggerFactory {
    private static final Map<String, Logger> registry = new ConcurrentHashMap<>();

    public static Logger getLogger(String name) {
        return registry.computeIfAbsent(name, n -> {
            Logger logger = new Logger(n);
            String parentName = n.contains(".") ? n.substring(0, n.lastIndexOf('.')) : "root";
            Logger parent = registry.get(parentName);
            if (parent != null) logger.inheritAppenders(parent);
            return logger;
        });
    }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Queue full in async mode | Drop oldest (ring buffer) or block — configurable overflow policy |
| File rotation | `RollingFileAppender` — rotate by size (100MB) or date (daily) |
| Exception in appender | Catch and log to stderr — never propagate to caller |
| Null message | Guard in `Logger.log()` before creating `LogMessage` |
| Shutdown hook | Flush queue and close file handles on JVM shutdown |

---

## �️ Database Design

### Logging Infrastructure Storage Strategy

| Component | Storage | Rationale |
|---|---|---|
| **Hot logs** | Loki or Kafka | Real-time streaming logs from app instances. Query last 24 hours instantly. Query: `{job="order-service", level="ERROR"}` |
| **Archive** | S3 or GCS | Long-term storage (compliance: keep 7 years). Compressed to gzip (90% reduction) |
| **Metrics** | Prometheus + TSDB | Structured metrics: log lines/sec, error rate, top 10 error types. Query: `rate(log_lines_total[5m])` |
| **Trace correlation** | Elasticsearch (optional) | Distributed traces: trace_id → all logs across microservices. Essential for debugging multi-service issues |

**Schema & Rationale:**

```
Loki log stream:
  Labels: { job="order-service", level="ERROR", pod="pod-1" }
  Line:   2024-01-15T10:30:45.123Z | thread=main | msg="Order creation failed" | order_id="12345" | duration_ms=250

Prometheus metric:
  log_lines_total{job="order-service", level="error"} 1523  (time series)
  log_errors_by_type{type="TIMEOUT"} 342
  log_errors_by_type{type="PERMISSION_DENIED"} 98
  log_errors_by_type{type="DATABASE_ERROR"} 187
```

**PostgreSQL Schema (for alerting rules & log retention policies):**

```sql
CREATE TABLE log_retention_policies (
  job_name VARCHAR(100) PRIMARY KEY,
  hot_retention_days INT DEFAULT 7,    -- in Loki
  archive_retention_years INT DEFAULT 7,  -- in S3
  sampling_rate DECIMAL(3,2) DEFAULT 1.0,  -- 1.0 = keep all; 0.1 = keep 10%
  alert_on_error_rate_pct DECIMAL(5,2) DEFAULT 5.0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE alert_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  rule_name VARCHAR(100),
  condition VARCHAR(500),  -- e.g., "error_rate > 1%"
  severity VARCHAR(20),     -- "WARNING", "CRITICAL"
  notify_channel VARCHAR(50),  -- "slack", "pagerduty", "email"
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Why Loki for Real-Time Logs?
- ✅ Designed for logs (unlike Elasticsearch which is general-purpose)
- ✅ Label-based indexing (fast queries on structured metadata)
- ✅ No full-text indexing overhead
- ✅ Compresses logs 90% for storage efficiency
- ❌ Don't use raw files — unqueryable at scale

### Sample Rate for Cost Control
```
At 100k logs/sec across all services:
  Without sampling: 8.64B logs/day = 8.6TB/day (expensive)
  With 10% sampling: 864M logs/day = 860GB/day (affordable)
  
Alert rules still use full stream (don't sample error logs!)
```

---

## 🔌 API Routes & Contracts

### Logging Infrastructure API (If Exposed as Service)

```
POST   /api/v1/logs (from application)
├─ Request:  {
│     "level": "INFO",
│     "message": "Order created",
│     "jobName": "order-service",
│     "traceId": "abc123",
│     "spanId": "xyz789",
│     "fields": { "order_id": "12345", "user_id": "alice", "amount": 99.99 }
│   }
├─ Response: 204 No Content (async, never blocks)
├─ Latency:  < 1μs (queue.offer() on calling thread)
└─ Buffering: async appender batches 100 logs, sends every 100ms

GET    /api/v1/logs
├─ Query:    ?query={job="order-service", level="ERROR"}&limit=1000&start=1h_ago
├─ Response: [
│     {
│       "timestamp": "2024-01-15T10:30:45.123Z",
│       "level": "ERROR",
│       "message": "Payment failed",
│       "traceId": "abc123",
│       "fields": { "order_id": "12345", "reason": "CARD_DECLINED" }
│     },
│     ...
│   ]
├─ Powered by: Loki with label indexing
└─ Latency:  < 500ms for 1000 logs from hot storage

GET    /api/v1/errors/top-types
├─ Query:    ?job=order-service&period=1d&limit=10
├─ Response: [
│     { "error_type": "TIMEOUT", "count": 342, "sampleSize": 5 },
│     { "error_type": "PERMISSION_DENIED", "count": 98, "sampleSize": 3 },
│     { "error_type": "DATABASE_ERROR", "count": 187, "sampleSize": 4 }
│   ]
└─> Aggregated from metrics, not individual logs

GET    /api/v1/traces/{traceId}
├─ Response: All logs with traceId="abc123" across all services
│   ├─ order-service: "Order created"
│   ├─ payment-service: "Payment initiated"
│   ├─ payment-service: "Card validation succeeded"
│   ├─ order-service: "Order completed"
└─> Essential for debugging cross-service flows

GET    /api/v1/health
├─ Response: { "status": "healthy", "kafka_lag_ms": 50, "loki_push_latency_ms": 2 }
└─> Operational health of the logging pipeline itself

GET    /api/v1/metrics
├─ Response: Prometheus format
│   log_lines_total{job="order-service", level="info"} 145_000
│   log_lines_total{job="order-service", level="error"} 1_523
│   log_errors_by_type{type="TIMEOUT"} 342
│   async_appender_queue_depth{job="order-service"} 250
│   async_appender_queue_max{job="order-service"} 10_000
└─> Scrape interval: every 15 seconds
```

### Log Format Contract (Structured Logging)

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO|WARN|ERROR|FATAL",
  "logger": "com.amazon.order.OrderService",
  "thread": "main",
  "message": "Order created successfully",
  "traceId": "abc123def456",      // for correlation across services
  "spanId": "xyz789",                // for distributed tracing
  "context": {                       // business-specific fields
    "order_id": "12345",
    "user_id": "alice",
    "amount": 99.99,
    "currency": "USD"
  },
  "exception": null,                 // null if no error
  "duration_ms": 150
}
```

---

## 🏗️ Service Architecture

### Logging Infrastructure (Distributed)

```
┌──────────────────────────────────┐
│   Application Instance           │
│  (Logger instance in-process)    │
└──────────────┬───────────────────┘
               │ <1μs (queue.offer)
               │
    ┌──────────▼──────────┐
    │ AsyncAppender       │
    │ (BlockingQueue)     │
    └──────────┬──────────┘
               │ (background thread)
               │
    ┌──────────▼──────────┐
    │ Kafka Producer      │
    │ (batches 100 logs)  │
    └──────────┬──────────┘
               │
        ┌──────▼──────────┐
        │  Kafka Broker   │
        │ (partitioned by │
        │  trace_id)      │
        └──────┬──────────┘
               │
    ┌──────────┴──────────┬──────────┐
    │                     │          │
┌───▼────────┐  ┌────────▼──┐  ┌───▼────────┐
│Loki        │  │Prometheus │  │S3 Archive  │
│Aggregator  │  │Exporter   │  │(cold logs) │
│(hot: 7d)   │  │(metrics)  │  │(archive)   │
└───┬────────┘  └────┬──────┘  └────────────┘
    │                │
┌───▼────────┐  ┌────▼──────┐
│Grafana     │  │AlertManager
│(query UI)  │  │ (rules)    │
└────────────┘  └────────────┘
```

### Service Components

| Component | Role | Responsibility |
|---|---|---|
| **Logger** | In-process | Capture logs, apply level filter, batch messages |
| **AsyncAppender** | Async queue | Non-blocking enqueue; background thread handles I/O |
| **Appender hierarchy** | Routing | Chain of Responsibility: DEBUG → file, ERROR → Kafka, FATAL → PagerDuty |
| **Kafka Producer** | Buffering & durability | Buffer 100 logs, send every 100ms; retry on failure |
| **Loki Aggregator** | Indexing | Ingest from Kafka, index by labels, compress, store |
| **Prometheus Exporter** | Metrics | Emit structured metrics (errors/sec, latency) |
| **Archive Service** | Long-term storage | Compress logs, move old data to S3 (cold tier) |

### Log Flow in Detail

```
1. Application calls: logger.error("Payment failed", order_id=12345)
    │
    ├─> Logger.error() runs immediately
    │   ├─> Check level: ERROR >= threshold? ✓
    │   ├─> Create LogMessage object {level, msg, context, timestamp}
    │   └─> Call appenders (< 50ns)
    │
    ├─> Chain of Responsibility:
    │   ├─> DEBUGAppender: level check fails (ERROR >= DEBUG) ✓ → appends to file
    │   ├─> WARNAppender: level check fails (ERROR >= WARN) ✓ → appends to file
    │   ├─> ERRORAppender: level check passes (ERROR >= ERROR) ✓ → adds to Kafka queue
    │   └─> FATALAppender: level check fails (ERROR < FATAL) ✗ → skip
    │
    ├─> Queue.offer() ← THIS IS THE HOT PATH
    │   └─> BlockingQueue.offer(logMessage) in O(1), < 1μs
    │   └─> Calling thread returns immediately
    │
    └─> Return to application code (< 1μs elapsed)

2. Background thread (async appender):
    │
    ├─> Every 100ms (or when queue has 100 items):
    │   ├─> batch.clear(); queue.drainTo(batch, 100)
    │   ├─> Serialize batch to JSON lines
    │   ├─> Produce to Kafka: kafkaProducer.send(batch)
    │   │   └─> Latency: ~5ms (network to broker)
    │   └─> Increment metric: logs_sent_total{count=100}
    │
    └─> On failure: retry with exponential backoff (1s, 2s, 4s, ... 60s)

3. Kafka → Loki ingestion pipeline:
    │
    ├─> Loki receives log stream from Kafka
    ├─> Extract labels: job="order-service", level="ERROR", trace_id="abc123"
    ├─> Index labels (columnar store for fast queries)
    ├─> Store log line compressed (gzip)
    └─> Write to disk (SSD for hot tier, S3 for archive)

4. Query time (e.g., Grafana dashboard):
    │
    ├─> Query: { level="ERROR", job="order-service" }
    ├─> Loki uses label index → instantly find matching streams (ms)
    ├─> Decompress and return logs
    └─> Grafana visualizes
```

### Per-Service Configuration

```yaml
# In application configuration
logging:
  level: INFO
  appenders:
    - type: ASYNC_KAFKA
      level: ERROR
      topic: "logs-errors"
      batchSize: 100
      batchIntervalMs: 100
    - type: FILE
      level: DEBUG
      path: "/var/log/app.log"
      maxSizeBytes: 104857600  # 100MB
      maxBackups: 10
    - type: ALERTING
      level: FATAL
      provider: "pagerduty"
      escalation: "ops-team"
  
  sampling:
    traceIdSampleRate: 1.0  # keep all trace logs for debugging
    defaultSampleRate: 0.1  # keep 10% of INFO/DEBUG logs for cost
```

### Observability of Logging System

```
Metrics to monitor the logging pipeline itself:
  - kafka_producer_lag_ms (how far behind we are)
  - async_appender_queue_depth (approaching max?)
  - async_appender_queue_overflow_total (dropped logs due to full queue?)
  - loki_ingestion_latency_ms (is Loki keeping up?)
  - archive_service_s3_upload_latency_s (cold tier performance)

Alerts:
  - If queue_depth > 8000 (80% of 10k max): send WARNING
  - If queue_overflow > 0: send CRITICAL (we're losing logs)
  - If loki_lag > 60s: send WARNING (lag in ingestion)
```

---

## �📐 Scalability & HLD Thinking

**Scalability:**
- The logging library runs in-process — it scales with the application. The bottleneck is I/O (file writes, network calls to remote appenders).
- **Throughput:** with `AsyncAppender` + `BlockingQueue(10_000)`, the calling thread is never blocked. The background thread can sustain ~100K log writes/sec to a local file (limited by disk I/O). For higher throughput: use a **ring buffer** (LMAX Disruptor — used by Log4j 2's async mode) instead of `BlockingQueue` — 10x lower latency, 10x higher throughput.

**Latency:**
- **Hot path (calling thread):** level check (integer comparison) + queue offer (CAS operation) = < 1μs. This is the critical constraint — logging must never add measurable latency to business logic.
- **Cold path (background thread):** format message + write to file/network. Latency here doesn't matter — it's async.
- **Latency budget for the hot path:**
  - Level check: ~1ns
  - `LogMessage` object allocation: ~50ns
  - `queue.offer()`: ~100ns (CAS)
  - Total: ~150ns ≈ 0.15μs ✅

**Consistency:**
- Log ordering: within a single thread, logs are ordered (FIFO queue). Across threads, logs may be interleaved — this is expected and acceptable. Include `threadName` and `timestamp` in every log message for correlation.
- **Log loss:** with async logging, a JVM crash can lose messages in the queue. For critical logs (audit, security), use a **synchronous appender** or flush the queue on shutdown hook.

**Availability:**
- If the file appender fails (disk full): catch the exception, log to stderr, increment a metric. Never propagate to the caller — a logging failure must never crash the application.
- If the remote appender (HTTP/Kafka) fails: retry with exponential backoff in the background thread. Buffer up to queue capacity. If queue fills: apply overflow policy (drop or block).
- **Graceful degradation:** if all appenders fail, fall back to stderr. The application continues running.

**Observability (meta — observing the observer):**
- Metrics: log messages/sec per level, queue depth, queue overflow count, appender error rate, background thread lag
- Alert: queue depth > 8,000 (80% full) → risk of overflow; background thread lag > 1 second → I/O bottleneck
- This is the **observability of the observability system** — critical because a broken logger means you're flying blind during incidents.

---

## 🗣️ How to Explain in the Interview

> "The two key patterns are Chain of Responsibility for routing messages to handlers, and Decorator for the `AsyncAppender`. The `AsyncAppender` wraps any appender and makes it non-blocking — the calling thread enqueues in < 1μs and continues. The background thread handles I/O. I use JSON formatter because logs go to a centralized system — structured logs are queryable in milliseconds. For critical audit logs, I'd use a synchronous appender — async logging can lose messages on JVM crash. The logging library itself needs observability: queue depth and overflow metrics tell me when I'm about to lose logs."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | `Logger` logs, `Appender` writes, `Formatter` formats — each one job |
| **O** | New appender = new class implementing `Appender` |
| **D** | `Logger` depends on `Appender` interface, not `ConsoleAppender` |
