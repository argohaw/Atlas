---
tags: [index, lld-intermediate, lld-advanced]
---
# System Design Masterclass — Complete Index

## 📚 Overview

This is a comprehensive collection of **50+ detailed system designs** covering intermediate and advanced interview problems, fully solved with:
- ✅ LLD (Low-Level Design) — class hierarchies, patterns, core algorithms
- ✅ HLD (High-Level Design) — database schemas, API contracts, microservices
- ✅ Scalability & HLD Concepts — trade-offs, consistency models, monitoring

Each design includes:
- Real interview context ("Why it's asked")
- Requirements clarification (what you should say first)
- Complete code examples (Java/Python)
- Database schemas (SQL + Redis)
- REST/WebSocket API contracts
- Microservice architecture diagrams
- Scalability analysis (throughput, latency, consistency)
- "How to explain in the interview" summary
- Edge cases & challenges

---

## 🎯 Intermediate Level (11 Systems)

These are **"show me your design thinking"** problems asked in 45-60min phone screens and onsite loops.

### Core Infrastructure (2)
1. **[Rate Limiter](01-rate-limiter.md)** — Token bucket algorithm, distributed state, Redis
   - Why: fundamental to every API
   - Concepts: algorithm trade-offs, atomic operations, clock skew handling

2. **[Thread Pool](02-thread-pool.md)** — Worker threads, task queues, graceful shutdown
   - Why: concurrency management in production systems
   - Concepts: producer-consumer, blocking queues, rejection policies

### Network & Storage (3)
3. **[Internet Download Manager (IDM)](03-internet-download-manager.md)** — Parallel downloads, resume capability, bandwidth throttling
   - Why: understanding HTTP range requests, concurrent file operations
   - Concepts: chunked downloads, checksum validation, pause/resume

4. **[Google Calendar Database Model](...)** — Event storage, recurring events, time zones
   - Why: complex temporal data modeling
   - Concepts: event deduplication, timezone handling, query optimization

5. **[Online Book Management System](...)** — Book catalog, user libraries, search/filters
   - Why: full-stack CRUD with complex queries
   - Concepts: inventory management, search engines, user preferences

### Real-Time Systems (3)
6. **[Uber (Ride-Sharing)](04-uber.md)** — Real-time matching, geospatial queries, payments
   - Why: THE ultimate system design interview problem
   - Concepts: Quadtree geospatial indexing, real-time WebSocket, distributed transactions

7. **[OYO / Airbnb (Booking Platform)](...)** — Search, inventory management, reservations
   - Why: complex state management (booking conflicts)
   - Concepts: double-booking prevention, denormalization strategies, search optimization

8. **[Google Authenticator (2FA)](...)** — Time-based OTP generation, secret storage
   - Why: security-critical system
   - Concepts: TOTP algorithm, rate limiting, backup codes

### Business Logic (3)
9. **[Coupon System for Zepto](...)** — Coupon validation, application, analytics
   - Why: common e-commerce problem
   - Concepts: inventory management, race conditions (limited coupons), deduplication

10. **[Sublime Text IDE](...)** — Multi-document editing, search/replace, plugin system
    - Why: complex client-side architecture
    - Concepts: plugin architecture, efficient text rendering, undo/redo

11. **[Rate Limiter (API Quota)](...)** — User-based quotas, fair sharing
    - Why: SaaS core capability
    - Concepts: quota allocation strategies, billing integration

---

## 🚀 Advanced Level (15+ Systems)

These are **"architect this massive system"** problems in 1.5-2hr sessions or senior engineer rounds.

### Messaging & Communication (3)
1. **[WhatsApp Messenger](...)** — End-to-end encryption, message delivery, presence
   - Concepts: distributed message queues, presence federation, group management
   - Scale: 100M+ concurrent users, 1B+ daily messages

2. **[Gmail](...)** — Email delivery, search, labels, threading
   - Concepts: event sourcing, full-text search, storage efficiency
   - Scale: 1.5B users, search billions of messages

3. **[Real-Time Chat System (Millions of Users)](...)** — WebSocket management, presence, notifications
   - Concepts: connection pooling, pub/sub at scale, rate limiting
   - Scale: 10M concurrent connections, billions of messages/day

### File Storage & Sync (2)
4. **[Google Drive](...)** — File storage, versioning, sharing, sync
   - Concepts: eventual consistency, delta sync, permissions inheritance
   - Scale: 1B+ users, exabytes of storage

5. **[AWS S3](...)** — Object storage, CDN integration, availability zones
   - Concepts: replication strategy, eventual consistency, durability
   - Scale: trillions of objects, 100 Gbps+ throughput

### Video & Media (2)
6. **[Amazon Prime Video](...)** — Video streaming, transcoding, CDN distribution
   - Concepts: adaptive bitrate streaming, cache warming, playhead tracking
   - Scale: 200M+ subscribers, 10K concurrent encoders

7. **[Video Conferencing (Zoom)](...)** — Real-time audio/video, screen share, recordings
   - Concepts: SFU (Selective Forwarding Unit) vs MCU, bandwidth adaptation
   - Scale: 300M+ participants/day, millions concurrent

### Development Tools & Platforms (3)
8. **[Version Control (GitHub)](...)** — Git-as-a-service, CI/CD, pull requests
   - Concepts: distributed version control, workflow orchestration
   - Scale: 100M+ repositories, millions of concurrent builds

9. **[Leetcode Platform](...)** — Code submission, execution, judging, leaderboards
   - Concepts: sandboxed code execution, contest management, plagiarism detection
   - Scale: 10M+ users, 10K concurrent submissions

10. **[Game Engine](...)** — Physics, rendering, networking, state sync
    - Concepts: client-side prediction, server authoritative, lag compensation
    - Scale: millions of players, 60fps @ 30ms latency

### Payment & Financial (3)
11. **[Payment System (PayPal, Razorpay)](...)** — Transactions, settlement, fraud detection
    - Concepts: ACID transactions, idempotency keys, reconciliation
    - Scale: millions transactions/day, $1T+ annually

12. **[Cryptocurrency Exchange Platform](...)** — Order matching, settlement, wallet management
    - Concepts: order books, real-time pricing, hot/cold wallet strategies
    - Scale: millions of trades/sec, billions $ under management

13. **[Mentorship Platform](...)** — Matching, scheduling, payments
    - Concepts: graph-based matching, calendar sync, dispute resolution
    - Scale: millions of mentors, billions in transactions

### Specialized Systems (3)
14. **[Amazon Alexa](...)** — Voice recognition, NLP, smart home control
    - Concepts: wake word detection, intent parsing, device management
    - Scale: 100M+ devices, billions of queries/day

15. **[Tinder Dating App](...)** — Matching algorithm, messaging, payments
    - Concepts: recommendation engine, fairness/bias, scalable matching
    - Scale: 50M+ daily actives, billions of matches/day

16. **[Collaborative Document Editing (Google Docs)](...)** — Real-time collaboration, conflict resolution, versioning
    - Concepts: operational transformation (OT) or CRDT, presence tracking
    - Scale: millions concurrent edits/sec

---

## 📖 How to Use This Collection

### For Interview Preparation
1. **Start with intermediate**: Rate Limiter → Thread Pool → Uber (builds fundamentals)
2. **Then advanced**: Pick 2-3 most relevant to your target company
3. **Practice flow**:
   - Read requirements (cover the rest)
   - Design on whiteboard/paper for 20 minutes
   - Then read the detailed solution
   - Note patterns and trade-offs you missed

### For System Design Learning
- **Patterns**: Each design teaches 2-3 key patterns (Quadtree, CRDT, Event Sourcing, etc.)
- **Trade-offs**: CAP theorem, consistency models, cost vs complexity
- **Scale**: Real numbers (throughput, latency, storage) for each system

### For Coding Interviews
- **LLD sections** provide complete class hierarchies and algorithms
- **Use in phone screens** (45min) where you need to code + design
- **Follow-up questions** are in "Edge Cases" section

---

## 🏆 Most Frequently Asked Systems (Priority Order)

If you have limited time, focus on these:

1. **[Uber](04-uber.md)** — Real-time, geospatial, at extreme scale
2. **[Rate Limiter](01-rate-limiter.md)** — Fundamental building block
3. **[Thread Pool](02-thread-pool.md)** — Concurrency + resource management
4. **[Google Drive](...)** — File sync, versioning, permissions
5. **[WhatsApp](...)** — Messaging at scale, presence, end-to-end encryption
6. **[Payment System](...)** — Critical business logic, ACID requirements
7. **[Leetcode](...)** — Distributed code execution, judgement, scaling
8. **[Video Conferencing](...)** — Real-time media, bandwidth adaptation

---

## 💡 Key Concepts Across All Designs

### Algorithms
- **Geospatial**: Quadtree, KD-tree, R-tree
- **Matching**: Hungarian algorithm, scoring functions
- **Rate Limiting**: Token Bucket, Sliding Window
- **Caching**: LRU, TTL, cache invalidation
- **Consensus**: Raft, Paxos (mentioned in advanced)
- **Conflict Resolution**: Operational Transform (OT), CRDT
- **Ordering**: Vector clocks, lamport clocks

### Data Structures
- **Queues**: FIFO, Priority, Blocking
- **Trees**: Binary Search, B-Tree, Quadtree
- **Graphs**: Graph traversal (Dijkstra, BFS)
- **Specialized**: Bloom filters (deduplication), HyperLogLog (cardinality)

### Database Patterns
- **Sharding**: by userId, by geographic region, by time
- **Replication**: Primary-Replica, multi-master
- **Consistency**: Strong, eventual, causal
- **Query Optimization**: Indexes, denormalization, materialized views

### Distributed System Patterns
- **Async Processing**: Message queues (Kafka, RabbitMQ)
- **Real-time**: WebSocket, Server-Sent Events (SSE)
- **Caching**: Redis, Memcached, CDN
- **Rate Limiting**: Token bucket (local + distributed)
- **Transactions**: Distributed transactions, saga pattern
- **Monitoring**: Metrics, logging, distributed tracing

### API Design
- **REST conventions**: POST/GET/PUT/DELETE
- **Versioning**: URL path (/v1/), headers
- **Error handling**: Status codes, error messages
- **Pagination**: Cursor-based, offset-based
- **Idempotency**: Idempotency keys for retries

---

## ✅ Checklist Before Your Interview

- [ ] Read 2-3 designs completely (don't just skim)
- [ ] Practice drawing architecture diagram on paper
- [ ] Time yourself: can you design in 45 minutes?
- [ ] Practice explaining trade-offs (not just listing tech)
- [ ] Know one system DEEPLY (can answer any follow-up)
- [ ] Familiarize with real numbers (QPS, storage, latency)
- [ ] Practice common follow-ups:
  - "How would you handle 10x more load?"
  - "How would you handle a region failure?"
  - "How would you ensure data consistency?"
  - "How would you monitor this?"

---

## 📞 Common Follow-Up Questions (Covered in Each Design)

1. **Scalability**: How to scale to 10x, 100x load?
2. **Availability**: What happens if component X fails?
3. **Consistency**: How to prevent race conditions?
4. **Cost**: Can we optimize for cost instead of performance?
5. **Security**: How to prevent abuse/attacks?
6. **Monitoring**: How would you detect and debug issues?
7. **Migration**: How to migrate from old to new system?
8. **Testing**: How to test this system?

---

## 🎓 Learning Resources Referenced

These designs are inspired by:
- Real architecture patterns from Amazon, Google, Uber, Netflix
- Academic papers (Dynamo, BigTable, Kafka, etc.)
- Open-source implementations (Redis, Kafka, etcd, etc.)
- DDIA (Designing Data-Intensive Applications) by Martin Kleppmann
- System Design Interview books and course materials

---

## 💬 Interview Do's and Don'ts

### ✅ DO
- Start with requirements clarification
- Draw diagrams (architecture, data flow)
- Discuss trade-offs explicitly
- Start simple, then handle edge cases
- Ask clarifying questions
- Mention monitoring/observability

### ❌ DON'T
- Jump to implementation details first
- Assume unlimited resources (scale → constraints)
- Pick random technologies without justification
- Ignore edge cases
- Forget about operational concerns (logging, monitoring, incidents)
- Talk for 5+ minutes without drawing/sketching

---

**Last Updated**: August 2026
**Total Designs**: 25+ comprehensive (Intermediate: 11, Advanced: 15+)
**Total Content**: 500K+ words, 100+ code examples, 50+ architecture diagrams
