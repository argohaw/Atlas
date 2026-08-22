# 6. Microservices and Distributed Systems

# 6.1 When Not to Use Microservices

A strong engineer should not say:

> "Microservices are always better because they scale."

Microservices introduce:

- Network failures
- Distributed tracing complexity
- Data consistency challenges
- Deployment complexity
- Operational overhead
- Versioning challenges

A modular monolith may be better when the domain/team/scale does not justify distributed complexity.

---

# 6.2 Service Boundaries

Good boundaries often align with business/domain responsibilities.

Example:

```text
Booking
Payment
Flight Inventory
Customer
Notification
```

Avoid decomposing services purely by technical layers:

```text
Controller Service
Database Service
Logging Service
```

unless those are truly independent platform capabilities.

---

# 6.3 Database per Service

A service should own its data.

Avoid direct cross-service database access because it creates tight coupling.

Bad:

```text
Service A → directly updates Service B's database
```

Better:

```text
Service A → Service B API/event
```

This allows Service B to control its own invariants.

---

# 6.4 Synchronous vs Asynchronous Communication

## REST / synchronous

```text
Booking → Payment → response
```

Good when an immediate response is required.

Risks:

- Temporal coupling
- Cascading latency/failure

## Kafka / asynchronous

```text
Booking → event → Kafka → Payment
```

Benefits:

- Decoupling
- Buffering
- Independent consumers

Trade-offs:

- Eventual consistency
- More complex debugging
- Duplicate handling
- Ordering considerations

---

# 6.5 Timeout

Every remote call should have realistic timeout behavior.

Without timeouts:

```text
Service A waits forever
        ↓
Threads/resources exhausted
        ↓
Cascading failure
```

Timeouts are fundamental to distributed resilience.

---

# 6.6 Retry

Retry can help transient failures.

But retrying everything is dangerous.

Example:

```text
100 failed requests
3 retries each
```

can become:

```text
400 requests
```

against an already unhealthy dependency.

Use:

- Bounded retries
- Backoff
- Jitter where appropriate
- Retry only appropriate failures

Do not retry non-idempotent operations blindly.

---

# 6.7 Circuit Breaker

Conceptually:

```text
CLOSED
  ↓ failures exceed threshold
OPEN
  ↓ after recovery interval
HALF_OPEN
  ↓ success
CLOSED
```

When open, calls fail fast rather than repeatedly hitting a known unhealthy dependency.

Benefits:

- Prevent cascading failures
- Reduce pressure on failing service
- Recover faster

---

# 6.8 Bulkhead

Separate resources so one failing workload does not consume everything.

Examples:

- Separate thread pools
- Connection pool isolation
- Resource quotas

Analogy: Compartments in a ship.

A problem in one compartment should not sink the entire system.

---

# 6.9 Rate Limiting

Protect APIs/services from excessive traffic.

Possible algorithms:

- Token bucket
- Leaky bucket
- Fixed window
- Sliding window

Common response:

```text
429 Too Many Requests
```

---

# 6.10 Saga Pattern

A traditional local database transaction cannot directly provide one simple ACID transaction across independent microservices/databases.

Example:

```text
Booking created
      ↓
Payment completed
      ↓
Seat reserved
      ↓
Ticket issuance fails
```

The Saga coordinates local transactions and compensating actions.

Possible compensation:

```text
Ticket failed
      ↓
Release seat
      ↓
Refund/reverse payment
      ↓
Cancel booking
```

## Choreography

Services react to events.

```text
BookingCreated
      ↓
Payment service
      ↓
PaymentCompleted
      ↓
Inventory service
```

Pros:

- Loose coupling

Cons:

- Flow can become difficult to understand

## Orchestration

A central coordinator directs the workflow.

Pros:

- Explicit workflow

Cons:

- Coordinator becomes important infrastructure/logic

---

# 6.11 Transactional Outbox Pattern

A classic dual-write problem:

```text
1. Update database
2. Publish Kafka event
```

What if:

```text
Database succeeds
Kafka publish fails
```

The database says booking exists but no event was published.

Or:

```text
Kafka event published
Database transaction fails
```

Consumers see an event for state that does not exist.

Outbox pattern:

```text
Database transaction:
    Save business data
    Save outbox event
        ↓
Commit together
        ↓
Separate publisher reads outbox
        ↓
Publishes event
```

This improves atomicity between business state change and intent to publish.

Consumers should still be designed for duplicate delivery.

---

# 6.12 Idempotent Consumer

Assume a consumer can receive the same message more than once.

Bad:

```text
PaymentCompleted
→ credit loyalty points
```

If processed twice:

```text
100 points
+
100 points
```

Possible strategies:

- Event ID tracking
- Unique constraints
- Idempotency keys
- State-based processing

Example:

```text
event_id = abc-123

Already processed?
YES → skip
NO  → process and record atomically where possible
```

---

# 6.13 CAP and Eventual Consistency

At interview level, understand the basic distributed systems trade-off.

Do not casually claim that every distributed system "chooses two of three" in a simplistic way.

The important practical point:

> Network partitions are a real possibility in distributed systems, and systems must decide how to behave regarding availability and consistency under those conditions.

Many microservice workflows therefore use eventual consistency and compensation.

---

# 6.14 Observability

Three pillars:

```text
Logs
Metrics
Traces
```

## Logs

Detailed events.

Example:

```text
Booking 123 payment call timed out
```

Use structured logging where possible.

## Metrics

Numeric measurements.

Examples:

- Request rate
- Error rate
- Latency
- CPU
- Memory
- Kafka consumer lag

## Traces

Follow a request across services.

```text
API Gateway
   ↓ trace-id
Booking
   ↓ trace-id
Payment
   ↓ trace-id
Notification
```

Distributed tracing is extremely useful for microservices.