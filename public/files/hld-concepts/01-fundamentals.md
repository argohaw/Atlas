---
tags: [hld, fundamentals, tradeoffs, amazon-interview]
---
# HLD Fundamentals: Scalability, Availability, Consistency & Tradeoffs

## 🎯 Why These Are Asked First
Every Amazon HLD interview starts with requirements and constraints. The interviewer is checking whether you instinctively ask: *"What are the scale, availability, and consistency requirements?"* before drawing a single box. These three form the foundation of every architectural decision you make.

---

## 📐 Scalability

**Definition:** The ability of a system to handle growing load by adding resources.

### Vertical Scaling (Scale Up)
Add more CPU/RAM to a single machine.
- ✅ Simple — no code changes
- ❌ Hard ceiling (biggest machine available), single point of failure, expensive

### Horizontal Scaling (Scale Out)
Add more machines and distribute load.
- ✅ Theoretically unlimited, fault-tolerant
- ❌ Requires stateless services, distributed coordination, load balancing

### How to Talk About It in an Interview

> "My service is stateless — all session state lives in Redis. This means I can horizontally scale the API tier behind a load balancer by just adding instances. The database is the bottleneck for writes, so I'll shard by user ID."

### Capacity Estimation (Back-of-Envelope)

Always do this before designing. Interviewers reward it.

```
Example: Design Twitter-like feed
- 100M DAU
- Each user reads feed 5x/day → 500M reads/day → ~6,000 reads/sec
- Each user posts 1 tweet/day → 100M writes/day → ~1,200 writes/sec
- Peak = 3x average → 18,000 reads/sec, 3,600 writes/sec
- Tweet = 280 chars ≈ 300 bytes → 100M * 300B = 30GB/day storage
```

**Rule of thumb:** 1M DAU ≈ 12 QPS average, 100 QPS peak.

---

## 🟢 Availability

**Definition:** The fraction of time a system is operational and serving requests.

```
Availability = Uptime / (Uptime + Downtime)

99%    = 3.65 days downtime/year   ("two nines")
99.9%  = 8.76 hours/year           ("three nines")
99.99% = 52.6 minutes/year         ("four nines") ← Amazon target for most services
99.999%= 5.26 minutes/year         ("five nines") ← payments, critical infra
```

### How to Achieve High Availability

| Technique | What It Does |
|---|---|
| Redundancy | Multiple instances — no SPOF |
| Health checks + auto-restart | Replace failed instances automatically |
| Multi-AZ deployment | Survive a full data center failure |
| Circuit breaker | Stop cascading failures when a dependency is down |
| Graceful degradation | Serve stale data or reduced features instead of erroring |

### SLI / SLO / SLA

- **SLI** (Service Level Indicator): The actual measured metric. e.g., *"p99 latency = 120ms"*
- **SLO** (Service Level Objective): The target. e.g., *"p99 latency < 200ms for 99.9% of requests"*
- **SLA** (Service Level Agreement): The contractual commitment with penalties. e.g., *"99.9% uptime or we credit you"*

> In an interview: *"I'd define an SLO of 99.99% availability and p99 latency < 100ms. To meet this, I need multi-AZ deployment, a circuit breaker on the payment service, and a read replica for the DB."*

---

## 🔵 Consistency

**Definition:** Whether all nodes in a distributed system see the same data at the same time.

### Strong Consistency
Every read returns the most recent write. All nodes agree.
- Use when: financial transactions, inventory counts, seat booking
- Cost: higher latency (must wait for all replicas to acknowledge)

### Eventual Consistency
Nodes will converge to the same state *eventually* — but reads may return stale data temporarily.
- Use when: social media likes/views, DNS propagation, shopping cart
- Benefit: lower latency, higher availability

### Read-Your-Writes Consistency
A user always sees their own writes immediately, even if other users see stale data.
- Use when: profile updates, settings changes
- Implementation: route a user's reads to the same replica they wrote to (sticky sessions or primary reads for that user)

---

## ⚡ Latency vs Throughput

| | Latency | Throughput |
|---|---|---|
| **Definition** | Time for one request to complete | Requests completed per unit time |
| **Unit** | Milliseconds (p50, p99, p999) | Requests/second (RPS) |
| **Optimized by** | Caching, fewer hops, faster DB queries | Parallelism, batching, async processing |
| **Tradeoff** | Low latency often means less batching | High throughput often means higher per-request latency |

### Latency Budget
Break down where time is spent in a request:

```
Total budget: 200ms
├── DNS lookup:        5ms
├── TLS handshake:    10ms
├── API Gateway:       5ms
├── Service logic:    20ms
├── DB query:        100ms  ← usually the bottleneck
├── Cache lookup:      2ms
└── Network (return): 10ms
```

> *"The DB query is consuming 50% of my latency budget. I'll add a read-through cache with a 5-minute TTL to bring that to 2ms for cache hits."*

---

## 🔺 CAP Theorem

**Statement:** In a distributed system, you can only guarantee **two** of:
- **C**onsistency — all nodes see the same data
- **A**vailability — every request gets a response
- **P**artition Tolerance — system works despite network splits

**The catch:** Network partitions *will* happen. So the real choice is **CP vs AP**.

```
         Consistency
              /\
             /  \
            /    \
           / RDBMS \
          /  (CA)   \
         /____________\
Availability    Partition Tolerance
   (AP)              (CP)
  Cassandra,       HBase,
  DynamoDB,        Zookeeper,
  CouchDB          etcd
```

| System | Choice | Why |
|---|---|---|
| DynamoDB | AP | Availability over consistency; eventual consistency by default |
| HBase / Zookeeper | CP | Consistency required; may reject requests during partition |
| Traditional RDBMS | CA | Assumes no partitions (single node or tight cluster) |

### How to Use in an Interview

> *"For the user profile service, I'll use DynamoDB (AP) — a user seeing a slightly stale profile for a few seconds is acceptable. For the payment ledger, I'll use Aurora (CP) — I cannot show an incorrect balance."*

---

## 🔷 PACELC Theorem

**Extends CAP** by asking: even when there's *no* partition, what's the tradeoff?

```
If Partition:  choose between Availability (A) vs Consistency (C)
Else (normal): choose between Latency (L) vs Consistency (C)
```

| System | Partition choice | Normal choice |
|---|---|---|
| DynamoDB | A | L (low latency, eventual consistency) |
| Zookeeper | C | C (strong consistency always) |
| Cassandra | A | L (tunable consistency) |
| Aurora | C | C (strong consistency) |

**Why PACELC matters:** CAP only talks about failures. PACELC forces you to think about the *steady-state* tradeoff — which is what affects your users 99.9% of the time.

> *"Even without a partition, DynamoDB trades consistency for latency — reads from a replica may be 50ms stale. For a product catalog that's fine. For an inventory count during a flash sale, I need strongly consistent reads, which DynamoDB supports at higher cost."*

---

## 🗣️ How to Tie It All Together in an Interview

When you start an HLD interview, say this:

> "Before I design anything, let me clarify the requirements. What's the expected DAU and peak QPS? What's the availability SLO — 99.9% or 99.99%? And what are the consistency requirements — can users see slightly stale data, or do we need strong consistency? These answers will drive every architectural decision."

Then use the answers to justify:
- **Scale** → horizontal scaling, sharding strategy
- **Availability** → multi-AZ, circuit breakers, redundancy
- **Consistency** → DB choice (CP vs AP), caching TTL, read model
- **Latency** → caching layer, CDN, async processing
