# 7. Apache Kafka

# 7.1 Core Architecture

```text
Producer
   ↓
Topic
 ┌─┼─┐
P0 P1 P2
 ↓  ↓  ↓
Consumers
```

Key concepts:

- Broker
- Cluster
- Topic
- Partition
- Producer
- Consumer
- Consumer group
- Offset
- Replication

---

# 7.2 Topic

A logical stream/category of records.

Examples:

```text
booking-events
payment-events
flight-status-events
```

Topics are divided into partitions.

---

# 7.3 Partition

A partition is an ordered log.

Ordering is guaranteed **within a partition**, not globally across every partition.

```text
Partition 0:
0 → 1 → 2 → 3

Partition 1:
0 → 1 → 2 → 3
```

### Interview question

> Does Kafka guarantee ordering?

Strong answer:

> Kafka preserves ordering within a partition. If messages are distributed across multiple partitions, there is no single global ordering across those partitions.

---

# 7.4 Keys and Partitioning

A key is commonly used to ensure related records go to the same partition.

Example:

```text
bookingId = B123
```

Events for the same booking can be routed consistently to one partition.

This allows per-booking ordering.

Trade-off:

A poor key can create hot partitions.

---

# 7.5 Consumer Groups

Within one consumer group, a partition is actively assigned to at most one consumer at a time.

Example:

```text
Topic: 6 partitions

Consumer Group A:
Consumer 1 → partitions 0,1
Consumer 2 → partitions 2,3
Consumer 3 → partitions 4,5
```

If there are more consumers than partitions, some consumers may be idle.

Consumer groups allow:

- Parallelism
- Scaling
- Independent applications to consume the same topic

Different consumer groups can consume the same records independently.

---

# 7.6 Offsets

An offset identifies a record position within a partition.

Example:

```text
Partition 0:
offset 0
offset 1
offset 2
offset 3
```

Consumers track progress through offsets.

---

# 7.7 What Happens if a Consumer Crashes?

Suppose:

```text
Process record at offset 100
↓
Database update succeeds
↓
Consumer crashes
↓
Offset not committed
```

After restart, offset 100 may be delivered again.

Therefore:

> At-least-once delivery often requires idempotent processing.

---

# 7.8 Consumer Rebalancing

When consumers join or leave a group, partition assignments can change.

Example:

```text
Before:
C1 → P0,P1
C2 → P2,P3

C3 joins

After rebalance:
C1 → ...
C2 → ...
C3 → ...
```

Rebalancing can temporarily affect consumption.

Understand the impact on:

- Throughput
- Long-running processing
- Consumer stability

Avoid unnecessary consumer restarts.

---

# 7.9 Producer acks

Common concepts:

## acks=0

Producer does not wait for broker acknowledgment.

Lower latency, weaker durability assurance.

## acks=1

Leader acknowledgment.

## acks=all

Requires acknowledgment according to configured in-sync replica behavior.

Higher durability confidence with additional trade-offs.

Do not answer:

> "acks=all means data can never be lost."

Durability depends on broader configuration and failure conditions.

---

# 7.10 Replication

Partitions can have replicas.

Conceptually:

```text
Partition leader
     ↓
Follower replicas
```

Replication improves fault tolerance.

---

# 7.11 Delivery Semantics

## At-most-once

Messages may be lost, but duplicates are avoided by processing/commit strategy.

## At-least-once

Messages can be redelivered, so duplicates are possible.

## Exactly-once

A stronger processing guarantee within specific Kafka-supported workflows and boundaries.

Important interview nuance:

> "Exactly once" does not mean every arbitrary external side effect, such as an arbitrary third-party API call, automatically becomes exactly-once.

End-to-end exactly-once behavior requires careful design.

---

# 7.12 Consumer Lag

Consumer lag is the difference between available records and consumer progress.

High or growing lag can indicate:

- Consumers cannot keep up
- Slow processing
- Downstream dependency issues
- Too little parallelism
- Insufficient partitions
- Resource problems

### Troubleshooting approach

1. Confirm lag by topic/partition.
2. Check consumer health.
3. Check processing latency.
4. Check downstream dependencies.
5. Check partition distribution.
6. Scale appropriately.
7. Avoid blindly adding consumers beyond partition count.

---

# 7.13 Retries and Dead Letter Topics

A bad message should not permanently block processing.

Potential approach:

```text
Main topic
   ↓ failure
Retry topic / delayed retry
   ↓ repeated failure
Dead letter topic
   ↓
Investigation / correction / replay
```

A robust design considers:

- Retryable vs non-retryable errors
- Backoff
- Maximum attempts
- Poison messages
- Observability
- Safe replay

Do not immediately send every exception to a DLT.

---

# 7.14 Poison Messages

A message can repeatedly fail because of:

- Invalid schema/data
- Unsupported event version
- Business invariant failure
- Application bug

Without a strategy:

```text
Message fails
→ retry
→ fails
→ retry forever
```

This can block a partition depending on design.

Use bounded retry and a dead-letter/recovery process where appropriate.

---

# 7.15 Kafka and Database Consistency

Never assume:

```text
Consume event
Update DB
Commit offset
```

is magically atomic across Kafka and an arbitrary database.

Design for failures between every step.

Ask:

- What if DB succeeds and offset commit fails?
- What if offset commits and DB fails?
- What if the application crashes?

Use appropriate idempotency, transactions, outbox/inbox patterns and infrastructure guarantees.

---

# 7.16 Schema Evolution

Events evolve.

Version 1:

```json
{
  "bookingId": "B123",
  "status": "CONFIRMED"
}
```

Later:

```json
{
  "bookingId": "B123",
  "status": "CONFIRMED",
  "source": "MOBILE"
}
```

Producers and consumers may not deploy simultaneously.

Consider:

- Backward compatibility
- Forward compatibility
- Schema registry approaches
- Explicit versioning when necessary

Never casually rename/remove fields without considering existing consumers.