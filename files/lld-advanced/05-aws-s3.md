---
tags: [lld, advanced, system-design, aws-s3, object-storage]
---
# LLD: Design AWS S3

## 🎯 Why This Problem is Asked
Amazon S3 is a storage platform problem: highly durable, highly available, strong consistency patterns, object storage architecture, and multi-region replication.

It tests how you reason about object metadata, read/write paths, durability, and cost-aware scalability.

---

## 📋 Requirements Clarification

### Functional
- Store objects with key-value access
- list, upload, download, delete objects
- object versioning and lifecycle rules
- bucket access control and encryption
- object metadata and tags

### Non-Functional
- 11 nines durability target
- high throughput
- globally distributed read access
- low cost per GB
- eventual consistency at some layers, but strong metadata guarantees where needed

---

## 🧩 Core Entities

```java
public class Bucket {
    private String bucketName;
    private String ownerUserId;
    private Map<String, String> tags;
    private boolean versioningEnabled;
}

public class ObjectRecord {
    private String objectKey;
    private String bucketName;
    private String etag;
    private long sizeBytes;
    private long createdAtMs;
    private String storageClass;
    private String contentHash;
}

public class VersionedObject {
    private String objectKey;
    private long version;
    private String blobIdentifier;
    private boolean deleted;
}
```

---

## 🏗️ LLD Patterns

### 1. Object-Key Index
A metadata service maps object key to physical object location.

```java
public class ObjectMetadataService {
    public String resolveBlobLocation(String bucket, String key) {
        return "replica://bucket/key@sha256";
    }
}
```

### 2. Lifecycle & Tiering
Hot objects are stored in fast tiers; cold objects move to archival storage.

```java
public class LifecyclePolicyService {
    public String chooseStorageClass(long ageDays, long sizeBytes) {
        if (ageDays < 30) return "STANDARD";
        if (ageDays < 180) return "IA";
        return "GLACIER";
    }
}
```

### 3. Multi-Region Replication
Write to active region and replicate asynchronously to other regions.

```java
public class ReplicationController {
    public void replicate(String bucket, String key, String region) {
        // async enqueue to replication worker
    }
}
```

---

## 🗄️ Database Design

```sql
CREATE TABLE buckets (
  bucket_name VARCHAR(255) PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  versioning_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE objects (
  bucket_name VARCHAR(255) REFERENCES buckets(bucket_name),
  object_key TEXT NOT NULL,
  size_bytes BIGINT,
  etag VARCHAR(128),
  storage_class VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (bucket_name, object_key)
);

CREATE TABLE object_versions (
  bucket_name VARCHAR(255),
  object_key TEXT,
  version BIGINT,
  blob_identifier TEXT,
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (bucket_name, object_key, version)
);
```

Redis caches:
- recent list operations
- hot object metadata
- bucket permission lookups

---

## 🔌 API Routes & Contracts

```
PUT   /{bucket}/{key}
Request: binary/object bytes
Response: { "etag": "abcd", "version": 12 }

GET   /{bucket}/{key}
Response: file bytes or signed URL

HEAD  /{bucket}/{key}
Response: object metadata

POST  /{bucket}/?versioning=true
Response: { "status": "enabled" }

DELETE /{bucket}/{key}
Response: { "deleted": true }
```

---

## 🏗️ Service Architecture

```text
Client Apps
   |
   v
API Gateway
   |
   +--> Object Metadata Service
   +--> Authorization Service
   +--> Storage Service
   +--> Lifecycle Service
   +--> Replication Service
   |
   +--> Metadata DB (PostgreSQL / Dynamo/NoSQL variant)
   +--> Object Storage (blob service)
   +--> Replication stream / Kafka
```

### Flow
1. Client uploads file
2. Metadata service validates bucket permissions
3. Object store writes data to durable replica set
4. Metadata DB stores object pointer and version info
5. Asynchronous lifecycle/replication jobs handle archival or multi-region copy

---

## 📐 HLD Concepts & Scalability

### Durability
- data written to multiple disks / nodes before ack
- replication across availability zones
- checksum verification on read

### Consistency trade-off
- metadata read guarantees are stronger than stale object reads
- object reads may use eventual consistency depending on replication lag

### Cost optimization
- tiering based on age/frequency
- use multipart upload for large objects
- compress and deduplicate where possible

---

## 🗣️ How to Explain in the Interview

> "S3-style design is really about separating metadata from object data. The actual large payload is stored as immutable blob data in an object storage layer, while a metadata service tracks bucket, key, permissions, version, and lifecycle. This allows massive scale without forcing all reads through a single index."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Metadata, lifecycle, replication, and auth are separated |
| O | New storage class or lifecycle policy can be added without disturbing core logic |
| D | Services use abstraction above storage providers |
| I | Bucket admin, object access, and replication are distinct interfaces |

---

## ⚠️ Follow-up Questions
- How do you handle multipart uploads and retries?
- How do you ensure data integrity checks on reads?
- How do you prevent hotkeys from overloading a shard?
- How do you handle version cleanup cost?

---

## 🔥 Deep Dive: Production Realities for S3

### 1. Object Store Layout
S3 is not just a filesystem. It is a distributed object store with:
- immutable objects
- metadata index for lookup
- replication workers for durability
- lifecycle management and tier transitions

A key insight is that object names are not directories in a strict POSIX sense; they are keys in a flat namespace with logical prefix grouping.

### 2. Metadata Index and Hot Keys
Hot keys dramatically affect performance. If a single key is too popular, it might overload one shard. Mitigations include:
- sharding by bucket and prefix hash
- limiting large-object merge bursts
- caching frequent metadata responses
- content-addressing for repeated uploads

### 3. Multipart Uploads
A robust large-file upload pipeline should:
- split object into chunks
- upload chunks independently with unique upload IDs
- verify checksums per part
- only finalize when all parts are received successfully

This also allows restart after partial failure without re-uploading everything.

### 4. Durability Strategy
Object stores usually ensure durability with:
- multiple replicas across AZs
- checksums at write and read time
- repair jobs for bit rot and silent corruption
- background rebalancing to recover from node loss

### 5. Lifecycle and Cost Optimization
S3 is heavily optimized for cost. Typical workflows:
- hot tier for active objects
- infrequent access storage for older files
- archive or glacier for rarely accessed data
- expiry rules for temporary uploads

This reduces cost while preserving access semantics.

### 6. Interview Answer Template
> "S3 is a specialized object-storage system whose core optimization is separating storage of large immutable blobs from the metadata index that locates them. I’d store content in a durable distributed storage tier, while a metadata service tracks bucket names, object keys, object versions, lifecycle policies, and access control. For high scale, I’d shard metadata, dupe writes across AZs, and cache hot object metadata in Redis to keep read latency low."
