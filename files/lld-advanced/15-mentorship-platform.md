---
tags: [lld, advanced, system-design, mentorship, scheduling]
---
# LLD: Design Mentorship Platform

## 🎯 Why This Problem is Asked
A mentorship platform combines matching, scheduling, and payments. It tests algorithmic matching and availability modeling.

---

## 📋 Requirements Clarification

### Functional
- mentor and mentee profiles
- time-slot booking
- matching recommendations
- session tracking and reviews
- payments and settlement

### Non-Functional
- schedule consistency
- low latency for booking
- scalable matching for large networks

---

## 🧩 Core Entities

```java
public class UserProfile {
    private String userId;
    private String role; // mentor or mentee
    private List<String> skills;
    private double experienceYears;
}

public class SessionSlot {
    private String slotId;
    private String mentorId;
    private long startTimeMs;
    private long endTimeMs;
    private boolean booked;
}
```

---

## 🏗️ LLD Patterns

### 1. Matching score
Mentors are ranked by expertise, availability, and compatibility.

```java
public class MatchingService {
    public double score(UserProfile mentee, UserProfile mentor) {
        return expertiseScore(mentee, mentor) + availabilityScore(mentor);
    }
}
```

### 2. Calendar conflict detection
Before booking, check whether the slot is already reserved.

---

## 🗄️ Database Design

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  role VARCHAR(20),
  experience_years INT,
  skills JSONB
);

CREATE TABLE session_slots (
  slot_id UUID PRIMARY KEY,
  mentor_id UUID REFERENCES users(user_id),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  booked BOOLEAN DEFAULT FALSE
);

CREATE TABLE bookings (
  booking_id UUID PRIMARY KEY,
  mentor_id UUID REFERENCES users(user_id),
  mentee_id UUID REFERENCES users(user_id),
  slot_id UUID REFERENCES session_slots(slot_id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 API Routes & Contracts

```
GET /v1/mentors?skill=java&location=india
POST /v1/bookings
Request: { "mentorId": "u-1", "menteeId": "u-2", "slotId": "s-8" }
```

---

## 🏗️ Service Architecture

```text
API -> Matching Service -> Availability Service -> Booking Service -> Payment/Notification
```

---

## 📐 HLD Concepts

- book slots with optimistic locking or versioned availability
- match recommendations can be precomputed or refreshed asynchronously
- notification service handles reminders and session follow-ups

---

## 🗣️ How to Explain in the Interview

> "The platform really has three moving parts: matching mentors to mentees, validating time availability, and booking with payment confirmation. I would model mentorship as a scheduling system on top of a recommendation engine, and I would keep the booking atomic so a slot cannot be double-booked."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Matching, booking, and payment are separate |
| O | New matching filters can be added without changing booking services |
| D | Scheduling logic depends on a repository abstraction |

---

## ⚠️ Follow-up Questions
- How do you avoid double-booking?
- How do you match mentors at scale with sorted skill compatibility?
- How do you handle reschedules and cancellations?

---

## 🔥 Deep Dive: Production Realities for Mentorship Platform

### 1. Matching Problem
Mentorship is a hybrid of recommendation and scheduling. The platform needs to identify:
- mentor skill alignment with mentee goals
- availability for sessions
- time-zone and schedule compatibility
- trust and profile credibility

This is often solved with a ranking service that combines explicit skills, historical performance, and availability.

### 2. Availability and Slot Inventory
Time slots are a classic scheduling problem. A slot may be:
- open
- reserved
- booked
- canceled
- rescheduled

The booking service should check for conflicts and update slot state in an atomic way. This usually means optimistic locking or row-version checks to avoid duplicate reservations.

### 3. Booking Workflow
A good booking flow includes:
- a slot lookup by mentor and time range
- availability validation against calendar rules
- confirmation from both parties if needed
- payment authorization or credit hold
- email or push reminder scheduling

Failures at this stage can result in a broken user trust loop.

### 4. Reschedules and Cancellations
Scheduling systems need clear policy logic:
- cancellation before a threshold is allowed without penalty
- last-minute cancellation can trigger a fee or session credit
- cancellations should free the slot immediately and notify the mentor
- reschedule requests should keep booking history and current slot state

### 5. Payment and Session Tracking
A mentorship platform often needs:
- session fee calculation
- escrow or direct payment on booking
- refund logic on no-show or cancellation
- review and rating after the session

This creates a strong link between scheduling and financial bookkeeping.

### 6. Scaling and Recommendation Caching
At scale, you cannot compute matches from scratch for every request. Use:
- cached mentor availability indexes
- precomputed skill-based mentor lists
- periodic recommendation refresh in background workers
- geospatial or timezone filters before ranking

### 7. Interview Answer Template
> "I’d separate mentorship into recommendation, scheduling, and booking. The matching service ranks mentors by skill relevance and availability, while the scheduling service ensures a slot is not double-booked. After a valid match, the booking service reserves the time, processes the payment or hold, and triggers reminders. The main challenge is reconciling real-world availability with user intent while keeping the system fast and consistent."
