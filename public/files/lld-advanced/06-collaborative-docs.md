---
tags: [lld, advanced, system-design, google-docs, collaboration]
---
# LLD: Design Collaborative Document Editing (Google Docs)

## 🎯 Why This Problem is Asked
Collaborative editors test:
- real-time editing
- conflict resolution at scale
- presence tracking
- versioning and audit trails
- eventual consistency under concurrent operations

This is typically discussed along with OT (Operational Transformation) and CRDTs.

---

## 📋 Requirements Clarification

### Functional
- multiple users editing same document simultaneously
- show typed characters without huge lag
- maintain document history and revisions
- track cursors or presence
- support comments and suggestions

### Non-Functional
- low-latency updates under concurrent editing
- safe conflict resolution
- support large documents
- fast snapshot retrieval

---

## 🧩 Core Entities

```java
public class Document {
    private String documentId;
    private String ownerUserId;
    private String title;
    private long version;
    private String content;
    private long updatedAtMs;
}

public class EditOperation {
    private String operationId;
    private String documentId;
    private String userId;
    private int position;
    private String opType; // INSERT / DELETE / REPLACE
    private String payload;
    private long baseVersion;
    private long createdAtMs;
}

public class PresenceState {
    private String userId;
    private String documentId;
    private int cursorPosition;
    private boolean isTyping;
    private long lastSeenAtMs;
}
```

---

## 🏗️ LLD Patterns

### 1. Operational Transformation (OT)
Transforms remote operations against local state to preserve correctness.

```java
public class OTTransformer {
    public EditOperation transform(EditOperation local, EditOperation remote) {
        // If both modify same region, re-base remote op against local changes.
        return remote;
    }
}
```

### 2. CRDT (Conflict-Free Replicated Data Type)
Useful when you want eventual consistency without central ordering conflicts.

```java
public class CrdtDocument {
    public void insert(int position, String text) { }
    public void delete(int rangeStart, int rangeEnd) { }
}
```

### 3. Presence Updates
Clients send cursor and typing updates via websocket.

```java
public class PresenceService {
    public void updateCursor(String documentId, String userId, int position) {
        // write to Redis and fan out to other collaborators
    }
}
```

---

## 🗄️ Database Design

```sql
CREATE TABLE documents (
  document_id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  title VARCHAR(255),
  version BIGINT NOT NULL DEFAULT 0,
  content TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE edit_operations (
  operation_id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(document_id),
  user_id UUID NOT NULL,
  position INT,
  op_type VARCHAR(20),
  payload TEXT,
  base_version BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_document_version (document_id, base_version)
);

CREATE TABLE collaborators (
  document_id UUID REFERENCES documents(document_id),
  user_id UUID NOT NULL,
  permission VARCHAR(20),
  last_seen TIMESTAMP,
  PRIMARY KEY (document_id, user_id)
);
```

Redis stores:
- active cursors and presence states
- recent operations for quick replay
- document snapshot cache

---

## 🔌 API Routes & Contracts

```
GET /v1/documents/{docId}
Response: { "documentId": "d-1", "title": "Q3 Plan", "version": 12 }

POST /v1/documents/{docId}/ops
Request: { "baseVersion": 11, "op": { "type": "INSERT", "position": 10, "text": "x" } }
Response: { "newVersion": 12 }

GET /v1/documents/{docId}/presence
Response: { "users": [{"userId": "u-1", "cursor": 40, "typing": true}] }
```

WebSocket events:
- cursor movement
- typing indicator
- document update push
- comments / reactions

---

## 🏗️ Service Architecture

```text
Web Clients
   |
   v
API Gateway
   |
   +--> Document Service
   +--> Edit Transform Service
   +--> Presence Service
   +--> Notification Service
   |
   +--> PostgreSQL
   +--> Redis
   +--> Kafka / Event Bus
```

### Flow
1. Client sends edit operation with base version
2. Transform service rebases against concurrent edits
3. Document store updates content and version
4. Update is broadcast to all connected clients
5. Presence data updates cursor and typing indicators

---

## 📐 HLD Concepts & Scalability

### Consistency Model
- Document state should be eventually consistent across clients
- strict ordering is required within a document stream, but not necessarily globally

### Conflict handling
- if two users edit same region, transform or CRDT resolves it
- if impossible to resolve automatically, create a conflict note or merge view

### Scaling
- shard documents by high-volume document IDs
- cache hot docs and recent changes in Redis
- push updates using websocket fan-out

---

## 🗣️ How to Explain in the Interview

> "The critical problem is not the text itself, but reconciling concurrent edits. I would model a document as a versioned object and represent each user action as an operation that references a base version. The transform layer resolves conflicts by comparing operations and rebasing them so that no one’s update is silently lost."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | DocumentService, TransformService, PresenceService distinct |
| O | New operation types can be added without rewriting the document model |
| D | Storage access is abstracted behind repository interfaces |
| I | Presence and editing capabilities are separated |

---

## ⚠️ Follow-up Questions
- How do you handle large documents and frequent edits?
- What happens if the same text is changed concurrently by multiple users?
- How do you support offline edits and merge later?
- How do you persist change history without huge write amplification?

---

## 🔥 Deep Dive: Production Realities for Collaborative Editing

### 1. OT vs CRDT Debate
The core complexity is concurrent edits. Two dominant strategies exist:
- OT: server transforms operations against each other to maintain consistency
- CRDT: operations are modeled as commutative structures so they can merge deterministically

For modern collaborative editing, CRDT is often favored for offline editing and peer-to-peer consistency, while OT remains common in server-centric systems.

### 2. Document Model and Change Tracking
A collaborative document is not just plain text. You need:
- document version counter
- per-user cursor state
- per-operation metadata
- commit log or snapshot log

Two users editing the same paragraph should never silently overwrite each other.

### 3. Presence and Cursor Sync
To support real-time collaboration:
- maintain a per-document presence map
- update cursor positions over a websocket
- track typing state and active editing participants
- prune stale presence after inactivity timeout

### 4. Save and Snapshot Optimization
Saving each keystroke to the database is too expensive. Instead:
- batch edits in a short window
- persist aggregated change logs periodically
- produce snapshots at intervals to support fast reloads

This balances latency and storage cost.

### 5. Failure Modes
A distributed editing system can fail in subtle ways:
- client sends an edit on stale base version
- server reorders edits across regions
- two clients concurrently modify the same paragraph
- users reconnect after being offline for hours

The fix is transform or CRDT resolution plus robust replay of recent operations.

### 6. Interview Answer Template
> "I’d model collaborative editing as a real-time state synchronization problem. A document would have a deterministic version history and a transform layer that resolves conflicting edits. The system would persist operations or snapshots, broadcast changes to connected clients, and track presence separately. For offline edits, I’d apply transforms or CRDT merges when the client reconnects so no user’s work is lost."
