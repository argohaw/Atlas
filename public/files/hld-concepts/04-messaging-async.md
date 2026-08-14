---
tags: [hld, messaging, async, patterns, amazon-interview]
---
# HLD: Messaging, Streaming & Async Patterns

## 🎯 Why This Section is Critical
Amazon's entire infrastructure is event-driven. SQS, SNS, Kinesis, EventBridge — these are core AWS services. Every HLD interview at Amazon will involve at least one async component. Knowing *when* to use a queue vs a stream vs pub-sub, and *why*, is what separates a senior engineer's answer from a junior one.

---

## 📬 Queues vs Streams

### Message Queue (Point-to-Point)
One producer, one consumer. Message is deleted after consumption.

```
Producer ──► [Queue] ──► Consumer A
                    (message deleted after Consumer A processes it)
```

**Examples:** AWS SQS, RabbitMQ, ActiveMQ

**Use when:**
- Task distribution (send email, resize image, process payment)
- Work queue where each task should be done exactly once
- Decoupling a slow consumer from a fast producer

### Event Stream (Log-Based)
Messages are persisted in an ordered log. Multiple consumers can read independently at their own offset.

```
Producer ──► [Stream/Log] ──► Consumer A (offset 100)
                         ──► Consumer B (offset 85)
                         ──► Consumer C (offset 100)
(messages retained for 7 days — consumers can replay)
```

**Examples:** Apache Kafka, AWS Kinesis, AWS MSK

**Use when:**
- Multiple independent consumers need the same events (order placed → inventory, billing, notification all react)
- Event replay / audit log
- Real-time analytics pipeline
- Event sourcing

### Key Difference

| | Queue (SQS) | Stream (Kafka/Kinesis) |
|---|---|---|
| Consumption | One consumer per message | Multiple independent consumers |
| Retention | Deleted after ACK | Retained for days/weeks |
| Ordering | Best-effort (FIFO queue for strict) | Ordered within partition |
| Replay | ❌ Not possible | ✅ Replay from any offset |
| Use case | Task queue | Event log, analytics |

> *"I'll use Kafka for the order events because three downstream services — inventory, billing, and notifications — all need to react to the same `OrderPlaced` event independently. If I used SQS, only one service would receive each message. Kafka's consumer groups let each service maintain its own offset."*

---

## 📢 Pub-Sub (Publish-Subscribe)

**Definition:** Publishers send messages to a **topic**. All subscribers to that topic receive the message asynchronously.

```
                    ┌─────────────┐
                    │    Topic    │
Order Service ─────►│ order.placed│──────► Inventory Service
                    │             │──────► Billing Service
                    │             │──────► Notification Service
                    └─────────────┘
```

**Examples:** AWS SNS, Google Pub/Sub, Redis Pub/Sub

### SNS + SQS Fan-Out Pattern (Amazon's Standard Pattern)

```
SNS Topic ──► SQS Queue A ──► Inventory Worker
         ──► SQS Queue B ──► Billing Worker
         ──► SQS Queue C ──► Notification Worker
```

**Why fan-out?** SNS delivers to all subscribers simultaneously. Each subscriber has its own SQS queue — so if the Notification Worker is slow, it doesn't block Inventory. Each queue can have its own retry policy, DLQ, and scaling.

> *"I'll use SNS for fan-out. When an order is placed, the Order Service publishes to an SNS topic. SNS fans out to three SQS queues — one per downstream service. Each service processes at its own pace. If Billing is down, its SQS queue buffers messages — no data loss."*

---

## 🌊 Stream Processing

**Definition:** Real-time processing of ordered events — applying transformations, aggregations, and joins as data flows through.

### Windowing

```
Events: [A@1s, B@2s, C@3s, D@4s, E@5s, F@6s]

Tumbling window (3s):
  Window 1: [A, B, C] → aggregate
  Window 2: [D, E, F] → aggregate

Sliding window (3s, slide 1s):
  Window 1: [A, B, C]
  Window 2: [B, C, D]
  Window 3: [C, D, E]
```

**Use cases:**
- Count orders per minute (tumbling window)
- Detect fraud: >5 transactions in 60 seconds (sliding window)
- Moving average of sensor readings

### Stream Processing Frameworks

| Framework | Strengths | Use Case |
|---|---|---|
| Apache Flink | Exactly-once, low latency, stateful | Fraud detection, real-time ML |
| Apache Spark Streaming | Micro-batch, rich ML ecosystem | Analytics, ETL |
| AWS Kinesis Data Analytics | Managed, SQL-based | Simple aggregations on Kinesis |
| Kafka Streams | Embedded in app, no cluster needed | Simple transformations |

---

## 🔙 Backpressure

**Definition:** A mechanism to slow down producers when consumers are overwhelmed — preventing memory exhaustion and cascading failures.

### The Problem Without Backpressure

```
Producer: 10,000 events/sec
Consumer: 1,000 events/sec
Queue:    fills up → OOM → crash → data loss
```

### Solutions

**Bounded queue with blocking producer:**
```java
BlockingQueue<Event> queue = new LinkedBlockingQueue<>(10_000); // bounded
// Producer blocks when queue is full — natural backpressure
queue.put(event); // blocks if full
```

**Drop policy (load shedding):**
```java
if (!queue.offer(event)) {
    metrics.increment("events.dropped");
    // Drop the event — acceptable for metrics/analytics
}
```

**Rate limiting the producer:**
```java
RateLimiter limiter = RateLimiter.create(1000); // 1000 events/sec
limiter.acquire(); // blocks until permit available
queue.offer(event);
```

**Reactive Streams (Project Reactor, RxJava):**
Built-in backpressure protocol — consumer signals how many items it can handle.

> *"The analytics pipeline can tolerate dropped events — it's not transactional. So I'll use a bounded queue with a drop policy. If the queue is full, we drop the event and increment a metric. The SLO for analytics is best-effort, not exactly-once."*

---

## ⚡ Event-Driven Architecture

**Definition:** Building systems where components communicate by producing and consuming events, rather than direct synchronous calls.

### Choreography vs Orchestration

**Choreography (decentralized):**
Each service reacts to events and publishes its own events. No central coordinator.
```
Order Service ──► OrderPlaced ──► Inventory Service ──► InventoryReserved
                                                    ──► Payment Service ──► PaymentProcessed
                                                                        ──► Notification Service
```
- ✅ Loose coupling, each service is independent
- ❌ Hard to trace the overall flow, distributed debugging

**Orchestration (centralized):**
A central orchestrator (Saga orchestrator or workflow engine) tells each service what to do.
```
Order Orchestrator ──► "Reserve inventory" ──► Inventory Service
                   ◄── "Reserved"
                   ──► "Process payment" ──► Payment Service
                   ◄── "Paid"
                   ──► "Send notification" ──► Notification Service
```
- ✅ Clear flow, easy to monitor and debug
- ❌ Orchestrator is a bottleneck and SPOF

---

## 🔄 CQRS (Command Query Responsibility Segregation)

**Definition:** Use separate models (and often separate data stores) for writes (commands) and reads (queries).

```
                    Write Side                    Read Side
Client ──► Command ──► Command Handler ──► Write DB
                              │
                              │ (event published)
                              ▼
                        Event Bus ──► Projection Builder ──► Read DB (optimized)
                                                                    │
                                                             Client ──► Query ──► Read DB
```

### Why CQRS?

**Problem:** A single DB model optimized for writes (normalized, ACID) is often terrible for reads (requires 5 joins for a dashboard query).

**Solution:** The write side uses a normalized relational DB. The read side uses a denormalized read model (e.g., a pre-joined document in MongoDB or a materialized view) optimized for the exact query pattern.

**Example — Amazon Order History:**
- Write: `orders`, `order_items`, `products` tables (normalized)
- Read: Pre-built `order_history_view` document per user with all data denormalized — one read, no joins

> *"I'll apply CQRS to the order history feature. Writes go to Aurora (normalized, ACID). An event handler listens to `OrderPlaced` events and builds a denormalized read model in DynamoDB — one document per user containing their full order history. The read latency drops from 50ms (5-table join) to 2ms (single DynamoDB get)."*

---

## 🔁 Saga Pattern

**Definition:** Managing distributed transactions across multiple services using a sequence of local transactions with compensating actions on failure.

### The Problem
You can't use a single ACID transaction across microservices — each service has its own DB.

### Choreography-based Saga

```
1. Order Service:     Create order (PENDING)     → publish OrderCreated
2. Inventory Service: Reserve stock              → publish StockReserved
3. Payment Service:   Charge card                → publish PaymentProcessed
4. Order Service:     Update order (CONFIRMED)

On failure at step 3 (payment fails):
3. Payment Service:   Publish PaymentFailed
2. Inventory Service: Listen → release stock reservation (compensating action)
1. Order Service:     Listen → cancel order (compensating action)
```

### Orchestration-based Saga

```java
public class OrderSaga {
    public void execute(Order order) {
        try {
            inventoryService.reserve(order);
            paymentService.charge(order);
            orderService.confirm(order);
        } catch (PaymentException e) {
            inventoryService.release(order); // compensate
            orderService.cancel(order);      // compensate
        }
    }
}
```

> *"I'll use an orchestration-based Saga for the checkout flow. The Order Saga orchestrator calls inventory reservation, then payment. If payment fails, it explicitly calls the inventory release compensation. This makes the flow visible and debuggable — I can see exactly which step failed and which compensations ran."*

---

## ✅ Idempotency

**Definition:** An operation that produces the same result whether executed once or multiple times.

### Why It Matters
Networks are unreliable. A client may retry a request that actually succeeded. Without idempotency, you charge a customer twice.

### Implementation

**Idempotency Key:**
```
POST /payments
Headers: Idempotency-Key: "order-123-attempt-1"
Body: { amount: 99.99, card: "..." }
```

Server logic:
```java
public PaymentResult processPayment(String idempotencyKey, PaymentRequest req) {
    // Check if we've seen this key before
    Optional<PaymentResult> cached = redis.get("idem:" + idempotencyKey);
    if (cached.isPresent()) return cached.get(); // return same result

    PaymentResult result = chargeCard(req);

    // Store result with TTL (e.g., 24 hours)
    redis.setex("idem:" + idempotencyKey, 86400, result);
    return result;
}
```

**Database-level idempotency:**
```sql
INSERT INTO payments (idempotency_key, amount, status)
VALUES ('order-123-attempt-1', 99.99, 'SUCCESS')
ON CONFLICT (idempotency_key) DO NOTHING;
```

> *"Every payment API call requires an idempotency key. The client generates a UUID per payment attempt and includes it in the header. If the network drops after we charge the card but before we respond, the client retries with the same key — we return the cached result instead of charging again."*
