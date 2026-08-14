---
tags: [lld, intermediate, distributed-systems, amazon-interview, google-interview]
---
# LLD: Design a Rate Limiter

## 🎯 Why This Problem is Asked
Rate limiting is **critical infrastructure** in every distributed system. Amazon, Google, and Stripe ask this to test your understanding of:
- **Token bucket & sliding window algorithms** (trade-offs)
- **Distributed state management** (Redis)
- **Concurrency & atomic operations**
- **Real-world constraints** (clock skew, network partitions, storage efficiency)

Rate limiter appears everywhere: API gateways, database connection pools, payment processors, social media platforms (tweets/min, follows/day).

---

## 📋 Requirements Clarification

**Functional:**
- Limit requests from a user/IP to N requests per M seconds (e.g., 100 req/min, 1000 req/hour)
- Support multiple rate limit tiers (free, premium, enterprise)
- Different rules per endpoint (write-heavy: 10/min, read-light: 100/min)
- Return remaining quota in response headers
- Support distributed rate limiting (multiple servers)

**Non-Functional:**
- Sub-millisecond decision latency (critical path — must not add overhead)
- Highly available (false positives OK, false negatives BAD)
- Support ~1M users with sub-second response time
- Handle clock skew (servers not perfectly synchronized)
- Graceful degradation if Redis unavailable

---

## 🧩 Core Entities & Enums

```java
public enum RateLimitStrategy {
    TOKEN_BUCKET,      // smooth burst traffic
    SLIDING_WINDOW,    // exact rate over window
    SLIDING_WINDOW_LOG // per-request log (storage-heavy)
}

public class RateLimitRule {
    private final String ruleId;
    private final int requestsPerWindow;
    private final long windowSizeMs;  // e.g., 60000 for 1 minute
    private final RateLimitStrategy strategy;
}

public class User {
    private final String userId;
    private final String tier;  // "free", "premium", "enterprise"
    private Map<String, RateLimitRule> rules;  // per-endpoint rules
}

public class RateLimitResponse {
    private final boolean allowed;
    private final int remainingRequests;
    private final long resetAtMs;
    private final int retryAfterSecs;
}
```

---

## 🏗️ Class Design & Patterns

### Pattern 1: Token Bucket Algorithm

```java
public class TokenBucketRateLimiter implements RateLimiter {
    private final int maxTokens;
    private final long refillIntervalMs;
    private volatile long lastRefillTimeMs = System.currentTimeMillis();
    private volatile double availableTokens;

    public RateLimitResponse allowRequest(String userId, int tokensNeeded) {
        synchronized (this) {  // or use AtomicReference for lock-free
            refill();
            
            if (availableTokens >= tokensNeeded) {
                availableTokens -= tokensNeeded;
                return new RateLimitResponse(true, (int)availableTokens, 0);
            } else {
                long refillTimeMs = (long) ((tokensNeeded - availableTokens) * refillIntervalMs / REFILL_RATE);
                return new RateLimitResponse(false, 0, refillTimeMs / 1000);
            }
        }
    }

    private void refill() {
        long now = System.currentTimeMillis();
        long timePassed = now - lastRefillTimeMs;
        double tokensToAdd = (timePassed / (double) refillIntervalMs) * REFILL_RATE;
        availableTokens = Math.min(maxTokens, availableTokens + tokensToAdd);
        lastRefillTimeMs = now;
    }
}
```

**Why Token Bucket?**
- ✅ Smooth burst handling: allows brief traffic spikes (useful for APIs)
- ✅ Simple to implement
- ✅ Configurable: can allow different burst sizes for different tiers
- ❌ Doesn't enforce strict rate (100 requests in 1ms, then 0 for 59s is allowed)

### Pattern 2: Sliding Window Algorithm

```java
public class SlidingWindowRateLimiter implements RateLimiter {
    private final LinkedList<Long> requestTimestamps = new LinkedList<>();
    private final long windowSizeMs;
    private final int maxRequests;

    public RateLimitResponse allowRequest(String userId) {
        long now = System.currentTimeMillis();
        
        // Remove old timestamps outside window
        while (!requestTimestamps.isEmpty() && 
               requestTimestamps.peekFirst() < now - windowSizeMs) {
            requestTimestamps.pollFirst();
        }
        
        if (requestTimestamps.size() < maxRequests) {
            requestTimestamps.addLast(now);
            int remaining = maxRequests - requestTimestamps.size();
            long resetAt = requestTimestamps.peekFirst() + windowSizeMs;
            return new RateLimitResponse(true, remaining, resetAt - now);
        } else {
            long resetAt = requestTimestamps.peekFirst() + windowSizeMs;
            return new RateLimitResponse(false, 0, resetAt - now);
        }
    }
}
```

**Why Sliding Window?**
- ✅ Enforces exact rate (no cheating)
- ✅ Simple conceptually
- ❌ Storage overhead: stores all request timestamps (memory-heavy at scale)
- ❌ No burst allowance (strict limiting)

### Pattern 3: Sliding Window Log + Counter (Hybrid - Best)

```java
public class SlidingWindowCounterRateLimiter implements RateLimiter {
    private final int maxRequests;
    private final long windowSizeMs;
    private volatile long currentWindowStart = System.currentTimeMillis();
    private volatile int currentCount = 0;
    private volatile int previousCount = 0;

    public RateLimitResponse allowRequest(String userId) {
        long now = System.currentTimeMillis();
        long windowStartTime = now - (now % windowSizeMs);
        
        synchronized (this) {
            // Moved to new window
            if (windowStartTime != currentWindowStart) {
                previousCount = currentCount;
                currentCount = 0;
                currentWindowStart = windowStartTime;
            }
            
            // Calculate rolling rate: fraction of previous window + current window
            long timeInCurrentWindow = now - currentWindowStart;
            double allowanceFromPreviousWindow = 
                (double) previousCount * (windowSizeMs - timeInCurrentWindow) / windowSizeMs;
            double allowance = maxRequests - allowanceFromPreviousWindow;
            
            if (currentCount < allowance) {
                currentCount++;
                long nextResetMs = currentWindowStart + windowSizeMs;
                return new RateLimitResponse(true, (int)(allowance - currentCount), nextResetMs - now);
            } else {
                long nextResetMs = currentWindowStart + windowSizeMs;
                return new RateLimitResponse(false, 0, nextResetMs - now);
            }
        }
    }
}
```

**Why Sliding Window Counter (Hybrid)?**
- ✅ O(1) storage (just two integers)
- ✅ Smooth transition between windows (no sudden drops)
- ✅ Enforces approximate rate (not exact, but close)
- ✅ Low latency (no list operations)

---

## 🗄️ Database Design

### Redis Schema for Distributed Rate Limiting

```redis
# Per-user, per-endpoint rate limit
rl:user:{userId}:endpoint:{endpoint}
  {
    "tokens": 95,
    "lastRefillAt": 1692374425000,
    "maxTokens": 100,
    "windowMs": 60000
  }
  TTL: 3600s (auto-expire after 1 hour of inactivity)

# Alternative: Sliding window log (compact)
rl:log:{userId}:{endpoint}
  ZADD rl:log:alice:POST:/api/tweets 
       1692374425000 "req1"
       1692374425050 "req2"
       1692374425100 "req3"
  TTL: 60s (auto-expire old requests)

# Per-endpoint configuration
rl:config:{endpoint}
  {
    "requestsPerWindow": 100,
    "windowMs": 60000,
    "strategy": "TOKEN_BUCKET",
    "tierMultipliers": {
      "free": 1.0,
      "premium": 5.0,
      "enterprise": 100.0
    }
  }
  TTL: 86400s (cache for 24 hours, invalidate on config change)
```

**Why Redis?**
- ✅ Sub-millisecond latency (critical path)
- ✅ Atomic operations (`INCR`, `ZADD`, TTL) prevent race conditions
- ✅ Automatic key expiration (no cleanup job needed)
- ✅ Distributed: all servers share state

**PostgreSQL (Optional):**
```sql
CREATE TABLE rate_limit_rules (
  id INT PRIMARY KEY,
  endpoint VARCHAR(100),
  requests_per_window INT,
  window_ms INT,
  strategy VARCHAR(20),  -- "TOKEN_BUCKET", "SLIDING_WINDOW"
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_tier_multipliers (
  user_id VARCHAR(50),
  tier VARCHAR(20),  -- "free", "premium"
  multiplier DECIMAL(5,2),
  PRIMARY KEY (user_id, tier)
);

CREATE TABLE rate_limit_violations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50),
  endpoint VARCHAR(100),
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX idx_user (user_id),
  INDEX idx_timestamp (timestamp)
);
```

---

## 🔌 API Routes & Contracts

### Rate Limiter as a Service (Sidecar Pattern)

```
POST   /api/v1/check-limit
├─ Request:  { "userId": "alice", "endpoint": "POST:/api/tweets", "tokens": 1 }
├─ Response: {
│     "allowed": true,
│     "remaining": 87,
│     "resetAtMs": 1692374485000,
│     "retryAfterSecs": null
│   }
├─ Latency:  < 5ms (single Redis GET + INCR)
└─ Error:    503 Service Unavailable (if Redis down) → allow (fail open)

POST   /api/v1/check-limit-batch
├─ Request:  { 
│     "checks": [
│       { "userId": "alice", "endpoint": "GET:/api/tweets", "tokens": 1 },
│       { "userId": "bob", "endpoint": "POST:/api/retweet", "tokens": 2 }
│     ]
│   }
├─ Response: [
│     { "allowed": true, "remaining": 98, "resetAtMs": ... },
│     { "allowed": false, "remaining": 0, "resetAtMs": ... }
│   ]
└─ Latency:  < 10ms (pipeline Redis commands)

GET    /api/v1/user/{userId}/limits
├─ Response: {
│     "tier": "premium",
│     "limits": [
│       { "endpoint": "POST:/api/tweets", "remaining": 87, "resetAtMs": ... },
│       { "endpoint": "GET:/api/timeline", "remaining": 245, "resetAtMs": ... }
│     ]
│   }
└─ For: dashboard, debugging

POST   /api/v1/admin/override
├─ Request:  { "userId": "alice", "endpoint": "POST:/api/tweets", "newTokens": 100 }
├─ Response: 200 OK
└─ Effect:   Reset allowance (manual override for debugging)

GET    /api/v1/health
├─ Response: { "status": "healthy", "redis_latency_ms": 2 }
└─ Used by: load balancer, monitoring
```

### Integration with API Gateway

```
Client Request:
  GET /api/tweets HTTP/1.1
  Authorization: Bearer token_alice

┌─ API Gateway:
│  1. Extract userId from token
│  2. Check rate limit: POST /rate-limiter/check-limit
│     { userId: "alice", endpoint: "GET:/api/tweets", tokens: 1 }
│  3. If allowed: forward to service, include rate limit headers
│  4. If denied: return 429 Too Many Requests

Response Headers:
  RateLimit-Limit: 100
  RateLimit-Remaining: 87
  RateLimit-Reset: 1692374485
  Retry-After: 58
```

---

## 🏗️ Service Architecture

### Distributed Rate Limiter (Multi-Tier)

```
┌──────────────────────────────────────┐
│   API Gateway Layer                  │
│  (first line of defense)             │
└────────────┬─────────────────────────┘
             │
    ┌────────▼──────────┐
    │ Rate Limiter      │
    │ Sidecar Service   │
    │                   │
    │ • Check Redis     │
    │ • Return decision │
    └────────┬──────────┘
             │
    ┌────────▼──────────────┐
    │  Redis Cluster        │
    │ (5 nodes, sharded)    │
    │                       │
    │ Hash by userId        │
    └───────────────────────┘
```

### Components

| Component | Role | Technology |
|---|---|---|
| **API Gateway** | First check; block before service load | NGINX, Envoy Proxy |
| **Rate Limiter Sidecar** | Detailed decision logic; per-endpoint rules | Custom service |
| **Redis Cluster** | Distributed state; atomic operations | Redis Cluster 6.0+ |
| **Admin Service** | Configure rules, override limits, monitoring | REST API |

### Decision Flow

```
Request arrives at API Gateway
    │
    ├─> Rate Limiter Sidecar.allowRequest(userId, endpoint)
    │
    ├─> Query Redis: rl:user:{userId}:endpoint:{endpoint}
    │   └─> INCR counter, get remaining
    │
    ├─> If remaining >= 0:
    │   ├─> allowed = true
    │   ├─> Set response headers (Remaining, Reset)
    │   └─> Forward to service
    │
    └─> Else:
        ├─> allowed = false
        ├─> Return 429 + Retry-After header
        └─> Log violation (PostgreSQL for analytics)
```

### High Availability

```
Redis Primary: Handles writes, replicates to replica
Redis Replica: Read-only, failover target

If Primary fails:
  ├─> Sentinel detects failure (3 sec timeout)
  ├─> Promotes Replica → Primary
  ├─> Rate Limiter retries against new Primary
  └─> Brief ~1-2 second window: no rate limiting (fail open)

If both Redis down:
  └─> Rate Limiter defaults to allow (no false negatives)
      └─> Better UX than blocking all users
```

---

## ⚠️ Edge Cases & Challenges

| Challenge | Solution |
|---|---|
| **Clock Skew** | Use Redis server time, not client time |
| **Burst Traffic** | Token bucket allows configurable burst; tune maxTokens |
| **Multiple Requests Simultaneously** | Redis `INCR` is atomic; no race condition |
| **Timezone/DST Changes** | Use milliseconds since epoch, never calendar time |
| **User Tier Changes** | Refresh config cache on next request (1min TTL) |
| **Thundering Herd** | Jitter reset times by ±10%, stagger Redis key expiry |
| **Network Partition** | Redis partitioned side: accept requests (fail open) |

---

## 📐 Scalability & HLD Thinking

**Throughput:**
- Single Redis instance: ~100K requests/sec (1ms per check)
- Redis Cluster (5 nodes): ~500K requests/sec
- With sidecar caching (1-second window cache): ~1M requests/sec

**Latency:**
- Hot path: Redis GET + INCR = 2-5ms (p99 < 10ms)
- With local caching: < 1ms

**Consistency:**
- **Eventual consistency** acceptable for rate limiting (soft limits OK)
- A user briefly going over limit is acceptable; hard block is not
- CP choice: prefer consistency over availability (if Redis unavailable, allow requests)

**Scalability:**
- **Horizontal:** Redis Cluster shards by userId (CRC32(userId) % num_slots)
- **Vertical:** increase Redis memory for more rules
- **Geographic:** Redis in multiple regions with bidirectional sync (eventual consistency)

---

## 🗣️ How to Explain in the Interview

> "For rate limiting, I'd use Token Bucket algorithm for flexibility — it allows configurable burst traffic while maintaining average rate. State lives in Redis for sub-millisecond latency; it's a critical path and must not add measurable overhead.

For distributed rate limiting, I'd shard Redis by userId using consistent hashing — each user's quota is managed by one Redis instance. This avoids coordination overhead.

Clock skew is a real problem — clients and servers may disagree on time. I'd use Redis's server time as the source of truth, not client clocks.

For high availability, Redis Primary-Replica with Sentinel — if primary fails, replica promotes automatically. If Redis is completely down, I'd fail open (allow requests) rather than blocking all users — false positives are unacceptable.

For different tiers (free/premium), I'd multiply the request limit by a tier multiplier. Premium users get 5x the free tier limit, stored in a config table. If tier changes, it takes effect within 1 minute (config cache TTL).

Monitoring: I track allowance remaining per user, spike detection (if one user suddenly goes 10x over average), and Redis latency — alert if p99 latency > 10ms."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | `TokenBucketLimiter` does token buckets, `SlidingWindowLimiter` does windows |
| **O** | New algorithm = new class implementing `RateLimiter` interface |
| **L** | Any `RateLimiter` impl can substitute another |
| **I** | `RateLimiter` has minimal interface: `allowRequest()` |
| **D** | `RateLimitService` depends on `RateLimiter` interface, not concrete class |
