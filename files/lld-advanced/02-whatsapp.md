---
tags: [lld, advanced, system-design, whatsapp, messaging]
---
# LLD: Design WhatsApp

## 🎯 Why This Problem is Asked
WhatsApp is one of the hardest messaging systems because it combines:
- Real-time delivery
- End-to-end encryption
- Presence and typing indicators
- Group chats and notifications
- Massive scale and low latency

This is a classic senior-level design problem for messaging systems, WebSocket management, and distributed state.

---

## 📋 Requirements Clarification

### Functional
- One-to-one chats
- Group chats
- Send attachments and media
- Read receipts and delivery receipts
- Online status and last seen
- Push notifications when app is offline
- Search/chat history retrieval

### Non-Functional
- Send/receive messages within seconds
- Support billions of messages/day
- Low latency even with 100M+ daily active users
- Secure message transport and encryption keys
- Graceful degradation when a user is offline

---

## 🧩 Core Entities

```java
public enum MessageType { TEXT, IMAGE, VIDEO, AUDIO, FILE }
public enum DeliveryStatus { PENDING, SENT, DELIVERED, READ }

public class User {
    private String userId;
    private String phoneNumber;
    private String publicKey;      // for encryption setup
    private String deviceList;
    private long lastSeenAtMs;
}

public class Conversation {
    private String conversationId;
    private List<String> participantIds;
    private String title;
    private boolean isGroup;
    private long lastMessageTs;
}

public class Message {
    private String messageId;
    private String conversationId;
    private String senderId;
    private String receiverId;
    private MessageType type;
    private String payloadEncrypted; // E2E encrypted blob
    private DeliveryStatus status;
    private long createdAtMs;
    private long deliveredAtMs;
    private long readAtMs;
}

public class SessionKey {
    private String userId;
    private String deviceId;
    private String identityKey;
    private String preKey;
    private long lastRotationTs;
}
```

---

## 🏗️ LLD Patterns

### 1. Message Fan-Out
A message is written once to a durable store and then fan-out to recipients or a delivery queue.

```java
public class MessageService {
    private final MessageRepository messageRepo;
    private final DeliveryQueue deliveryQueue;

    public Message sendMessage(String senderId, String receiverId, MessageType type, String payload) {
        String messageId = UUID.randomUUID().toString();
        Message msg = new Message();
        msg.setMessageId(messageId);
        msg.setSenderId(senderId);
        msg.setReceiverId(receiverId);
        msg.setType(type);
        msg.setPayloadEncrypted(encrypt(payload, senderId, receiverId));
        msg.setStatus(DeliveryStatus.PENDING);
        msg.setCreatedAtMs(System.currentTimeMillis());

        messageRepo.save(msg);
        deliveryQueue.publish(new DeliveryTask(receiverId, msg));
        return msg;
    }
}
```

### 2. Encryption and Key Rotation
Each user device has identity keys and ephemeral session keys. Messages are encrypted end-to-end, and the server never sees plaintext.

```java
public class EncryptionService {
    public String encrypt(String plaintext, String senderId, String receiverId) {
        // Use X25519 + AES-256 or similar signal protocol flow
        return "ciphertext";
    }

    public String decrypt(String ciphertext, String receiverId, String senderId) {
        return "plaintext";
    }
}
```

### 3. Presence Tracking
Presence uses Redis or in-memory state to maintain online status and last seen timestamps.

```java
public class PresenceService {
    private final RedisClient redis;

    public void markOnline(String userId, String deviceId) {
        redis.set("presence:" + userId, System.currentTimeMillis(), 60);
    }

    public boolean isOnline(String userId) {
        Long ts = redis.getLong("presence:" + userId);
        return ts != null && (System.currentTimeMillis() - ts < 60_000);
    }
}
```

---

## 🗄️ Database Design

### PostgreSQL for Metadata

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  phone_number VARCHAR(32) UNIQUE,
  display_name VARCHAR(255),
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
  conversation_id UUID PRIMARY KEY,
  title VARCHAR(255),
  is_group BOOLEAN DEFAULT FALSE,
  last_message_ts TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversation_members (
  conversation_id UUID REFERENCES conversations(conversation_id),
  user_id UUID REFERENCES users(user_id),
  joined_at TIMESTAMP DEFAULT NOW(),
  last_read_ts TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  message_id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(conversation_id),
  sender_id UUID REFERENCES users(user_id),
  receiver_id UUID REFERENCES users(user_id),
  type VARCHAR(20),
  payload_encrypted TEXT,
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  INDEX idx_conversation_ts (conversation_id, created_at),
  INDEX idx_sender (sender_id),
  INDEX idx_receiver (receiver_id)
);

CREATE TABLE attachments (
  attachment_id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(message_id),
  object_key TEXT,
  mime_type VARCHAR(100),
  size_bytes BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Redis / Memory for Fast State
```redis
# Online presence
presence:user:123 -> 1710000000000

# Unread counts per conversation
unread:user:123:conv:456 -> 9

# Client connection map
user:123:connections -> set of socketIds

# Typing indicators
typing:conv:456 -> {userId: timestamp}
```

---

## 🔌 API Routes & Contracts

```
POST   /v1/messages/send
Request: {
  "conversationId": "conv-42",
  "receiverId": "user-100",
  "type": "TEXT",
  "payload": "encrypted-message"
}
Response: {
  "messageId": "msg-1",
  "status": "SENT",
  "createdAt": "..."
}

GET    /v1/conversations/{conversationId}/messages
Query: ?cursor=abc&limit=50
Response: {
  "items": [
    { "messageId": "msg-1", "senderId": "u-1", "body": "..." },
    { "messageId": "msg-2", "senderId": "u-2", "body": "..." }
  ],
  "nextCursor": "xyz"
}

GET    /v1/users/{userId}/presence
Response: { "online": true, "lastSeen": "..." }

POST   /v1/typing
Request: { "conversationId": "conv-42", "typing": true }
```

WebSocket channels:
- `/ws/{userId}` for message delivery
- `/ws/{conversationId}` for typing and read receipts

---

## 🏗️ Service Architecture

```text
Mobile/Web Clients
      |
      v
   API Gateway
      |
  ┌---v--------------------┐
  │ Auth + User Service    │
  └---+--------------------┘
      |
  ┌---v--------------------┐
  │ Message Service        │
  │ - persist messages     │
  │ - queue delivery       │
  └---+--------------------┘
      |
      +------------------+-------------------+
      |                  |                   |
      v                  v                   v
  Delivery Worker     Presence Service    Media Service
  Kafka + Redis       Redis + State        Object Storage
      |
      v
   Notification Service
```

### Message flow
1. Sender sends encrypted text or media
2. Message service stores metadata in PostgreSQL
3. Blob is stored in object storage for media
4. Delivery queue publishes to recipients
5. Delivery service pushes to active sockets or FCM/APNS
6. Recipient acknowledges read/delivery states
7. Presence service updates online/last-seen

---

## 📐 HLD Concepts & Scalability

### Horizontal Scaling
- Partition conversations by `conversationId` hash
- Keep presence in Redis for fast checks
- Use Kafka for async fan-out of notifications
- Use `userId` sharding for user metadata

### Delivery Guarantee
- Messages are durably stored before acknowledgement
- If the receiver is offline, push notifications are queued
- Delivery is retried with exponential backoff

### Consistency Model
- Message metadata is strongly consistent within a shard
- Read receipts and presence are eventually consistent
- End-to-end encryption means the service cannot read message content

---

## 🗣️ How to Explain in the Interview

> "A WhatsApp-like system has two core problems: delivering messages quickly while preserving privacy. I would separate metadata from content. The server stores message metadata and routing information in a relational store, while ciphertext is stored in object storage or blob storage. 

For real-time delivery, I would keep a WebSocket connection per user and a Redis-based presence cache. When a message is sent, I persist it and push it to the recipient's socket. If the user is offline, I enqueue a notification and rely on push services to deliver when the app reconnects.

For encryption, I would use a Signal-style protocol with per-device keys and signed identity keys. The server only handles routing, not plaintext. This preserves E2E security while still supporting multi-device sync."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | MessageService, DeliveryService, PresenceService are separate |
| O | New message types can be added without refactoring core logic |
| D | Services depend on repositories and interfaces, not concrete storage backends |
| L | Presence or media failures do not crash message storage |
| I | Authentication, encryption, and delivery concerns are separated |

---

## ⚠️ Follow-up Questions to Prepare
- How do you handle high fan-out group chats with 50k users?
- How do you ensure message ordering in groups?
- How do you handle offline delivery and stale device states?
- How do you support multi-device sync without leaking data?
- How do you prevent abuse, spam, and rate-limits?

---

## 🔥 Deep Dive: Production Realities for WhatsApp

### 1. Message Storage Model
A messaging app needs both metadata durability and privacy-safe storage:
- message metadata: conversation id, sender, timestamp, status, group id
- payload: encrypted blob or media reference
- attachments: stored separately in object storage with a secure key

This allows the server to route messages without decrypting their body.

### 2. Multi-Device Support
WhatsApp supports multiple devices for the same account. That means message state must be tracked per device: 
- one identity key per device
- one session key per conversation-device pair
- robust key rotation and re-registration when a device is reinstalled

The server must maintain a device map but must never read plaintext content.

### 3. Presence and Online State
Presence is often implemented with a heartbeat mechanism:
- each socket writes a timestamp to Redis
- if a user has not been seen in 60s, mark them offline
- use a presence topic for typing + online states

For scaling, presence is cached in-memory and replicated across nodes.

### 4. Group Chat Scaling
For a group with 50,000 members:
- message fan-out should not happen on the main API thread
- use a delivery queue and worker pool
- each group message is persisted once and then scheduled for delivery to recipients
- if a recipient is offline, push notification is created or a message is queued until reconnect

### 5. Message Ordering and Deduplication
In distributed systems, message ordering gets tricky. The usual pattern is:
- each conversation has a sequence number or lamport-like ordering
- the server assigns a stable conversation-ordering key on write
- delivery workers respect that order per conversation
- deduplication uses message IDs and retries with idempotent writes

### 6. Offline and Push Notification Behavior
When a user is offline:
- store the message in durable storage
- enqueue push notification through APNS or FCM
- deliver only the latest unread message summary or badge count for efficiency

If a device reconnects, it fetches missed messages using message IDs stored in its local cache.

### 7. Security and Abuse Controls
Message systems have to deal with spam and abuse:
- rate-limit outbound messages by user and by group
- detect phishing links and malicious attachments
- quarantine suspicious media files for deeper scan
- apply message expiry policy when required

### 8. Capacity Planning
For 100M+ daily users:
- connection brokers handle WebSocket fan-out
- Kafka or durable topic processing for message delivery
- Redis for cached presence and state
- metadata DB sharded by user or conversation
- object storage for media transformations and attachment chunks

### 9. Interview Answer Template
> "I would build a WhatsApp-like system as a combination of durable metadata storage, an online connection layer, and an async delivery pipeline. The server stores message metadata in a consistent relational database, stores media in object storage, and uses Redis for presence and connection routing. For real-time delivery, active clients stay connected through WebSockets, while offline users receive queued messages and push notifications. Security is maintained by end-to-end encryption using per-device keys and a central routing layer that never sees plaintext."
