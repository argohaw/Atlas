---
tags: [hld, system-design, interview]
---
# 3-Day HLD (High-Level Design) Intensive Prep Plan

## 🎯 The Core Mental Model for HLD
In an HLD interview, your design is evaluated on 4 primary dimensions:
1. **System Architecture & Scale:** Can your system handle peak throughput (e.g., Prime Day traffic spikes)?
2. **Data Model & Storage Strategy:** Did you pick the right database (SQL vs Key-Value vs NoSQL Document vs Columnar) and access pattern?
3. **Resilience & Fault Tolerance:** What happens when a region fails, a node drops, or a network partition occurs (CAP theorem)?
4. **Tradeoff Justification:** Every decision has a drawback. Can you explain *why* you chose Latency over Consistency, or Eventual Consistency over Strong Consistency?

---

## 🛠️ The Standard 45-Minute Interview Framework

Divide your interview time strictly according to this blueprint:
1. **[00-05 min] - Requirements & Constraints** ──> Functional, Non-Functional, DAU/QPS Estimation
2. **[05-12 min] - API Design & Data Schemas** ──> Endpoints, Payload Structures, DB Selection
3. **[12-25 min] High-Level Architecture** ──> End-to-end Diagram (Client -> Load Balancer -> Microservices -> DBs)
4. **[25-40 min] Deep Dives & Bottlenecks** ──> Caching, Queues, Partitioning, Edge Cases, Failovers
5. **[40-45 min] Wrap Up & Tradeoffs** ──> Summary, Monitoring, Cost/Operational tradeoffs

---

## 📅 Day-by-Day Schedule

### Day 1: Core System Building Blocks & Tradeoffs
*Focus: Mastering the core infrastructure components that every system relies on.*

#### Morning: Building Blocks Refresh
* **Storage & Databases:**
  * **Relational (PostgreSQL/Aurora):** ACID, complex queries, transactions (e.g., Payments, Ledger).
  * **NoSQL / Key-Value (DynamoDB/Redis):** Sub-10ms single-digit reads/writes, horizontally scalable (e.g., Carts, Sessions, User Profiles).
  * **Wide-Column / Time-Series (Cassandra/InfluxDB):** Append-heavy write loads (e.g., Metrics, Telemetry, Chat history).
* **Caching Strategies:**
  * Read-Through, Write-Through, Write-Back (Write-Behind), Cache-Aside.
  * Eviction policies: LRU, LFU. Cache invalidation strategies.
* **Asynchronous Processing & Message Queues:**
  * Kafka (event streaming, ordered logs) vs AWS SQS/RabbitMQ (task queues, dead-letter queues).

#### Afternoon & Evening: Hands-On System 1
* **Design Target:** **Distributed Rate Limiter** or **URL Shortener (TinyURL)**
* **Key Focus:**
  * Token Bucket / Leaky Bucket / Sliding Window Counter algorithm.
  * In-memory storage with Redis + Atomic operations (`INCR`, Lua scripts).
  * High availability across multiple geo-distributed API Gateways.

---

### Day 2: High-Frequency Amazon HLD Patterns
*Focus: Processing massive scale, consistency models, and transaction management.*

#### Morning: Distributed Systems Concepts
* **Consistency & Replication:**
  * CAP Theorem (CP vs AP systems).
  * Idempotency mechanisms (Idempotency keys, Unique Constraints, Redis locks).
  * Distributed Transactions (Saga Pattern vs 2-Phase Commit).
* **Partitioning & Sharding:**
  * Horizontal Sharding by Partition Key.
  * Consistent Hashing (handling node additions/failures without reshuffling all keys).

#### Afternoon: Hands-On System 2 (E-Commerce Focus)
* **Design Target:** **Amazon Shopping Cart & Checkout Service**
* **Key Focus:**
  * Cart storage choice (DynamoDB for high throughput, low latency).
  * Inventory Reservation System (preventing overbooking/overselling during flash sales).
  * Handling race conditions using optimistic concurrency control vs pessimistic locks.

#### Evening: Hands-On System 3 (Event-Driven / Streaming Focus)
* **Design Target:** **Order Processing Pipeline & Notification System**
* **Key Focus:**
  * Event-driven microservices using Kafka/SQS.
  * Decoupling order placement, inventory deduction, payment processing, and shipment creation via Saga Pattern.
  * Retry policies with Exponential Backoff + Dead-Letter Queues (DLQ).

---

### Day 3: Heavy Read/Write Scale, Review & Dry Runs
*Focus: Pushing scale boundaries and perfecting architectural communication.*

#### Morning: Hands-On System 4
* **Design Target:** **Video Streaming Service (Netflix/Prime Video) or Metrics Monitoring System**
* **Key Focus:**
  * Content Delivery Networks (CDNs), Blob Storage (S3), Video Chunking & Transcoding pipelines.
  * Time-series database ingestion for high-throughput write streams.

#### Afternoon: System Design Cheatsheet & Pattern Map

Match common requirements directly to architectural solutions:

| Need / Problem | Standard Solution |
| :--- | :--- |
| Low Latency Read for Frequently Accessed Data | Redis Cache (Cache-Aside pattern) |
| Extreme Write Throughput / Time-Series Data | Cassandra or DynamoDB |
| Decoupling Heavy Background Jobs | Async Queue (SQS/RabbitMQ/Kafka) |
| Eliminating Double Payments / Duplicate Submissions | Idempotency Key in Redis + DB Unique Index |
| Handling Traffic Spikes / Spike Protection | Rate Limiter + Queue Buffering |
| Hot Key / Heavy Partition Bottleneck | Consistent Hashing + Salt/Pre-pend Partition Keys |

#### Evening: Full Mock Run-Through
* Pick one problem (e.g., *Design a Flash Sale System*), set a 45-minute timer, and draw out:
  1. Functional / Non-functional specs & estimation.
  2. API endpoints and Database schemas.
  3. Complete System Architecture diagram.
  4. Bottleneck analysis (e.g., "What happens when Redis crashes?").

---

## ⚡ HLD Reference Architecture Template

Keep this mental map in mind when drawing your system architecture:

```
                        ┌─────────────────────────┐
                        │   Clients (Mobile/Web)  │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌────────────────────────┐
                        │   CDN (Edge Caching,   │
                        │    Static Assets)      │
                        └────────────┬───────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────┐
                  │  API Gateway / Load Balancer          │
                  │  (SSL Termination, Rate Limiting,     │
                  │   Auth, Request Routing)              │
                  └──────────┬──────────────┬────────────┘
                             │              │
           ┌─────────────────┘              └──────────────────┐
           │                                                    │
           ▼                        ▼                          ▼
┌─────────────────┐      ┌─────────────────────┐    ┌──────────────────┐
│  Order Service  │      │ Inventory Service   │    │ Payment Service  │
└────────┬────────┘      └──────────┬──────────┘    └────────┬─────────┘
         │                          │                         │
    ┌────┴─────┐               ┌────┴─────┐             ┌────┴─────┐
    ▼          ▼               ▼          ▼             ▼          ▼
┌───────┐ ┌───────┐       ┌───────┐ ┌─────────┐   ┌───────┐ ┌───────┐
│ Redis │ │Aurora │       │ Redis │ │DynamoDB │   │ Redis │ │Aurora │
│(Cache)│ │ (DB)  │       │(Cache)│ │  (DB)   │   │(Cache)│ │ (DB)  │
└───────┘ └───────┘       └───────┘ └─────────┘   └───────┘ └───────┘
           │                          │                         │
           └──────────────────────────┴─────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │   Event Bus / Kafka      │
                        │  (Ordered Event Stream)  │
                        └────────────┬────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
         ┌─────────────────────┐          ┌─────────────────────┐
         │  Notification       │          │  Analytics /        │
         │  Worker Service     │          │  Reporting Service  │
         └─────────────────────┘          └─────────────────────┘
```
---

## 💡 Pro Tips for Amazon HLD Interviews
1. **Drive the Interview:** Don't wait for the interviewer to prompt you. Once requirements are set, take ownership of the whiteboard and guide them through your framework.
2. **Numbers Matter (Back-of-the-envelope):**
   * 1 Million DAU ≈ 12 QPS average (100 QPS peak).
   * 100 Million DAU ≈ 1,200 QPS average (10,000 QPS peak).
3. **Always Highlight Failures:** Proactively mention Single Points of Failure (SPOF) and demonstrate how multi-AZ (Availability Zone) deployment, database read replicas, and circuit breakers prevent downtime.