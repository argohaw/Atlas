---
tags: [lld, easy, parsing, amazon-interview]
---
# LLD: Design a JSON Parser

## 🎯 Why This Problem is Asked
A JSON parser tests your knowledge of **recursive descent parsing**, the **Composite pattern** (JSON values are recursive), and clean error handling. Amazon asks this to see if you can translate a formal grammar into clean OOP code without reaching for a library.

---

## 📋 Requirements Clarification

**Functional:**
- Parse a JSON string into an in-memory object tree
- Support all JSON types: `null`, `boolean`, `number`, `string`, `array`, `object`
- Throw descriptive errors on invalid JSON with position info

**Non-Functional:**
- In-memory, no I/O
- Extensible for serialization (JSON → String) as well
- Parsing must be O(N) in input length — no backtracking

---

## 🧩 Core Entities & Enums

```java
public enum JsonType { NULL, BOOLEAN, NUMBER, STRING, ARRAY, OBJECT }

// Composite pattern: every JSON value is a JsonNode
public abstract class JsonNode {
    public abstract JsonType getType();
    public abstract String toJsonString(); // serialization
}

public class JsonNull    extends JsonNode { /* singleton */ }
public class JsonBoolean extends JsonNode { private final boolean value; }
public class JsonNumber  extends JsonNode { private final double value; }
public class JsonString  extends JsonNode { private final String value; }
public class JsonArray   extends JsonNode { private final List<JsonNode> elements; }
public class JsonObject  extends JsonNode { private final LinkedHashMap<String, JsonNode> fields; }
```

**Why Composite?** A `JsonArray` contains `JsonNode` elements — which can themselves be `JsonArray` or `JsonObject`. The recursive structure maps perfectly to the Composite pattern. Serialization (`toJsonString()`) becomes a simple recursive call.

---

## 🏗️ Class Design & Patterns

### Pattern: Composite (JsonNode Tree)

```java
public class JsonArray extends JsonNode {
    private final List<JsonNode> elements;

    @Override
    public String toJsonString() {
        return "[" + elements.stream()
            .map(JsonNode::toJsonString)
            .collect(Collectors.joining(",")) + "]";
    }
}

public class JsonObject extends JsonNode {
    private final LinkedHashMap<String, JsonNode> fields;

    @Override
    public String toJsonString() {
        return "{" + fields.entrySet().stream()
            .map(e -> "\"" + e.getKey() + "\":" + e.getValue().toJsonString())
            .collect(Collectors.joining(",")) + "}";
    }
}
```

### The Parser (Recursive Descent)

```java
public class JsonParser {
    private final String input;
    private int pos = 0;

    public JsonNode parse() {
        skipWhitespace();
        JsonNode node = parseValue();
        skipWhitespace();
        if (pos != input.length())
            throw new JsonParseException("Unexpected characters", pos);
        return node;
    }

    private JsonNode parseValue() {
        char c = peek();
        if (c == '{')                     return parseObject();
        if (c == '[')                     return parseArray();
        if (c == '"')                     return parseString();
        if (c == 't' || c == 'f')         return parseBoolean();
        if (c == 'n')                     return parseNull();
        if (c == '-' || Character.isDigit(c)) return parseNumber();
        throw new JsonParseException("Unexpected character '" + c + "'", pos);
    }

    private JsonNode parseObject() {
        consume('{');
        LinkedHashMap<String, JsonNode> fields = new LinkedHashMap<>();
        skipWhitespace();
        while (peek() != '}') {
            String key = ((JsonString) parseString()).getValue();
            skipWhitespace(); consume(':'); skipWhitespace();
            JsonNode value = parseValue();
            fields.put(key, value);
            skipWhitespace();
            if (peek() == ',') { consume(','); skipWhitespace(); }
        }
        consume('}');
        return new JsonObject(fields);
    }

    private JsonNode parseArray() {
        consume('[');
        List<JsonNode> elements = new ArrayList<>();
        skipWhitespace();
        while (peek() != ']') {
            elements.add(parseValue());
            skipWhitespace();
            if (peek() == ',') { consume(','); skipWhitespace(); }
        }
        consume(']');
        return new JsonArray(elements);
    }
}
```

**Why recursive descent?** Each `parseX()` method handles exactly one grammar rule. The recursion mirrors the JSON grammar — `parseValue()` calls `parseObject()` which calls `parseValue()` again. It's O(N), self-documenting, and easy to extend.

### Error Handling

```java
public class JsonParseException extends RuntimeException {
    private final int position;
    public JsonParseException(String message, int position) {
        super(message + " at position " + position);
        this.position = position;
    }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Trailing comma `[1,2,]` | Detect `,` followed by `]` — throw parse error |
| Duplicate object keys | `LinkedHashMap` keeps last value (mention, ask interviewer preference) |
| Unicode escapes `\uXXXX` | Handle in `parseString()` |
| Very deep nesting | Stack overflow risk — mention iterative approach for production |
| Numbers: `1e10`, `-0.5` | Use `Double.parseDouble()` on extracted token |

---

## �️ Database Design

### JSON Parser Service Storage Strategy

| Layer | Storage | Rationale |
|---|---|---|
| **Parsed schema cache** | Redis | Cache parsed JSON schemas (if validating against schema). Key: `schema:{schemaId} → {parsed schema}` |
| **Request logs** | PostgreSQL (time-series table) | Log failed parses for debugging: `parse_errors(timestamp, payload_snippet, error_position, error_type)` |
| **Metrics** | Prometheus | Real-time parsing latency, error rate distribution — no database needed, exposed via `/metrics` |

**Schema & Rationale:**

```redis
# Cache popular JSON schemas
schema:{schemaId}
  {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "age": { "type": "integer" }
    },
    "required": ["name"]
  }
```

**PostgreSQL Schema:**

```sql
CREATE TABLE parse_errors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  timestamp TIMESTAMP DEFAULT NOW(),
  service_name VARCHAR(50),  -- which service called parser
  payload_size INT,
  error_position INT,
  error_type VARCHAR(50),  -- "UNEXPECTED_TOKEN", "INVALID_NUMBER", etc.
  error_message VARCHAR(500),
  payload_snippet VARCHAR(200),  -- first 200 chars of malformed input
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_error_type (error_type)
);

CREATE TABLE parse_performance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payload_size INT,
  duration_ms INT,
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX idx_payload_size (payload_size),
  INDEX idx_timestamp (timestamp DESC)
);
```

### Why No Strong Persistence for Parser Itself?
- **Parser is a library** — no state to persist
- **Stateless compute** — same input always produces same output
- ✅ Metrics and error logs go to observability systems, not primary database
- ✅ No need for Redis replication — parser doesn't access it at runtime

---

## 🔌 API Routes & Contracts

### JSON Parser Microservice API (If Exposed as Service)

```
POST   /api/v1/parse
├─ Request:  { "payload": "{\"name\": \"Alice\", \"age\": 30}" }
├─ Response: {
│     "success": true,
│     "data": {
│       "type": "OBJECT",
│       "fields": {
│         "name": { "type": "STRING", "value": "Alice" },
│         "age": { "type": "NUMBER", "value": 30 }
│       }
│     },
│     "parseTimeMs": 0.5
│   }
├─ Error:    { "success": false, "error": "Unexpected token '}' at position 15", "position": 15 }
├─ Error:    429 Too Many Requests (rate limit: 10k req/sec)
└─ Latency:  < 10ms for typical 1KB JSON (+ network RTT)

POST   /api/v1/validate
├─ Request:  { 
│     "payload": "{\"name\": \"Bob\", \"age\": 25}",
│     "schemaId": "user_schema_v1"
│   }
├─ Response: { 
│     "valid": true, 
│     "errors": []
│   }
├─ Response (invalid): { 
│     "valid": false, 
│     "errors": [
│       { "path": "$.age", "message": "must be >= 18" }
│     ]
│   }
└─ Schema: Loaded from Redis cache (check schema:user_schema_v1)

GET    /api/v1/metrics
├─ Response: Prometheus format
│   parser_parse_total{status="success"} 1_250_000
│   parser_parse_total{status="error"} 3_250
│   parser_parse_duration_seconds{le="0.001"} 850_000
│   parser_parse_duration_seconds{le="0.01"} 1_245_000
└─ Scrape interval: 15 seconds (Prometheus job)

GET    /api/v1/health
├─ Response: { "status": "healthy", "uptime": 43200, "requests": 1_253_250 }
└─ Used by: load balancer health checks

POST   /api/v1/batch-parse
├─ Request:  { 
│     "payloads": [
│       "{\"id\": 1}",
│       "{\"id\": 2}",
│       "{\"id\": 3}"
│     ]
│   }
├─ Response: [
│     { "success": true, "data": {...} },
│     { "success": true, "data": {...} },
│     { "success": true, "data": {...} }
│   ]
├─ Max batch size: 1000 payloads
└─ Total size limit: 10MB per request
```

### Request/Response Contracts

```
Content-Type: application/json
X-Request-ID: uuid  (for tracing)
X-API-Version: 1    (for versioning)

Response Headers:
X-Parse-Time: 0.5ms
X-Response-ID: uuid
```

---

## 🏗️ Service Architecture

### JSON Parser Microservice (Stateless)

```
┌─────────────────────────────────────┐
│   Load Balancer (Round-Robin)       │
│   Health check: GET /health         │
└────────────┬────────────────────────┘
             │
    ┌────────┼────────┬───────────────┐
    │        │        │               │
┌───▼────┐ ┌─▼───┐ ┌─▼───┐    ┌──────▼──────┐
│Parser  │ │Parse│ │Parse│ .. │  Parser N    │
│Node 1  │ │Node2│ │Node3│    │  (instances) │
└────────┘ └─────┘ └─────┘    └─────────────┘
    │         │        │               │
    └─────────┴────────┴───────────────┘
              │
    ┌─────────┴──────────┐
    │  Logging & Metrics │
    │                    │
    ├─ Loki (logs)      │
    ├─ Prometheus       │
    └─ AlertManager     │
```

### Architecture Principles

| Principle | Implementation |
|---|---|
| **Stateless** | No in-process state between requests; any instance can handle any request |
| **Horizontal Scaling** | Add more instances without coordination; load balancer distributes requests |
| **Immutable** | Input is never modified; output is always fresh |
| **Idempotent** | Same input on retry always produces same output |
| **Fast fail** | Reject invalid JSON immediately, don't retry or buffer |

### Service Components

| Component | Role | Technology |
|---|---|---|
| **HTTP Server** | Accept requests, deserialize input, call parser | Spring Boot or Express |
| **JsonParser** | Core parsing logic (recursive descent) | Java/Python/Node.js |
| **ValidatorChain** | Optional: validate parsed JSON against schema | Custom or JSON Schema library |
| **Metrics** | Instrument parse latency, error rates | Micrometer (Java) or StatsD |
| **ErrorHandler** | Catch parser exceptions, return formatted errors | Custom middleware |
| **SchemaCache** | Pre-load common schemas from Redis on startup | Caffeine (local) + Redis (distributed) |

### Request Flow

```
Request → LoadBalancer
    │
    ├─> Select Parser Node (round-robin)
    │
    └─> Node:
        ├─> Deserialize HTTP request
        ├─> Validate Content-Length < 100MB
        ├─> Record start time
        │
        ├─> Call JsonParser.parse(payloadString)
        │   ├─> Instantiate new JsonParser (stateless)
        │   ├─> Recursively parse value (chars → JsonNode tree)
        │   └─> Return: JsonNode root
        │
        ├─> (Optional) If schemaId provided:
        │   ├─> Load schema from Redis cache
        │   ├─> Call JsonValidator.validate(data, schema)
        │   └─> Collect errors if any
        │
        ├─> Record latency metric: parse_duration_ms
        ├─> Increment counter: parse_total{status="success"}
        │
        └─> Serialize response + return 200 OK

On error:
  ├─> Catch JsonParseException
  ├─> Log to Loki: { "error": "...", "position": 42 }
  ├─> Increment counter: parse_total{status="error"}
  ├─> Increment counter: parse_error_type{type="UNEXPECTED_TOKEN"}
  └─> Return 400 + error details
```

### Deployment & Scaling

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: json-parser-service
spec:
  replicas: 10  # Auto-scale: 5-50 based on CPU > 70%
  template:
    spec:
      containers:
      - name: parser
        image: json-parser:v1.2.3
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Performance Characteristics

```
Throughput (single instance):
  - 10K small payloads/sec (< 1KB)
  - 5K medium payloads/sec (1-10KB)
  - 1K large payloads/sec (10-100KB)

With 10 instances:
  - 100K small payloads/sec
  - 50K medium payloads/sec
  - 10K large payloads/sec

Latency (p50, p99):
  - < 1KB:   p50=0.1ms, p99=0.5ms
  - 1-10KB:  p50=0.5ms, p99=2ms
  - 10-100KB: p50=5ms, p99=20ms
```

---

## �📐 Scalability & HLD Thinking

**Scalability:**
- A JSON parser is a pure compute function — stateless, no I/O. It scales trivially: add more CPU cores, run more instances. No shared state, no coordination.
- For a **high-throughput API gateway** that parses millions of JSON requests/sec: use a **thread pool** sized to CPU cores. Each thread gets its own `JsonParser` instance (not shared — not thread-safe by design, which is correct for a stateful parser with `pos` cursor).

**Latency:**
- Parsing is O(N) in input size. For a 1KB JSON payload: ~10,000 character operations at ~1ns each = ~10μs. For a 1MB payload: ~10ms.
- **Latency optimization:** avoid `String.substring()` allocations — use a `CharBuffer` or index-based slicing. For hot paths, consider **streaming parsing** (SAX-style) that doesn't build the full tree — processes tokens as they arrive.
- **Throughput vs latency tradeoff:** tree-building parser (this design) has higher latency but enables random access to the parsed tree. Streaming parser has lower latency but is single-pass — choose based on use case.

**Consistency:**
- Parsing is deterministic — same input always produces same output. No consistency concerns.
- **Error consistency:** always throw `JsonParseException` with position info. Never return `null` for parse errors — callers can't distinguish "null JSON value" from "parse failed".

**Availability:**
- Parser is a library — availability is the caller's concern. The parser itself should never hang: add a **depth limit** (e.g., max 100 levels of nesting) to prevent stack overflow on malicious input.
- **Security:** a deeply nested JSON `[[[[...]]]]` can cause a stack overflow (DoS). Enforce max depth:

```java
private JsonNode parseValue(int depth) {
    if (depth > MAX_DEPTH)
        throw new JsonParseException("Max nesting depth exceeded", pos);
    // ...
}
```

**Observability:**
- Metrics: parse latency histogram (p50, p99), parse error rate, payload size distribution
- Logs: log parse errors with the offending input snippet (truncated to 200 chars) and position
- Alert: parse error rate > 1% (may indicate a client sending malformed JSON — investigate)

---

## 🗣️ How to Explain in the Interview

> "I'm using recursive descent because the JSON grammar is naturally recursive — each `parseX()` method handles one grammar rule. It's O(N), no backtracking. The Composite pattern for `JsonNode` means serialization is a single recursive `toJsonString()` call. For production, I'd add a depth limit to prevent DoS via deeply nested input — a 10,000-level nested array would blow the call stack without it."
