---
tags: [lld, advanced, system-design, gmail, email]
---
# LLD: Design Gmail

## 🎯 Why This Problem is Asked
Gmail is a classic distributed email system with huge scale and multi-layered storage.

It tests: message ingestion, queueing, search indexing, spam filtering, threading, and retrieval.

---

## 📋 Requirements Clarification

### Functional
- send and receive email
- attachments, labels, threads
- search and filter
- spam detection and handling

### Non-Functional
- high throughput and reliability
- large inbox indexing
- low retrieval latency
- persistence and recovery

---

## 🧩 Core Entities

```java
public class EmailMessage {
    private String messageId;
    private String sender;
    private List<String> recipients;
    private String subject;
    private String body;
    private List<Attachment> attachments;
    private long createdAtMs;
}

public class Thread {
    private String threadId;
    private List<String> messageIds;
    private String latestMessageId;
}
```

---

## 🏗️ LLD Patterns

### 1. Message queue ingestion
Incoming email is placed into a durable queue before processing.

```java
public class EmailIngestionService {
    public void ingest(EmailMessage msg) {
        queue.publish(msg);
    }
}
```

### 2. Search indexing
A full-text index allows fast lookups by sender, subject, and content.

```java
public class SearchIndexService {
    public void index(EmailMessage msg) {
        // push to Elasticsearch / search backend
    }
}
```

### 3. Threading model
Messages with same subject or conversation are grouped into threads.

---

## 🗄️ Database Design

```sql
CREATE TABLE messages (
  message_id UUID PRIMARY KEY,
  sender VARCHAR(255),
  subject TEXT,
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE threads (
  thread_id UUID PRIMARY KEY,
  latest_message_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE message_recipients (
  message_id UUID,
  recipient_email VARCHAR(255),
  seen BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (message_id, recipient_email)
);
```

Object storage preserves raw message payloads; search index provides fast retrieval.

---

## 🔌 API Routes & Contracts

```
POST /v1/emails/send
Request: { "from": "a@x.com", "to": ["b@x.com"], "subject": "Update", "body": "Hello" }

GET /v1/inboxes/{userId}
Response: { "threads": [...] }

GET /v1/search?q=project%20status
```

---

## 🏗️ Service Architecture

```text
Mail Client
   |
   v
SMTP / API Gateway
   |
   +--> Ingestion Service
   +--> Spam Filter
   +--> Search Indexer
   +--> Storage Layer
   +--> Threading / Labeling Service
```

---

## 📐 HLD Concepts

- durable message storage with low-latency reads
- asynchronous processing for spam and indexing
- data partitioning by user or shard
- deduplication and retry for delivery

---

## 🗣️ How to Explain in the Interview

> "Gmail-like systems separate user-specific metadata from raw message payloads. The delivery pipeline can process and index messages asynchronously, while the user inbox view is built from a metadata store and search backend. This keeps operations fast even at huge scale."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Ingestion, indexing, threading, and storage are isolated |
| O | New labeling or spam rules can be added without rewiring the pipeline |
| D | Search and storage backends are behind interfaces |

---

## ⚠️ Follow-up Questions
- How do you prevent spam flooding?
- How do you support label and search performance at huge scale?
- How do you handle attachments and large email bodies?

---

## 🔥 Deep Dive: Production Realities for Gmail

### 1. Ingress and Delivery Pipeline
Email systems are event-driven by nature:
- SMTP or API endpoint receives the message
- ingestion service validates headers and recipients
- duplicates and spam rules are applied
- message is durably stored
- asynchronous indexing and routing workers process it

This separation keeps the write path fast and reliable while allowing expensive processing to happen later.

### 2. Message Storage Model
Gmail needs both raw payload storage and lookup-friendly metadata:
- raw MIME content in object or blob storage
- metadata in a relational or NoSQL store for sender, recipient, thread, labels, flags
- indexing pipeline for search and retrieval

The raw email can be immutable once stored, while the metadata table is updated as labels, read states, and thread relations change.

### 3. Threading and Conversation Logic
Threading is not just subject matching. Real systems often use:
- message-id references
- reply-to and in-reply-to headers
- subject normalization and folding
- time windows for conversation grouping

This creates a user-friendly conversation model without forcing all messages into one big mailbox tree.

### 4. Search and Indexing
Search is a high-value path in email. The design typically uses:
- an inverted index for words, sender, recipients, and labels
- metadata cache for recent inboxes and label pages
- background indexers for attachments and large bodies
- per-user sharding to distribute load

This avoids doing full scans across all emails during each query.

### 5. Spam, Malware, and Abuse Handling
Spam prevention needs many layers:
- IP reputation and sender verification
- content heuristics and ML-based filtering
- attachment sandboxing
- rate limiting on messages per domain or account

The spam service usually sits after ingestion but before delivering to the user’s inbox.

### 6. Large Attachments and Retention
Attachments can dominate storage usage. A good design uses:
- object storage for blobs
- metadata references for thumbnails and previews
- virus scanning and policy enforcement before final delivery
- life-cycle rules for retention, cleanup, and archival

### 7. Failure Modes
- ingest fails after SMTP accepts message but before storage commit
- search index falls behind the metadata DB
- duplicate email arrives from multiple gateways
- a label update is applied but message reads remain stale

Mitigations include idempotent message IDs, repair workers, and eventual consistency between indexing and data store.

### 8. Interview Answer Template
> "I’d build Gmail as an asynchronous ingestion and indexing pipeline around durable message storage. SMTP requests write the raw email to a durable store, then a queue triggers spam filtering, threading, and indexing. Search and inbox listing use separate metadata and search services so the user experience stays responsive even when the raw email store is huge."
