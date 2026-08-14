---
tags: [lld, advanced, system-design, tinder, dating-app]
---
# LLD: Design Tinder

## 🎯 Why This Problem is Asked
Tinder tests recommendation logic, matching, profile ranking, and real-time messaging at scale.

---

## 📋 Requirements Clarification

### Functional
- show candidates
- like/dislike actions
- match notifications
- in-app chat after match
- profile updates and preferences

### Non-Functional
- high throughput for swipes
- low-latency recommendation service
- fairness and ranking quality

---

## 🧩 Core Entities

```java
public class UserProfile {
    private String userId;
    private String gender;
    private int age;
    private List<String> interests;
    private double latitude;
    private double longitude;
}

public class SwipeEvent {
    private String userId;
    private String targetUserId;
    private boolean liked;
    private long ts;
}
```

---

## 🏗️ LLD Patterns

### 1. Candidate recommendation ranking
Use score = distance similarity + compatibility + recency.

```java
public class RecommendationEngine {
    public double score(UserProfile a, UserProfile b) {
        return distanceScore(a, b) + interestMatchScore(a, b);
    }
}
```

### 2. Matching with uniqueness constraint
A match is created only when both users liked each other.

---

## 🗄️ Database Design

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  age INT,
  gender VARCHAR(20),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

CREATE TABLE swipes (
  swiping_user_id UUID,
  target_user_id UUID,
  liked BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (swiping_user_id, target_user_id)
);

CREATE TABLE matches (
  match_id UUID PRIMARY KEY,
  user_a UUID,
  user_b UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 API Routes & Contracts

```
GET /v1/recommendations/{userId}
Response: { "candidates": [...] }

POST /v1/swipes
Request: { "userId": "u-1", "targetUserId": "u-2", "liked": true }
```

---

## 🏗️ Service Architecture

```text
Client -> API -> Recommendation Service -> Ranking Engine
                                         -> Matching Service
                                         -> Notification Service
```

---

## 📐 HLD Concepts

- hot caches for candidate profiles
- geo-based filtering and ranking
- asynchronous match notifications
- anti-spam and fairness policies

---

## 🗣️ How to Explain in the Interview

> "The matching problem is a recommendation plus state machine issue: I rank candidates geographically and by compatibility, then create a match only when both sides have positive intent. This keeps the system simple while still making the recommendation quality feel personalized."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Recommendation, swipe, and match services are separate |
| O | Ranking policy can change without rewriting the matching flow |
| D | Services depend on repository interfaces |

---

## ⚠️ Follow-up Questions
- How do you prevent repeated recommendations to the same user?
- How do you avoid bias or unfair ranking?
- How do you scale the recommendation engine for millions of profiles?

---

## 🔥 Deep Dive: Production Realities for Tinder

### 1. Candidate Feed Generation
The core product is a real-time recommendation feed. A typical flow is:
- fetch a candidate pool by geography, age preferences, and hidden constraints
- score each profile using a ranking model
- exclude already-swiped users and recent matches
- serve the top K candidates in a user-specific order

This can be implemented with a recommendation service plus a ranking model that updates over time based on engagement.

### 2. Swipe Event Semantics
Swipes are high-volume, write-heavy events:
- a user likes or dislikes another profile
- the system stores the swipe event
- the system updates user preference summaries and candidate suppression lists
- a match service checks for reciprocal interest

The system must make swipe ingestion idempotent and fast under burst traffic.

### 3. Match Creation and Notification
A match is only created when both users like each other. The system often:
- checks if a reciprocal swipe exists
- creates a match record with both users
- sends notification events for both users
- enables chat access for the match

This is a classic event-driven state transition.

### 4. Ranking and Fairness
Good ranking means more than simple distance-based filtering. It may include:
- compatibility scores from shared interests
- response probability model
- freshness and recency adjustments
- anti-spam rules against repetitive matches

The system must also avoid patterns where a user gets stuck with repetitive recommendations because the ranking model is overfit.

### 5. Cold Start and New Profiles
New users and new profiles are challenging because there is little history. A typical strategy is:
- use profile metadata and initial popularity scores
- show broader candidate distribution to train the ranking model
- expand the pool after a few interactions

### 6. Failure Modes
- candidate engine returns stale or repeated profiles
- a user double-swipes due to network retry
- a match is created twice due to event duplicates
- notification service is slow causing delayed match alerts

Solutions include idempotency keys, deduplication, and eventual consistency between swipe processing and match notifications.

### 7. Interview Answer Template
> "I’d treat Tinder as a recommendation engine plus a match state machine. The recommendation service filters and ranks profiles by geography, compatibility, and recency, while the swipe service persists actions and suppresses those already seen. A match only appears when both sides have liked each other, and a notification pipeline then enables chat. The key challenge is ranking quality and scale rather than just data correctness."
