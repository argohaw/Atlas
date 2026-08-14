---
tags: [hld, performance, caching, cdn, amazon-interview]
---
# HLD: Performance Optimisation — Caching, CDNs & Load Balancing

## 🎯 Why This Section is Asked
"How do you handle 10x traffic?" is asked in every Amazon HLD interview. The answer is always a combination of caching, CDN, and load balancing. Knowing *which layer* to cache at, *what eviction policy* to use, and *why* CDNs reduce latency by 10x is what makes your answer stand out.

---

## ⚡ Caching

**Definition:** Storing the result of an expensive computation or query closer to the consumer to reduce latency and DB load.

### The Cache Hierarchy

```
L1: In-process cache (HashMap in memory)     → ~nanoseconds, lost on restart
L2: Distributed cache (Redis/Memcached)      → ~1ms, shared across instances
L3: CDN cache (CloudFront/Fastly)            → ~10ms, geographically distributed
L4: Database query cache                     → ~10ms, within DB engine
```

### Caching Strategies

#### Cache-Aside (Lazy Loading) — Most Common
```
Read:
  1. Check cache → HIT: return cached value
  2. MISS: query DB → store in cache → return value

Write:
  1. Write to DB
  2. Invalidate (delete) cache entry
```

```java
public Product getProduct(String id) {
    Product cached = redis.get("product:" + id);
    if (cached != null) return cached;

    Product product = db.findById(id);
    redis.setex("product:" + id, 300, product); // TTL: 5 min
    return product;
}
```

**Why Cache-Aside?** The cache only contains data that's actually been requested — no wasted memory on cold data. The tradeoff: first request after a cache miss is slow (cache stampede risk).

#### Write-Through
```
Write:
  1. Write to cache AND DB simultaneously
  2. Both always in sync

Read:
  1. Always hits cache (data is always warm)
```
- ✅ Cache always consistent with DB
- ❌ Write latency is higher (must write to both)
- Use when: write-heavy with frequent re-reads (user profile updates)

#### Write-Back (Write-Behind)
```
Write:
  1. Write to cache only (return immediately)
  2. Async: flush cache to DB in batches

Read:
  1. Always hits cache
```
- ✅ Lowest write latency
- ❌ Data loss risk if cache crashes before flush
- Use when: high-frequency writes where some loss is acceptable (view counts, analytics)

#### Read-Through
Cache sits in front of DB. Cache handles DB reads automatically.
- Application only talks to cache
- Cache fetches from DB on miss
- Used by: Redis with read-through plugins, DAX (DynamoDB Accelerator)

### Cache Eviction Policies

| Policy | How It Works | Use When |
|---|---|---|
| **LRU** (Least Recently Used) | Evict the item not accessed for the longest time | General purpose — most common |
| **LFU** (Least Frequently Used) | Evict the item accessed fewest times | When popularity matters (hot items stay) |
| **TTL** (Time to Live) | Evict after a fixed time regardless of access | Data with known staleness tolerance |
| **FIFO** | Evict oldest inserted item | Simple queues |

### Cache Stampede (Thundering Herd)
**Problem:** A popular cache key expires. 1,000 concurrent requests all miss the cache simultaneously and hammer the DB.

**Solutions:**
1. **Probabilistic early expiration:** Randomly refresh cache before TTL expires
2. **Mutex/lock:** First request acquires a lock, fetches from DB, populates cache; others wait
3. **Stale-while-revalidate:** Serve stale data while refreshing in background

```java
// Mutex approach
public Product getProduct(String id) {
    Product cached = redis.get("product:" + id);
    if (cached != null) return cached;

    String lockKey = "lock:product:" + id;
    if (redis.setnx(lockKey, "1", 5)) { // acquire lock, 5s TTL
        try {
            Product product = db.findById(id);
            redis.setex("product:" + id, 300, product);
            return product;
        } finally {
            redis.del(lockKey);
        }
    } else {
        Thread.sleep(50); // wait for lock holder to populate cache
        return redis.get("product:" + id); // retry
    }
}
```

### What to Cache vs What Not to Cache

| Cache ✅ | Don't Cache ❌ |
|---|---|
| Product catalog (changes rarely) | Real-time inventory counts |
| User profile (read-heavy) | Payment transactions |
| Search results | Personalized feeds (too many variants) |
| Static config / feature flags | Sensitive PII (security risk) |

> *"I'll use Redis with Cache-Aside for the product catalog. TTL of 5 minutes — product data changes infrequently. For the inventory count during checkout, I'll bypass the cache and read directly from the DB with a SELECT FOR UPDATE to prevent overselling."*

---

## 🌍 CDNs (Content Delivery Networks)

**Definition:** A geographically distributed network of edge servers that cache content close to end users.

### How a CDN Works

```
Without CDN:
User (Mumbai) ──────────────────────────────► Origin (us-east-1)
                        ~200ms RTT

With CDN:
User (Mumbai) ──► CDN Edge (Mumbai) ──► Origin (us-east-1)
                      ~5ms RTT          (only on cache miss)
```

### What CDNs Cache

| Content Type | CDN TTL | Notes |
|---|---|---|
| Static assets (JS, CSS, images) | Days/weeks | Versioned filenames for cache busting |
| Videos | Hours/days | Chunked delivery (HLS/DASH) |
| API responses | Seconds/minutes | Only for public, non-personalized data |
| HTML pages | Minutes | With `Cache-Control: max-age=60` |

### Cache Busting
When you deploy new JS/CSS, old CDN-cached files would be served.
**Solution:** Include content hash in filename:
```
app.js → app.a3f9b2c1.js
```
New deployment → new hash → new URL → CDN fetches fresh copy.

### CDN for Dynamic Content (Edge Computing)
Modern CDNs (Cloudflare Workers, Lambda@Edge) can run code at the edge:
- A/B testing at the edge (no origin hit)
- Auth token validation at the edge
- Personalized responses without hitting origin

### CDN Providers

| Provider | Strengths |
|---|---|
| CloudFront (AWS) | Deep AWS integration, Lambda@Edge |
| Cloudflare | DDoS protection, Workers, global network |
| Fastly | Real-time purging, VCL customization |
| Akamai | Largest network, enterprise |

> *"All static assets (JS, CSS, images) are served from CloudFront with a 30-day TTL. Filenames include content hashes for cache busting. Video content uses CloudFront with S3 as origin — CloudFront handles chunked delivery via HLS. This reduces origin traffic by ~95% and cuts latency for global users from 200ms to 10ms."*

---

## ⚖️ Load Balancing (Deep Dive)

### Global Load Balancing vs Local Load Balancing

**Global (DNS-based):**
```
Route 53 ──► us-east-1 ALB (US users)
         ──► eu-west-1 ALB (EU users)
         ──► ap-south-1 ALB (Asia users)
```
Routes users to the nearest region. Failover: if us-east-1 health checks fail, Route 53 routes to eu-west-1.

**Local (within a region):**
```
ALB ──► Instance 1 (us-east-1a)
    ──► Instance 2 (us-east-1b)
    ──► Instance 3 (us-east-1c)
```
Distributes traffic across AZs within a region.

### Sticky Sessions (Session Affinity)
Route a user's requests to the same server instance.
- **Why:** Stateful services that store session in memory
- **How:** Cookie-based (ALB inserts `AWSALB` cookie) or IP hash
- **Problem:** Defeats horizontal scaling — one instance gets all traffic from heavy users
- **Better solution:** Move session state to Redis — make services stateless

### Connection Draining (Deregistration Delay)
When removing an instance from the load balancer (deployment, scale-in):
1. Stop sending new requests to the instance
2. Wait for in-flight requests to complete (default: 300s)
3. Then terminate the instance

This prevents 502 errors during deployments.

### Health Check Configuration

```yaml
# ALB Health Check
HealthCheckPath: /health
HealthCheckIntervalSeconds: 10
HealthyThresholdCount: 2      # 2 consecutive successes → healthy
UnhealthyThresholdCount: 3    # 3 consecutive failures → unhealthy
HealthCheckTimeoutSeconds: 5
```

**What `/health` should check:**
- DB connection pool has available connections
- Redis is reachable
- No critical background jobs are stuck
- Return 200 if healthy, 503 if not

> *"I'll configure the ALB with a 10-second health check interval and a 3-failure threshold. The `/health` endpoint checks DB connectivity and Redis. If an instance fails 3 checks (30 seconds), it's removed from rotation. Auto Scaling replaces it within 2 minutes. This gives us automatic recovery from instance failures with minimal impact."*
