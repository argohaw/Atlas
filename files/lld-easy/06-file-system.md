---
tags: [lld, easy, system-design, amazon-interview]
---
# LLD: Design a File System

## 🎯 Why This Problem is Asked
A file system is the canonical **Composite pattern** problem. Amazon asks it to test whether you can model a recursive tree structure cleanly, handle path resolution, and think about permissions, metadata, and concurrency — all without a god-class.

---

## 📋 Requirements Clarification

**Functional:**
- Create, delete, read, write files
- Create, delete, list directories
- Navigate using absolute paths (`/home/user/docs/file.txt`)
- Support metadata: size, created/modified timestamps, permissions
- Search files by name or extension

**Non-Functional:**
- In-memory (no disk I/O)
- Thread-safe for concurrent reads/writes
- Read latency < 1ms, write latency < 5ms for in-memory operations

---

## 🧩 Core Entities & Enums

```java
public enum Permission { READ, WRITE, EXECUTE }
public enum FileType { FILE, DIRECTORY }

public class Metadata {
    private final String name;
    private final long createdAt;
    private long modifiedAt;
    private long size;
    private final Set<Permission> permissions;
}

// Composite pattern root
public abstract class FileSystemNode {
    protected Metadata metadata;
    public abstract FileType getType();
    public abstract long getSize();
    public abstract List<FileSystemNode> search(String query);
}

public class File extends FileSystemNode {
    private byte[] content;
}

public class Directory extends FileSystemNode {
    private final Map<String, FileSystemNode> children; // name -> node
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Composite (File & Directory)

```java
public class Directory extends FileSystemNode {
    private final Map<String, FileSystemNode> children = new LinkedHashMap<>();

    @Override
    public long getSize() {
        // Recursive: directory size = sum of all children sizes
        return children.values().stream()
            .mapToLong(FileSystemNode::getSize)
            .sum();
    }

    @Override
    public List<FileSystemNode> search(String query) {
        List<FileSystemNode> results = new ArrayList<>();
        for (FileSystemNode child : children.values()) {
            if (child.getName().contains(query)) results.add(child);
            results.addAll(child.search(query)); // recurse
        }
        return results;
    }

    public void addChild(FileSystemNode node) {
        children.put(node.getName(), node);
    }
}

public class File extends FileSystemNode {
    @Override
    public long getSize() { return content.length; }

    @Override
    public List<FileSystemNode> search(String query) {
        return getName().contains(query) ? List.of(this) : List.of();
    }
}
```

**Why Composite?** `getSize()` on a directory recursively sums all children. `search()` recursively traverses the tree. The caller never needs to know if it's dealing with a file or directory.

### Path Resolution

```java
public class FileSystem {
    private final Directory root = new Directory("/");

    public FileSystemNode resolve(String absolutePath) {
        String[] parts = absolutePath.split("/");
        FileSystemNode current = root;
        for (String part : parts) {
            if (part.isEmpty()) continue; // leading slash
            if (!(current instanceof Directory))
                throw new NotADirectoryException(part);
            current = ((Directory) current).getChild(part)
                .orElseThrow(() -> new FileNotFoundException(part));
        }
        return current;
    }

    public File createFile(String path, byte[] content) {
        String parentPath = path.substring(0, path.lastIndexOf('/'));
        String name = path.substring(path.lastIndexOf('/') + 1);
        Directory parent = (Directory) resolve(parentPath.isEmpty() ? "/" : parentPath);
        File file = new File(name, content);
        parent.addChild(file);
        return file;
    }
}
```

### Thread Safety — ReadWriteLock

```java
public class File extends FileSystemNode {
    private byte[] content;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public byte[] read() {
        lock.readLock().lock();
        try { return Arrays.copyOf(content, content.length); }
        finally { lock.readLock().unlock(); }
    }

    public void write(byte[] newContent) {
        lock.writeLock().lock();
        try {
            this.content = newContent;
            metadata.setModifiedAt(System.currentTimeMillis());
            metadata.setSize(newContent.length);
        } finally { lock.writeLock().unlock(); }
    }
}
```

**Why `ReadWriteLock`?** Multiple threads can read simultaneously (shared lock). Only one thread can write (exclusive lock). This maximizes read throughput — critical for a file system where reads vastly outnumber writes. This is the same pattern used by Linux's `inode` locking.

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Delete non-empty directory | Require `force=true` flag, recursively delete children |
| Circular symlinks | Track visited nodes in a `Set` during traversal |
| Path with `..` | Resolve `..` by tracking parent reference in each node |
| Concurrent write + read | `ReadWriteLock` per file node |
| File name with `/` | Validate name doesn't contain path separator |

---

## �️ Database Design

### Distributed File System Storage Architecture

| Layer | Storage | Rationale |
|---|---|---|
| **Metadata (tree)** | PostgreSQL | Directory structure — strong consistency required. Tree stored as adjacency list: `nodes(id, parent_id, name, is_file, size, permissions)` |
| **File content** | S3 or GCS | Infinitely scalable blob storage. Each file is an object identified by UUID: `s3://bucket/files/{fileUuid}/content` |
| **Hot metadata cache** | Redis | Cache frequently accessed directories: `dir:{dirId}:children → [child1, child2, ...]` with TTL 300s |
| **Audit log** | PostgreSQL (immutable) | Compliance: track all operations for forensics. `audit_log(id, user_id, operation, path, timestamp, result)` |
| **Block map** | PostgreSQL | Map file blocks to storage locations (for distributed replication). `blocks(file_id, block_num, storage_node_id, replication_count)` |

**PostgreSQL Schema:**

```sql
CREATE TABLE filesystem_nodes (
  id BIGINT PRIMARY KEY,
  parent_id BIGINT REFERENCES filesystem_nodes(id),
  name VARCHAR(255) NOT NULL,
  is_file BOOLEAN NOT NULL,
  size BIGINT DEFAULT 0,
  permissions JSONB NOT NULL,  -- {"READ": ["user1", "user2"], "WRITE": ["user1"]}
  content_hash VARCHAR(64),    -- SHA-256 for deduplication
  s3_key VARCHAR(500),         -- path in S3 (only for files)
  created_at TIMESTAMP DEFAULT NOW(),
  modified_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(50),
  UNIQUE(parent_id, name),
  INDEX idx_parent (parent_id),
  INDEX idx_modified_at (modified_at DESC)
);

CREATE TABLE audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  operation VARCHAR(20),  -- "READ", "WRITE", "CREATE", "DELETE", "CHMOD"
  path VARCHAR(1000),
  status VARCHAR(20),  -- "SUCCESS", "DENIED", "NOT_FOUND"
  size_bytes BIGINT,
  duration_ms INT,
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_id (user_id),
  INDEX idx_operation (operation),
  INDEX idx_timestamp (timestamp DESC)
);

CREATE TABLE file_replication (
  file_id BIGINT REFERENCES filesystem_nodes(id),
  block_num INT,
  storage_node_id INT,  -- which DataNode holds this block
  replication_count INT DEFAULT 3,
  last_verified TIMESTAMP,
  PRIMARY KEY (file_id, block_num, storage_node_id)
);
```

**Redis Cache Schema:**

```redis
# Directory listing cache — TTL 300s
dir:{dirId}:children
  [
    { "name": "file1.txt", "id": 12345, "size": 1024, "isFile": true },
    { "name": "subdir", "id": 12346, "size": 0, "isFile": false }
  ]

# Individual node cache
node:{nodeId}
  {
    "id": 12345,
    "name": "file1.txt",
    "size": 1024,
    "permissions": {"READ": ["alice"], "WRITE": ["alice"]},
    "createdAt": 1692374400000,
    "modifiedAt": 1692374500000
  }

# ACL cache for permission checks
acl:{userId}:permissions
  {"READ": ["/home/alice", "/shared/docs"], "WRITE": ["/home/alice"], "EXECUTE": []}
```

### Write Path
```
Client: POST /files/home/alice/docs/report.pdf (upload 5MB)
    │
    ├─> Server: Check user has WRITE permission on /home/alice/docs (Redis ACL check)
    │
    ├─> Server: Split file into 1MB chunks (chunks 1-5)
    │
    ├─> Server: Upload each chunk to S3
    │   └─> PUT s3://bucket/files/uuid-12345/block-0 (1MB)
    │   └─> PUT s3://bucket/files/uuid-12345/block-1 (1MB)
    │   └─> ...
    │
    ├─> Server: Replicate each block to 2 additional DataNodes
    │
    ├─> Server: Persist metadata to PostgreSQL
    │   └─> INSERT INTO filesystem_nodes (parent_id, name, is_file, size, s3_key)
    │
    ├─> Server: Invalidate cache
    │   └─> DEL dir:{dirId}:children (forces refresh on next read)
    │
    ├─> Server: Log to audit trail
    │   └─> INSERT INTO audit_log (user_id, operation, path, status, size_bytes)
    │
    └─> Response: 201 Created { fileId: "uuid-12345", size: 5_242_880 }
```

---

## 🔌 API Routes & Contracts

### Distributed File System REST API

```
POST   /api/v1/files
├─ Request:  Multipart form-data { "file": <binary>, "path": "/home/alice/docs/" }
├─ Response: { "fileId": "uuid", "path": "/home/alice/docs/report.pdf", "size": 5242880 }
├─ Error:    403 Forbidden (no WRITE permission)
└─ Effect:   Split into chunks, upload to S3, replicate, persist metadata

GET    /api/v1/files/{fileId}
├─ Query:    ?range=bytes=0-999 (for partial downloads)
├─ Response: File binary content (streaming)
├─ Headers:  Content-Length, Content-Type, ETag, Last-Modified
├─ Error:    403 Forbidden (no READ permission)
└─ Latency:  < 100ms for S3 read + streaming

DELETE /api/v1/files/{fileId}
├─ Request:  { "permanently": false }  // soft delete vs hard delete
├─ Response: 204 No Content
├─ Error:    403 Forbidden
└─ Effect:   Mark deleted in PostgreSQL, delete from S3, log to audit trail

POST   /api/v1/directories
├─ Request:  { "path": "/home/alice/projects" }
├─ Response: { "dirId": "uuid", "path": "/home/alice/projects" }
└─ Effect:   Create directory node in PostgreSQL, cache in Redis

GET    /api/v1/directories/{dirId}/contents
├─ Query:    ?limit=50&offset=0 (pagination)
├─ Response: {
│     "items": [
│       { "id": "...", "name": "file1.txt", "isFile": true, "size": 1024 },
│       { "id": "...", "name": "subdir", "isFile": false, "size": 0 }
│     ],
│     "total": 125
│   }
├─ Cached: Redis (5 min TTL)
└─ Error:    403 Forbidden (no READ permission on directory)

GET    /api/v1/search
├─ Query:    ?query=report&path=/home/alice&type=file
├─ Response: [
│     { "id": "...", "path": "/home/alice/docs/report.pdf", "size": 1024 },
│     { "id": "...", "path": "/home/alice/backup/report_old.pdf", "size": 2048 }
│   ]
└─ Implemented: full-text search on PostgreSQL (Elasticsearch for large deployments)

PATCH  /api/v1/files/{fileId}/permissions
├─ Request:  { "READ": ["alice", "bob"], "WRITE": ["alice"] }
├─ Response: 200 OK
├─ Error:    403 Forbidden (only owner can change permissions)
└─ Effect:   Update PostgreSQL, invalidate Redis ACL cache

GET    /api/v1/audit-log
├─ Query:    ?user=alice&operation=WRITE&limit=1000&startDate=2024-01-01
├─ Response: [
│     { "timestamp": "2024-01-15T10:30:45Z", "user": "alice", "operation": "WRITE", "path": "/home/alice/docs/file.txt", "status": "SUCCESS" }
│   ]
└─ Immutable, used for compliance & forensics

WebSocket /ws/files/{dirId}?watch=true
├─ Subscribe: receive real-time updates to a directory
├─ Message:   { "type": "FILE_CREATED", "name": "new_file.txt" }
├─ Message:   { "type": "FILE_DELETED", "name": "old_file.txt" }
└─ Use case: Live file browser, collaborative editing
```

---

## 🏗️ Service Architecture

### Microservices for Distributed File System

```
┌──────────────────────────────────┐
│   API Gateway                    │
│  (auth, rate limit, routing)     │
└──────────┬───────────────────────┘
           │
    ┌──────┴──────┬──────────┬──────────────┐
    │             │          │              │
┌───▼────────┐ ┌──▼─────────┐  ┌───▼──────┐
│FileService │ │MetadataServ││ │BlockServi│
│            │ │            ││ │ (replica)│
│ • Upload   │ │ • Traverse │  │          │
│ • Download │ │ • List dir │  │ • Replica│
│ • Delete   │ │ • Permissio  │ • Rebalance
│            │ │ • Cache    │  │          │
└───┬────────┘ └──┬─────────┘  └───┬──────┘
    │             │                │
    │  ┌──────────┴────────────────┤
    │  │                           │
    ├─▼─────────────┬──────────────┼────────┐
    │               │              │        │
  ┌─▼────┐ ┌───────▼──┐  ┌───────▼──┐ ┌──▼────────┐
  │S3    │ │PostgreSQL│  │  Redis   │ │ AuditLog  │
  │      │ │          │  │  Cache   │ │ Service   │
  │ Content
  │       │ │Metadata  │  │          │ │(immutable)│
  └───────┘ └──────────┘  └──────────┘ └───────────┘
```

### Service Responsibilities

| Service | Role | Owns |
|---|---|---|
| **FileService** | Upload/download/delete | Chunk management, S3 integration, streaming |
| **MetadataService** | Directory tree, permissions | PostgreSQL reads/writes, Redis cache invalidation |
| **BlockService** | Replication, fault recovery | Block placement strategy, rebalance logic |
| **AuditLogService** | Compliance logging | Immutable write-only log, queries for forensics |
| **PermissionService** | Access control | ACL checks, caching in Redis, inheritance |

### Complete File Upload Flow

```
POST /api/v1/files { path: "/home/alice/docs/report.pdf", file: <5MB> }
    │
    ├─> API Gateway: JWT auth ✓
    │
    ├─> FileService.validatePath(path) ✓
    │
    ├─> PermissionService.checkWrite(userId, path)
    │   ├─> Check Redis ACL cache: acl:{userId}:permissions
    │   ├─> If miss: Query PostgreSQL permissions for /home/alice/docs
    │   ├─> Cache result in Redis (TTL 1 hour)
    │   └─> Return: allowed ✓
    │
    ├─> FileService.splitIntoChunks(file, 1MB)
    │   └─> [chunk1: 1MB, chunk2: 1MB, ..., chunk5: 1MB]
    │
    ├─> FileService.uploadChunksToS3()
    │   ├─> PUT s3://bucket/files/{uuid}/block-0 (1MB)
    │   ├─> PUT s3://bucket/files/{uuid}/block-1 (1MB)
    │   └─> ...
    │
    ├─> BlockService.replicateBlocks()
    │   ├─> For each block: find 2 additional DataNodes via consistent hashing
    │   ├─> Copy block to nodes: copy(node1, node2)
    │   └─> Update PostgreSQL replication_count = 3
    │
    ├─> MetadataService.persistMetadata()
    │   └─> INSERT INTO filesystem_nodes (parent_id, name, size, content_hash, s3_key)
    │   └─> Returns: fileId = "uuid-12345"
    │
    ├─> MetadataService.invalidateCache()
    │   └─> DEL dir:{dirId}:children (forces refresh on next list)
    │
    ├─> AuditLogService.log()
    │   └─> INSERT INTO audit_log (user_id, operation, path, size_bytes, status="SUCCESS")
    │
    └─> Response: 201 { fileId: "uuid-12345", path: "/home/alice/docs/report.pdf", size: 5242880 }
```

### Example: Concurrent Read + Write

```
Timeline:
T0: alice: GET /directories/123/contents (list files)
    └─> Read metadata from PostgreSQL, cache in Redis
    └─> Returns: [file1.txt, file2.txt]

T1: bob: POST /files { path: "/home/alice/docs/file3.txt" }
    └─> Upload succeeds, metadata persisted to PostgreSQL
    └─> Cache invalidated: DEL dir:123:children

T2: alice: GET /directories/123/contents (retry)
    └─> Cache miss (was deleted at T1)
    └─> Read fresh metadata from PostgreSQL
    └─> Returns: [file1.txt, file2.txt, file3.txt]
    └─> Cache result in Redis (TTL 5 min)

Key: Cache invalidation on writes prevents stale reads
```

---

## �📐 Scalability & HLD Thinking

**Scalability:**
- In-memory file system is single-node by design. For a **distributed file system** (like HDFS or S3): partition the namespace — directories are metadata (stored in a NameNode/metadata service), file content is stored in DataNodes/object storage.
- **Metadata scalability:** the directory tree is the bottleneck at scale. Shard the namespace by path prefix — `/users/A-M` on shard 1, `/users/N-Z` on shard 2. Use **consistent hashing** on the path prefix.

**Consistency:**
- **Strong consistency for writes:** a write must be visible to all subsequent reads. Use `ReadWriteLock` (in-memory) or a distributed lock (cross-node). This is a **CP** choice — a write failing is better than two readers seeing different file contents.
- **Eventual consistency for metadata:** directory listings can be slightly stale (e.g., a newly created file appears within 100ms). This is acceptable for most use cases and allows higher availability.
- **PACELC:** during normal operation (no partition), we trade latency for consistency on writes (write lock blocks readers). For reads, we allow concurrent access (read lock) — optimizing for latency.

**Latency:**
- In-memory read: < 1ms (array copy). In-memory write: < 1ms (array replace + metadata update).
- Path resolution: O(depth) — for a 10-level deep path, 10 map lookups = ~10μs.
- **Latency optimization:** cache recently resolved paths in a `LinkedHashMap` LRU cache. A path like `/home/user/docs` is resolved repeatedly — cache the `Directory` reference.

**Availability:**
- In-memory: no availability concern (single process). For distributed: replicate file content across 3 DataNodes (like HDFS replication factor 3). If one DataNode fails, reads continue from the other two.
- **Durability:** in-memory file system loses all data on restart. For persistence: write-ahead log (WAL) — append every write operation to a log file before applying it. On restart, replay the log to reconstruct state.

**Observability:**
- Metrics: read/write ops/sec, read/write latency (p50, p99), cache hit rate (path resolution cache), total files, total size
- Logs: `{ op: "READ|WRITE|CREATE|DELETE", path, sizeBytes, durationMs, threadId }`
- Alert: write latency p99 > 10ms (lock contention), read error rate > 0.1%

---

## 🗣️ How to Explain in the Interview

> "The Composite pattern is the natural fit — both files and directories share the same interface. `getSize()` on a directory recursively sums children — I can call `root.getSize()` for total disk usage without knowing the tree structure. For thread safety, I use `ReadWriteLock` per file — multiple concurrent readers, exclusive writer. This is the same pattern Linux uses for inode locking. For a distributed file system, I'd separate metadata (directory tree) from content (file bytes) — metadata in a sharded metadata service, content in object storage like S3.

In production, I'd use PostgreSQL for the Composite tree (strong consistency for directory structure), S3 for file content (infinitely scalable), and Redis to cache hot metadata. Every write goes to PostgreSQL + S3 + cache invalidation. Directory listings are cached for 5 minutes with TTL — invalidated on create/delete. Permissions are ACL-based, validated before every operation. For compliance, I'd maintain an immutable audit log — who accessed what, when, for forensics."
