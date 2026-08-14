---
tags: [hld, data-storage, database, amazon-interview]
---
# HLD: Data Storage & Persistence

## 🎯 Why This Section is Critical
Every system design interview converges on one question: *"Which database do you use and why?"* Getting this wrong — or worse, defaulting to "I'll use MySQL" without justification — is the fastest way to fail an Amazon HLD round. This section gives you the vocabulary and decision framework to answer confidently.

---

## 🗄️ SQL vs NoSQL

### SQL (Relational Databases)
**Examples:** PostgreSQL, MySQL, Aurora, SQLite

**Characteristics:**
- Structured schema with tables, rows, columns
- ACID transactions (Atomicity, Consistency, Isolation, Durability)
- Powerful joins and complex queries
- Vertical scaling primarily; horizontal scaling is hard

**Use when:**
- Data has clear relationships (orders → line items → products)
- You need multi-table transactions (payment + inventory deduction)
- Complex reporting queries with aggregations and joins
- Schema is stable and well-defined

### NoSQL (Non-Relational Databases)

| Type | Examples | Best For | Tradeoff |
|---|---|---|---|
| **Key-Value** | Redis, DynamoDB | Sessions, caches, user profiles | No complex queries |
| **Document** | MongoDB, Firestore | Flexible schemas, nested data | Eventual consistency |
| **Wide-Column** | Cassandra, HBase | Time-series, write-heavy, IoT | No joins |
| **Graph** | Neo4j, Neptune | Social graphs, recommendations | Niche use case |
| **Search** | Elasticsearch | Full-text search, log analysis | Not a primary store |

### The Decision Framework

```
Does your data have complex relationships requiring joins?
  YES → SQL (PostgreSQL/Aurora)

Do you need sub-10ms reads at massive scale?
  YES → Key-Value NoSQL (DynamoDB/Redis)

Is your write throughput > 100K writes/sec?
  YES → Wide-Column (Cassandra)

Do you need full-text search?
  YES → Elasticsearch (alongside primary DB)

Is your schema unpredictable or rapidly changing?
  YES → Document DB (MongoDB)
```

### How to Say It in an Interview

> *"For the order service, I'll use Aurora (PostgreSQL-compatible) because orders have relationships — order → line items → products — and I need ACID transactions for the payment + inventory deduction. For the session store, I'll use Redis — it's pure key-value, sub-millisecond, and sessions don't need joins."*

---

## 🔒 Transactions & Isolation Levels

### ACID Properties

| Property | Meaning | Example |
|---|---|---|
| **Atomicity** | All steps succeed or all roll back | Transfer money: debit + credit both succeed or neither does |
| **Consistency** | DB moves from one valid state to another | Balance never goes negative |
| **Isolation** | Concurrent transactions don't interfere | Two users booking the last seat |
| **Durability** | Committed data survives crashes | Written to disk, not just memory |

### Isolation Levels (from weakest to strongest)

```
READ UNCOMMITTED  → can read dirty (uncommitted) data
READ COMMITTED    → only reads committed data (default in PostgreSQL)
REPEATABLE READ   → same query returns same result within a transaction
SERIALIZABLE      → transactions execute as if sequential (strongest, slowest)
```

### Anomalies Each Level Prevents

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|---|---|---|---|
| Read Uncommitted | ❌ Possible | ❌ Possible | ❌ Possible |
| Read Committed | ✅ Prevented | ❌ Possible | ❌ Possible |
| Repeatable Read | ✅ | ✅ | ❌ Possible |
| Serializable | ✅ | ✅ | ✅ |

### When to Use Each

- **Read Committed** — default for most web apps; good balance
- **Repeatable Read** — financial reports, inventory checks
- **Serializable** — seat booking, flash sale inventory (prevent double-booking)

> *"For the seat booking service, I'll use Serializable isolation to prevent two users from booking the same seat. Yes, it's slower — but the alternative is overselling, which is worse. I'll mitigate the performance cost by keeping transactions short and using optimistic locking where possible."*

---

## 🔁 Replication

**Definition:** Copying data across multiple nodes for durability and read scalability.

### Primary-Replica (Leader-Follower)

```
        Writes
          │
          ▼
    ┌─────────────┐
    │   Primary   │ ──── Replication log ────►  ┌──────────┐
    │  (Leader)   │                              │ Replica 1│ ◄── Reads
    └─────────────┘                              └──────────┘
                    ──── Replication log ────►  ┌──────────┐
                                                │ Replica 2│ ◄── Reads
                                                └──────────┘
```

**Synchronous replication:** Primary waits for replica to acknowledge before confirming write.
- ✅ No data loss on primary failure
- ❌ Higher write latency

**Asynchronous replication:** Primary confirms write immediately; replica catches up.
- ✅ Lower write latency
- ❌ Replica may lag; data loss possible if primary crashes before replication

### Multi-Primary (Multi-Master)
Multiple nodes accept writes. Conflict resolution required.
- Use when: geo-distributed writes (users in US and EU both write)
- Complexity: conflict resolution (last-write-wins, vector clocks, CRDTs)

### Replication Lag
The delay between a write on primary and its visibility on replicas.
- Typical: 10ms–100ms for async replication
- Problem: user writes data, reads from replica, sees stale data
- Solution: **read-your-writes consistency** — route user's reads to primary for 1 second after a write

---

## 🔀 Sharding (Partitioning)

**Definition:** Splitting a dataset across multiple nodes by a partition key to scale storage and write throughput.

### Why Shard?
A single DB node has limits: ~10K writes/sec, ~10TB storage. Sharding breaks both limits.

### Sharding Strategies

**Range-based sharding:**
```
Shard 1: user_id 0–999,999
Shard 2: user_id 1M–1,999,999
Shard 3: user_id 2M–2,999,999
```
- ✅ Simple range queries
- ❌ Hot spots if new users cluster in one shard

**Hash-based sharding:**
```
shard = hash(user_id) % num_shards
```
- ✅ Even distribution
- ❌ Range queries require scatter-gather across all shards

**Directory-based sharding:**
A lookup table maps keys to shards.
- ✅ Flexible, can rebalance without rehashing
- ❌ Lookup table is a bottleneck and SPOF

### Consistent Hashing

Solves the problem of adding/removing shards without remapping all keys.

```
Virtual ring: 0 ──────────────────────────── 360°

Nodes placed at positions on ring:
  Node A: 60°
  Node B: 180°
  Node C: 300°

Key K hashes to 100° → assigned to Node B (next clockwise node)

Add Node D at 120°:
  Only keys between 60°–120° move from B to D
  All other keys unaffected
```

**Why it matters:** Without consistent hashing, adding 1 node to a 10-node cluster remaps ~90% of keys. With consistent hashing, only ~10% of keys move.

> *"I'll use consistent hashing for the cache tier. When I add a cache node during a traffic spike, only 1/N of the keys need to be remapped — the rest continue hitting the same node. This prevents a thundering herd on the DB."*

---

## 📇 Indexing

**Definition:** Data structures that speed up queries at the cost of write overhead and storage.

### B-Tree Index (Default in PostgreSQL, MySQL)
- Balanced tree structure
- O(log N) lookup, range queries, ORDER BY
- Use for: primary keys, foreign keys, columns in WHERE clauses

### Hash Index
- O(1) exact-match lookup
- Cannot do range queries
- Use for: equality checks only (e.g., session token lookup)

### Composite Index
```sql
CREATE INDEX idx_user_created ON orders(user_id, created_at);
-- Efficient for: WHERE user_id = ? AND created_at > ?
-- NOT efficient for: WHERE created_at > ? (without user_id)
```
**Rule:** The leftmost prefix of a composite index must be used.

### Inverted Index (Full-Text Search)
Maps words → list of documents containing that word.
- Used by: Elasticsearch, PostgreSQL `tsvector`
- Use for: search boxes, log analysis

### Index Tradeoffs

| | Benefit | Cost |
|---|---|---|
| More indexes | Faster reads | Slower writes (index must be updated), more storage |
| Fewer indexes | Faster writes | Slower reads (full table scan) |

> *"I'll add a composite index on `(user_id, created_at DESC)` for the feed query. This covers the most common access pattern — get the latest N posts for a user — without a full table scan. The write overhead is acceptable since reads outnumber writes 10:1."*

---

## 🗃️ File / Object Storage

**Definition:** Storing large binary assets (images, videos, documents) separately from the database.

### Why Not Store Files in a DB?
- DBs are optimized for structured, queryable data — not binary blobs
- A 10MB image in a DB row bloats indexes, slows backups, kills replication
- Object stores are 10–100x cheaper per GB

### Object Storage (S3, GCS, Azure Blob)
```
Client ──► Pre-signed URL ──► S3 (direct upload, bypasses your server)
                                │
                                ▼
                         CDN (CloudFront)
                                │
                                ▼
                           End Users
```

**Pre-signed URLs:** Your server generates a time-limited URL that allows the client to upload/download directly to S3. Your server never handles the binary data — it just issues the permission.

**Why this matters:** A 1GB video upload goes directly from the user's browser to S3. Your API server handles only the metadata (filename, size, user ID). This keeps your API tier stateless and horizontally scalable.

### Storage Tiers

| Tier | Latency | Cost | Use Case |
|---|---|---|---|
| S3 Standard | ~10ms | $$ | Frequently accessed assets |
| S3 Infrequent Access | ~10ms | $ | Backups, older content |
| S3 Glacier | Minutes | ¢ | Archival, compliance |
| EBS (Block) | <1ms | $$$ | DB storage, OS volumes |
