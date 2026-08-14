---
tags: [lld, advanced, system-design, real-time-chat, websocket]
---
# LLD: Design Real-Time Chat System (Millions of Users)

## 🎯 Why This Problem is Asked
Chat systems are about connection routing, message ordering, availability, and scale. They combine:
- presence tracking
- WebSocket management
- push notifications
- fan-out and queueing

---

## 📋 Requirements Clarification

### Functional
- send/receive messages
- group chat, typing, read receipts
- retrieve history
- message search and pagination

### Non-Functional
- high concurrent connections
- low latency
- eventual consistency acceptable for many chat scenarios

---

## 🧩 Core Entities

```java
public class ChatUser {
    private String userId;
    private Set<String> connectionIds;
    private String lastSeenAt;
}

public class ChatMessage {
    private String messageId;
    private String conversationId;
    private String senderId;
    private String body;
    private long createdAtMs;
}
```

---

## 🏗️ LLD Patterns

### 1. Connection mapping
Each online user has multiple sockets, fan-out routed through a connection registry.

```java
public class ConnectionRegistry {
    private final Map<String, Set<String>> userConnections;
}
```

### 2. Publish/subscribe
Message delivery is broadcast to interested clients via pub/sub topics.

```java
public class DeliveryBus {
    public void publish(String conversationId, ChatMessage message) {
        // fan out to subscribers
    }
}
```

### 3. Offline buffering
If a user is offline, persist the message and push when they reconnect.

---

## 🗄️ Database Design

```sql
CREATE TABLE conversations (
  conversation_id UUID PRIMARY KEY,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversation_members (
  conversation_id UUID REFERENCES conversations(conversation_id),
  user_id UUID,
  last_read_ts TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  message_id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(conversation_id),
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_conversation_ts (conversation_id, created_at)
);
```

Redis caches connection state, unread counts, and presence.

---

## 🔌 API Routes & Contracts

```
POST /v1/messages
Request: { "conversationId": "c-1", "senderId": "u-1", "body": "hi" }
Response: { "messageId": "m-9" }

GET /v1/conversations/{conversationId}/messages
Response: { "messages": [...] }
```

WebSockets handle live events: message, typing, delivered, read.

---

## 🏗️ Service Architecture

```text
Clients -> API Gateway -> Chat Service -> Message Store
                            -> Delivery Workers -> WebSocket Layer
                            -> Presence Service
```

---

## 📐 HLD Concepts

- maintain WebSocket fan-out for active users
- use Kafka or queue for distributed delivery
- keep message history durable in DB
- use Redis for presence and unread counters

---

## 🗣️ How to Explain in the Interview

> "The chat system is mainly a presence and delivery problem. I would keep a persistent message store for durability, use Redis for connection and presence data, and fan out messages through a delivery queue when the recipient is active or idle."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Delivery, history, and presence are separate |
| O | New notification channels can be added without changing message routing |
| D | Backends are abstracted behind interfaces |

---

## ⚠️ Follow-up Questions
- How do you handle message ordering in groups?
- How do you deal with very large chat histories?
- How do you route millions of concurrent sockets?

---

## 🔥 Deep Dive: Production Realities for Real-Time Chat

### 1. Socket Layer Design
For millions of users, the socket layer is a dedicated connection broker. It must:
- maintain a mapping from user to connection ids
- fan out messages to active sockets quickly
- detect disconnects and stale connections
- rebalance load when nodes become hot

This layer should not do heavy database writes; it should be optimized for low-latency routing.

### 2. Message Ordering vs Delivery Speed
A chat app should prioritize per-conversation ordering, not global ordering. That means:
- append-only message log per conversation
- sequence numbers per conversation
- delivery workers preserve ordering when sending to the same recipient

This avoids confusing message ordering in group threads.

### 3. Historical Retrieval and Pagination
Large chat histories cannot be loaded in one query. Use:
- cursor-based pagination by timestamp or message id
- lazy loading for older messages
- caching recent conversations for users with active chats

### 4. Notification and Offline Behavior
When a user is offline, use:
- push notifications for high-priority events
- queued delivery when the client reconnects
- unread count caches in Redis for fast summary endpoints

### 5. Interview Answer Template
> "A high-scale chat system uses a fast connection layer for active users and a durable message store for history. Redis or in-memory state tracks connection and presence data, while the database stores message history and conversation metadata. Messages are published to a delivery stream and fan out to active sockets or push notifications when the user is offline."
