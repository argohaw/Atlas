---
tags: [lld, advanced, system-design, github, version-control]
---
# LLD: Design GitHub / Version Control Platform

## 🎯 Why This Problem is Asked
GitHub-like systems test:
- distributed version control
- branching, merges, and conflict resolution
- CI/CD pipeline orchestration
- repository metadata and access control
- high-scale storage and network efficiency

This is a strong system-design question for engineering platforms and SaaS products.

---

## 📋 Requirements Clarification

### Functional
- Create repos and branches
- commit, push, pull, merge, rebase
- pull requests and review workflows
- code search and file history
- issue tracking and CI status

### Non-Functional
- high availability for reads
- support large repos and massive historical data
- safe merge semantics
- fast diff generation for large pull requests

---

## 🧩 Core Entities

```java
public class Repository {
    private String repositoryId;
    private String ownerId;
    private String name;
    private String defaultBranch;
}

public class Commit {
    private String commitId;
    private String repositoryId;
    private String parentCommitId;
    private String treeHash;
    private String authorUserId;
    private long createdAtMs;
}

public class PullRequest {
    private String prId;
    private String repositoryId;
    private String sourceBranch;
    private String targetBranch;
    private String status; // OPEN, MERGED, CLOSED
}
```

---

## 🏗️ LLD Patterns

### 1. Git Object Model
Each commit references a tree. Tree objects represent directory structure and file blobs.

```java
public class GitObjectStore {
    public Blob getBlob(String objectHash) { return null; }
    public Tree getTree(String treeHash) { return null; }
    public Commit getCommit(String commitHash) { return null; }
}
```

### 2. Merge Conflict Resolution
Use three-way merge based on common ancestor when branch histories diverge.

```java
public class MergeService {
    public MergeResult merge(Commit base, Commit left, Commit right) {
        // Compute diff and resolve overlapping edits
        return new MergeResult();
    }
}
```

### 3. Branch and PR Metadata
Metadata DB stores branch names, PRs, comments, and review states.

```sql
CREATE TABLE repositories (
  repository_id UUID PRIMARY KEY,
  owner_user_id UUID,
  name VARCHAR(255),
  default_branch VARCHAR(255)
);
```

---

## 🗄️ Database Design

```sql
CREATE TABLE repositories (
  repository_id UUID PRIMARY KEY,
  owner_user_id UUID,
  name VARCHAR(255),
  default_branch VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE commits (
  commit_id UUID PRIMARY KEY,
  repository_id UUID REFERENCES repositories(repository_id),
  parent_commit_id UUID,
  tree_hash VARCHAR(128),
  author_user_id UUID,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pull_requests (
  pr_id UUID PRIMARY KEY,
  repository_id UUID REFERENCES repositories(repository_id),
  source_branch VARCHAR(255),
  target_branch VARCHAR(255),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

Large repositories keep object blobs in object storage; metadata is relational.

---

## 🔌 API Routes & Contracts

```
POST /v1/repos
Request: { "name": "my-project", "ownerId": "u-1" }
Response: { "repositoryId": "r-42" }

POST /v1/repos/{repoId}/commits
Request: { "message": "Configure CI", "files": [...] }

POST /v1/repos/{repoId}/pull-requests
Request: { "sourceBranch": "feature/login", "targetBranch": "main" }
Response: { "prId": "pr-9" }

GET /v1/repos/{repoId}/history
Response: { "commits": [ ... ] }
```

---

## 🏗️ Service Architecture

```text
Clients / Git CLI
   |
   v
API Gateway
   |
   +--> Repo Service
   +--> Commit Service
   +--> Merge Service
   +--> CI Service
   +--> Search Service
   |
   +--> Metadata DB
   +--> Object Storage (git blobs + trees)
   +--> Kafka / Job Queue
```

### Flow
1. Client pushes commit objects to object store
2. metadata stores branch and commit references
3. merge service performs three-way merge
4. CI system starts jobs for changed branches
5. pull request service tracks reviews and merges

---

## 📐 HLD Concepts & Scalability

### Metadata vs Object Storage
- Git objects are immutable and large; object storage is natural
- metadata such as branch pointers and PRs is relational

### Merge and conflict handling
- concurrent edits need deterministic conflict resolution
- keep commit DAGs for traceability and rollback

### CI volume
- push events trigger build jobs in queues
- build workers execute tests and report status back

---

## 🗣️ How to Explain in the Interview

> "A GitHub-like system is basically a metadata service on top of an immutable object store. Commits, trees, and blobs are stored as content-addressed objects, while branch pointers and pull requests live in a relational store. This architecture allows global history, fast branching, and efficient content deduplication."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | RepoService, CommitService, MergeService are distinct |
| O | New CI providers or merge policies can be introduced without rewriting repo logic |
| D | Storage backends are abstracted behind repositories |
| I | Branching, review, and CI concerns are separated |

---

## ⚠️ Follow-up Questions
- How do you support giant repositories with thousands of files?
- How do you detect merge conflicts efficiently?
- How do you scale CI without starving repo API traffic?
- How do you enforce access control across private repos?

---

## 🔥 Deep Dive: Production Realities for GitHub

### 1. Git Object Model
The core of Git is efficient content-addressed storage. Each object is immutable and identified by a hash. This allows:
- deduplication of identical file blobs
- efficient history traversal
- reliable branching and merging

The metadata service stores pointer references to the latest commit of each branch.

### 2. Repository Metadata vs Blob Storage
GitHub has to maintain two types of data:
- metadata: PRs, comments, branch refs, users, permissions, actions
- content: commit objects, trees, files, diffs

This separation is crucial because metadata is transactional and queryable, while content is large and immutable.

### 3. Merge Semantics
A merge is not just a diff; it is a logic challenge. Typical algorithms:
- fast-forward when no divergence
- three-way merge when branch histories diverged
- conflict markers for overlapping edits

A merge engine must also consider file rename tracking and binary file merge behavior.

### 4. CI/CD Scaling
Every push can trigger a build pipeline. To avoid bottlenecks:
- queue build jobs asynchronously
- maintain worker pools by language or project size
- keep build metadata in a DB while build logs go to object storage
- use caching for dependencies and build artifacts

### 5. Interview Answer Template
> "I’d build GitHub as a metadata service over a content-addressed object store. The object store would handle immutable blobs, trees, and commits, while the metadata database tracks repositories, branches, PRs, reviews, and permissions. For merges, the system would perform three-way merges and block on conflicts, while CI tasks are queued and executed asynchronously in sandboxed workers."
