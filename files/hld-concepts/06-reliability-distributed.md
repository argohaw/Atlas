---
tags: [hld, reliability, distributed-systems, amazon-interview]
---
# HLD: Reliability & Distributed Systems Patterns

## 🎯 Why This Section is Asked
Amazon's Leadership Principle "Dive Deep" means interviewers will push past your initial design: *"What happens when the DB goes down?"*, *"How do you handle a network partition?"*, *"How do you elect a new leader?"* This section gives you the answers.

---

## 🗳️ Leader Election

**Definition:** The process by which distributed nodes agree on a single coordinator (leader) that makes decisions on behalf of the group.

### Why You Need It
- Only one node should write to the primary DB
- Only one node should run a scheduled job (cron)
- Only one node should be the Kafka partition leader

### How It Works (Raft Algorithm — simplified)

```
Normal state:
  Leader ──► heartbeat ──► Follower 1
          ──► heartbeat ──► Follower 2
          ──► heartbeat ──► Follower 3

Leader fails (no heartbeat for 150-300ms):
  Follower 1: "I haven't heard from leader, I'll run for election"
  Follower 1 ──► "Vote for me (term 2)" ──► Follower 2, 3
  Follower 2, 3: "OK, I vote for you"
  Follower 1 wins majority → becomes new Leader (term 2)
```

### Tools for Leader Election

| Tool | How | Use Case |
|---|---|---|
| **Zookeeper** | Ephemeral znodes — first to create wins | Kafka broker leader, HBase master |
| **etcd** | Distributed key-value with TTL leases | Kubernetes control plane |
| **Redis** | `SET key value NX EX 30` (atomic) | Lightweight, single-region |
| **AWS DynamoDB** | Conditional writes | Serverless leader election |

### Redis-based Leader Election

```java
public boolean tryBecomeLeader(String nodeId) {
    // SET leader nodeId NX EX 30
    // NX = only set if not exists, EX 30 = expire in 30 seconds
    String result = redis.set("leader", nodeId, SetParams.setParams().nx().ex(30));
    return "OK".equals(result);
}

public void renewLease(String nodeId) {
    // Only renew if we're still the leader
    String script = "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                    "  return redis.call('expire', KEYS[1], 30) " +
                    "else return 0 end";
    redis.eval(script, List.of("leader"), List.of(nodeId));
}
```

> *"For the scheduled job that generates daily reports, I use Redis-based leader election. Each instance tries to acquire a 30-second lease. The winner runs the job and renews the lease every 10 seconds. If the leader crashes, the lease expires and another instance takes over within 30 seconds."*

---

## 🔀 Consistent Hashing (Deep Dive)

### The Problem with Naive Hashing
```
3 nodes: shard = hash(key) % 3

Add a 4th node: shard = hash(key) % 4
→ ~75% of keys map to different nodes
→ Massive cache invalidation / data migration
```

### Consistent Hashing Solution

```
Virtual ring (0 to 2^32):

         0
        /|\
       / | \
  270 /  |  \ 90
     /   |   \
    /    |    \
  180    |
         
Nodes placed at positions:
  Node A: 60°  (also virtual nodes at 120°, 240°)
  Node B: 180° (also virtual nodes at 300°, 60°... wait, different hash)
  Node C: 300°

Key K hashes to 100° → clockwise → Node B (at 180°)
```

### Virtual Nodes
Each physical node gets multiple positions on the ring (e.g., 150 virtual nodes).
- **Why:** Prevents hot spots when nodes have different capacities
- **How:** `hash("NodeA-1")`, `hash("NodeA-2")`, ..., `hash("NodeA-150")`

### Adding/Removing Nodes
```
Add Node D at 120°:
  Keys between 60° and 120° move from Node B to Node D
  Only ~1/N of keys affected (where N = number of nodes)
  All other keys unaffected
```

> *"I use consistent hashing for the Redis cluster. When I add a cache node during a traffic spike, only 1/N of the cache keys need to be remapped. Without consistent hashing, adding one node would invalidate ~90% of the cache and cause a thundering herd on the DB."*

---

## 🔁 Primary-Replica Architecture (Deep Dive)

### Failover Process

```
Normal:
  Primary ──► writes ──► Replica 1 (sync)
                    ──► Replica 2 (async)

Primary fails:
  1. Health check detects failure (10-30s)
  2. Replica 1 promoted to Primary (has all data — sync replication)
  3. DNS updated to point to new Primary
  4. Replica 2 repoints to new Primary
  5. Old Primary comes back → becomes Replica
```

### Replication Lag Monitoring
```sql
-- On replica: check how far behind primary
SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

Alert if lag > 5 seconds — reads from replica may be significantly stale.

### Read Scaling with Replicas

```
Write traffic → Primary
Read traffic  → Replica 1, Replica 2, Replica 3 (round-robin)
```

**Problem:** After a write, a user reads from a replica that hasn't caught up yet — they see stale data.

**Solution — Read-Your-Writes:**
```java
public User getUser(String userId, boolean justUpdated) {
    if (justUpdated) {
        return primaryDb.findById(userId); // read from primary
    }
    return replicaDb.findById(userId); // read from replica
}
```

---

## 🛡️ Fault Tolerance Patterns

### Circuit Breaker

**Problem:** Service A calls Service B. Service B is slow/down. Service A's threads pile up waiting → Service A crashes too (cascading failure).

**Solution:** Circuit breaker monitors failure rate. When it exceeds a threshold, it "opens" and fails fast — no more calls to Service B.

```
CLOSED (normal):
  All requests pass through
  Monitor failure rate

OPEN (tripped):
  All requests fail immediately (no call to Service B)
  After timeout, move to HALF-OPEN

HALF-OPEN (testing):
  Allow one request through
  If success → CLOSED
  If failure → OPEN again
```

```java
// Using Resilience4j
CircuitBreaker cb = CircuitBreaker.ofDefaults("paymentService");
// Opens after 50% failure rate in 10-second window
// Stays open for 60 seconds, then half-opens

Supplier<PaymentResult> decorated = CircuitBreaker
    .decorateSupplier(cb, () -> paymentService.charge(request));

Try.ofSupplier(decorated)
    .recover(CallNotPermittedException.class, e -> PaymentResult.fallback());
```

### Retry with Exponential Backoff

```java
public <T> T withRetry(Supplier<T> operation) {
    int attempt = 0;
    while (attempt < 3) {
        try {
            return operation.get();
        } catch (TransientException e) {
            attempt++;
            long delay = (long) Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
            delay += new Random().nextInt(100); // jitter — prevent synchronized retries
            Thread.sleep(delay);
        }
    }
    throw new MaxRetriesExceededException();
}
```

**Why jitter?** Without jitter, all retrying clients back off for exactly the same duration and then hammer the server simultaneously. Jitter spreads the retry load.

### Bulkhead Pattern

**Problem:** A slow downstream service consumes all thread pool threads → other services can't be called.

**Solution:** Separate thread pools (bulkheads) per downstream service.

```java
// Separate thread pools for each downstream service
ExecutorService paymentPool     = Executors.newFixedThreadPool(10);
ExecutorService inventoryPool   = Executors.newFixedThreadPool(10);
ExecutorService notificationPool = Executors.newFixedThreadPool(5);

// If payment service is slow, only paymentPool threads are blocked
// inventoryPool and notificationPool are unaffected
```

---

## 🏗️ Architectural Patterns

### Monolith vs Microservices

| | Monolith | Microservices |
|---|---|---|
| **Deployment** | Single deployable unit | Independent per service |
| **Scaling** | Scale entire app | Scale individual services |
| **Development** | Simple locally | Complex (service discovery, network) |
| **Failure isolation** | One bug can crash everything | Failures are isolated |
| **Data** | Shared DB | Each service owns its DB |
| **Start with** | ✅ New products | ❌ Too complex early |
| **Move to** | When team/scale demands it | When monolith becomes a bottleneck |

> *"I'd start with a modular monolith — separate modules for orders, inventory, and payments, but deployed as one unit. Once the team grows past 20 engineers or we hit scaling bottlenecks on specific modules, we extract them into microservices. Premature microservices add operational complexity without benefit."*

### Event-Driven Architecture vs Request-Response

| | Request-Response | Event-Driven |
|---|---|---|
| **Coupling** | Tight (caller knows callee) | Loose (publisher doesn't know subscribers) |
| **Latency** | Synchronous — caller waits | Asynchronous — caller continues |
| **Reliability** | Caller fails if callee is down | Events buffered in queue |
| **Complexity** | Simple to reason about | Harder to trace, eventual consistency |
| **Use when** | Need immediate response | Fire-and-forget, fan-out, decoupling |

### CQRS + Event Sourcing

**Event Sourcing:** Instead of storing current state, store the sequence of events that led to it.

```
Traditional: users table → { id: 1, balance: 150 }

Event Sourcing: events table →
  { type: AccountOpened, amount: 200 }
  { type: Withdrawal,    amount: 50  }
  Current balance = 200 - 50 = 150 (computed by replaying events)
```

**Benefits:**
- Complete audit log (required for financial systems)
- Replay events to rebuild any read model
- Time travel — reconstruct state at any point in time

**Costs:**
- More complex queries (must replay events)
- Event schema evolution is hard
- Storage grows indefinitely (use snapshots to compact)
