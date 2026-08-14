---
tags: [lld, advanced, system-design, google-drive, file-sync]
---
# LLD: Design Google Drive

## 🎯 Why This Problem is Asked
Google Drive is a classic advanced system design because it blends:
- File storage and versioning
- Real-time sync across devices
- Permission / sharing model
- Eventual consistency with conflict resolution
- Large-scale metadata management

It is used to test how well you reason about storage, metadata, sync protocols, and distributed consistency at huge scale.

---

## 📋 Requirements Clarification

### Functional
- Upload, download, delete, rename files and folders
- Maintain file version history
- Sync changes across devices
- Share files/folders with other users
- Support collaboration and permissions
- Handle file conflicts when two clients edit same file
- Maintain offline support and delta sync

### Non-Functional
- Support millions of users and exabytes of storage
- Upload/download latency must be acceptable
- File content storage should be highly durable
- Metadata operations must be fast and reliable
- Conflict resolution should be predictable
- Access control must be strict and auditable

---

## 🧩 Core Entities

```java
public enum PermissionType { OWNER, EDITOR, VIEWER }
public enum SyncStatus { SYNCED, PENDING, CONFLICT }
public enum FileType { FILE, FOLDER }

public class User {
    private String userId;
    private String email;
    private String displayName;
    private String deviceId;
}

public class FileNode {
    private String fileId;
    private String parentId;
    private String name;
    private FileType type;
    private String ownerUserId;
    private String contentHash;
    private long sizeBytes;
    private long version;
    private long updatedAtMs;
    private boolean deleted;
}

public class FileVersion {
    private String fileId;
    private long version;
    private String contentKey;      // object storage key
    private String previousVersionId;
    private String createdByUserId;
    private long createdAtMs;
}

public class Permission {
    private String fileId;
    private String userId;
    private PermissionType permissionType;
    private String grantedByUserId;
    private long grantedAtMs;
}

public class SyncEvent {
    private String eventId;
    private String userId;
    private String fileId;
    private long baseVersion;
    private long newVersion;
    private String action; // CREATE, UPDATE, DELETE, RENAME, MOVE
    private long createdAtMs;
}
```

---

## 🏗️ LLD Patterns

### 1. Versioned Files with MVCC
Each file gets a monotonic version. Updates append a new version metadata row and object storage content.

```java
public class FileService {
    private final FileRepository fileRepo;
    private final VersionRepository versionRepo;
    private final SyncEventQueue syncQueue;

    public FileVersion uploadNewVersion(String fileId, String uploaderId, byte[] content) {
        FileNode node = fileRepo.get(fileId);
        long nextVersion = node.getVersion() + 1;

        String contentKey = storageClient.store(content);

        FileVersion version = new FileVersion();
        version.setFileId(fileId);
        version.setVersion(nextVersion);
        version.setContentKey(contentKey);
        version.setCreatedByUserId(uploaderId);
        version.setCreatedAtMs(System.currentTimeMillis());

        versionRepo.save(version);
        node.setVersion(nextVersion);
        node.setContentHash(hash(content));
        node.setUpdatedAtMs(System.currentTimeMillis());
        fileRepo.save(node);

        syncQueue.publish(new SyncEvent(fileId, uploaderId, nextVersion));
        return version;
    }
}
```

### 2. Permission-Inheritance Model
Inheritance can be implemented by file or folder tree. Access checks walk the parent chain to resolve effective rights.

```java
public class PermissionService {
    private final PermissionRepository permissionRepo;

    public PermissionType getEffectivePermission(String userId, String fileId) {
        // Check direct permission
        Permission direct = permissionRepo.find(userId, fileId);
        if (direct != null) return direct.getPermissionType();

        // Walk parent folder permissions
        String parentId = fileRepo.getParent(fileId);
        while (parentId != null) {
            Permission parentPerm = permissionRepo.find(userId, parentId);
            if (parentPerm != null) return parentPerm.getPermissionType();
            parentId = fileRepo.getParent(parentId);
        }

        return null;
    }
}
```

### 3. Conflict Resolution Strategy
When clients edit same file simultaneously, the system should not arbitrarily overwrite data. Use a version compare and create a conflict copy.

```java
public class SyncConflictResolver {
    public SyncResult resolve(String fileId, long clientVersion, byte[] content) {
        FileNode current = fileRepo.get(fileId);

        if (clientVersion < current.getVersion()) {
            // Client outdated; return conflict metadata
            return SyncResult.conflict(current.getVersion(), current.getContentHash());
        }

        // Safe update: base version matches current state
        uploadNewVersion(fileId, "client-user", content);
        return SyncResult.success();
    }
}
```

---

## 🗄️ Database Design

### PostgreSQL for Metadata

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE file_nodes (
  file_id UUID PRIMARY KEY,
  parent_id UUID,
  owner_user_id UUID NOT NULL REFERENCES users(user_id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(10) NOT NULL, -- FILE or FOLDER
  size_bytes BIGINT DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  content_hash VARCHAR(128),
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  INDEX idx_owner_parent (owner_user_id, parent_id),
  INDEX idx_name (name),
  INDEX idx_updated_at (updated_at)
);

CREATE TABLE file_versions (
  file_id UUID NOT NULL REFERENCES file_nodes(file_id),
  version BIGINT NOT NULL,
  content_key TEXT NOT NULL,
  previous_version_id UUID,
  created_by_user_id UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_id, version)
);

CREATE TABLE permissions (
  file_id UUID NOT NULL REFERENCES file_nodes(file_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  permission_type VARCHAR(20) NOT NULL, -- OWNER, EDITOR, VIEWER
  granted_by_user_id UUID REFERENCES users(user_id),
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_id, user_id)
);

CREATE TABLE sync_events (
  event_id UUID PRIMARY KEY,
  file_id UUID REFERENCES file_nodes(file_id),
  user_id UUID REFERENCES users(user_id),
  base_version BIGINT,
  new_version BIGINT,
  action VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  INDEX idx_file_time (file_id, created_at)
);
```

### Object Storage for File Content
- File chunks or full content are stored in object storage like S3 / GCS.
- Content-addressed storage: `hash(file-content)` => object key
- Versions are immutable and cheap to keep

### Redis for Hot Metadata
```redis
# Recent file listing by user
user:{userId}:recent-files -> sorted set (fileId:score)

# Active sync state per device
device:{deviceId}:sync-state -> { folderTreeVersion, lastSyncTs }

# Presence / active file watchers
file:{fileId}:watchers -> set of deviceIds

# File permission cache
file:{fileId}:acl -> { userId: permission }
```

---

## 🔌 API Routes & Contracts

```
GET    /v1/files
Query: ?parentId=folder-123&cursor=abc&pageSize=50
Response: {
  "items": [
    { "id": "f-1", "name": "report.pdf", "type": "FILE", "sizeBytes": 342102, "version": 3 },
    { "id": "f-2", "name": "designs", "type": "FOLDER", "version": 12 }
  ],
  "nextCursor": "xyz"
}

POST   /v1/files/upload
Request: {
  "parentId": "folder-123",
  "name": "image.png",
  "content": "base64-or-multipart"
}
Response: {
  "fileId": "f-44",
  "version": 1,
  "uploadToken": "tok-abc"
}

GET    /v1/files/{fileId}/versions
Response: {
  "versions": [
    { "version": 1, "createdAt": "...", "createdBy": "u-01" },
    { "version": 2, "createdAt": "...", "createdBy": "u-02" }
  ]
}

GET    /v1/files/{fileId}/download
Response: file bytes or signed URL

POST   /v1/files/{fileId}/share
Request: { "userIds": ["u-1", "u-2"], "permission": "VIEWER" }

POST   /v1/sync
Request: {
  "deviceId": "device-11",
  "lastSyncVersion": 42,
  "changes": [
    { "fileId": "f-1", "action": "UPDATE", "newVersion": 43 }
  ]
}
Response: {
  "serverVersion": 180,
  "changes": [...],
  "conflicts": [ { "fileId": "f-1", "reason": "client-outdated" } ]
}
```

---

## 🏗️ Service Architecture

```text
Client App (Desktop / Mobile / Web)
           |
           v
     API Gateway
           |
    ┌------v---------┐
    │ Metadata API   │
    │ FileService    │
    │ PermissionSvc  │
    └------┬---------┘
           │
     ┌-----+-------------------┐
     │     │                   │
     v     v                   v
 PostgreSQL  Redis Cache    Object Store
   metadata   hot state      file blobs
     |                           |
     v                           v
  Sync Worker -> Kafka -> Notification / Reconcile / Audit
```

### End-to-End Flow
1. Client requests upload or file list
2. Metadata API validates permissions
3. Object store persists binary content
4. Metadata database stores version + pointers
5. Sync queue emits event for other devices
6. Client sync loop polls or websockets for changes
7. Conflict resolution is applied when client version is stale

---

## 📐 HLD Concepts & Scalability

### Storage Model
- Object store holds large blobs, immutable versions
- Metadata DB keeps file tree, permissions, and version pointers
- Redis caches recent folders and access control

### Sync Strategy
- Use delta sync: only changed files since `lastSyncVersion`
- Use event-based propagation: client observes changes after pull
- For large file changes, use chunk-level patching and resumable uploads

### Consistency
- Metadata is strongly consistent in the database
- File content can be eventually consistent across replicas
- Conflict resolution uses version checks and “last-write-wins” or conflict copies depending on policy

### Scale
- Shard metadata by userId or folder hash
- Use CDN for public file reads
- Write-heavy workloads use queue-based ingestion
- High-read workloads use caching for hot directories

---

## 🗣️ How to Explain in the Interview

> "The main challenge in Google Drive is combining durable file storage with fast, consistent metadata and eventual sync. I would split the system into three layers: metadata management, object storage, and sync workers.

Metadata like file names, versions, and permissions goes into a relational database for consistency. The actual binary contents live in object storage because it is optimized for large immutable blobs. A sync worker listens for file change events and pushes updates to other devices using a versioned change feed.

For conflict resolution, I would maintain per-file versions and a base version in the client. If the client is behind, I detect a conflict and either refuse the overwrite or create a conflict copy; I would never silently lose data.

To support millions of users, I’d partition metadata by user, shard folders and permissions by root user, and cache hot directory listings in Redis. This gives fast listing while keeping durable metadata consistent on the backend."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | FileService, PermissionService, SyncService have separate responsibilities |
| O | New file action types or permission types can be added without altering critical logic |
| D | Services depend on repositories and storage interfaces, not concrete DB implementations |
| L | A `Viewer` permission cannot perform edits without upgraded access checks |
| I | Split metadata, sync, and storage responsibilities into distinct modules |

---

## ⚠️ Follow-up Questions to Prepare
- How do you handle large files and partial uploads?
- How do you handle offline edits and conflicts?
- How do you detect duplicates and content deduplication?
- How do you ensure permissions are enforced on every access?
- How do you recover from replication lag or failed sync workers?

---

## 🔥 Deep Dive: Production Realities for Google Drive

### 1. File Sync Model: Client-Server vs Delta Sync
Google Drive is not just file upload/download; the real challenge is sync correctness. A naive implementation would do full file upload every time, which is expensive and slow. Instead:
- Use a server version for each file and folder tree
- Maintain a per-device sync cursor (last sync sequence number)
- Send only changed file metadata and chunk deltas after a folder scan or file change feed
- For large files, use chunk-based upload with resumption using upload IDs

### 2. Folder Tree and Metadata Design
Folder metadata becomes a difficult bottleneck when millions of files exist. To scale:
- Keep a folder tree table keyed by `parent_id` and `name`
- Store `path` in denormalized form only for search and UI convenience
- Maintain a per-user root folder and shared folder mapping tables
- Use an event log to update watchers and desktop client caches

### 3. Permission Checking and Sharing Semantics
Permission validation is not just a database lookup. You need:
- direct permission on file or folder
- inherited permission from parent directory
- revocation propagation for shared links and team drives
- audit logs for every permission grant/revoke event

A user with VIEWER access should never be able to rename, delete, or upload. The permission service must enforce that at both API and UI layers.

### 4. Conflict Strategies
For offline edits, the system should avoid silent overwrite. The best strategy is:
- Compare client base version vs current server version
- If unchanged, apply upload safely
- If changed, create a conflict copy using a naming convention like `filename (conflicted copy)`
- Preserve both versions and allow user merge

### 5. Storage Architecture at Scale
A realistic Google Drive layout:
- Metadata DB: small, relational, strongly consistent
- Object storage: large immutable blobs and chunks
- CDN / edge cache: public shared file reads
- Search / indexing service: for document content search and recent history
- Audit / event pipeline: for compliance and debugging

### 6. Failure Modes and Recovery
Common failure examples:
- network interruptions during file upload
- object store write succeeded but metadata DB write failed
- client has stale sync state after server-side folder rename
- partner share changed while client still has outdated ACLs

Recovery strategy:
- upload tokens and resumable uploads
- write-ahead event records before final commit
- reconcile jobs that scan pending sync events
- background repair workers to reconcile mismatched metadata

### 7. Capacity Planning
A realistic scale assumption:
- 1B+ users
- 5-10 exabytes of stored content
- large numbers of small files and many shared folders
- read-heavy hot path for shared docs and recent lists

This requires:
- sharding metadata by user or root folder
- aggressive caching of home directory listings and recent files
- asynchronous indexing of shared file changes

### 8. Interview Answer Template
> "I would separate metadata from object storage. The metadata service tracks files, folders, versions, permissions, and sync state in a strongly consistent DB, while content lives in immutable object storage. Clients sync by tracking a version cursor, and conflict resolution happens by comparing the client base version with server version. Shared files are resolved by permission inheritance and access-control checks. For scale, I’d shard metadata by user and cache hot folder listings in Redis."
