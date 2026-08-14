---
tags: [lld, intermediate, system-design, amazon-interview, google-interview, uber-interview]
---
# LLD: Design Uber (Ride-Sharing Platform)

## 🎯 Why This Problem is Asked
Uber is the **ultimate system design interview problem**. Tests:
- **Real-time location tracking** (millions of users moving simultaneously)
- **Geospatial queries** (find nearest drivers)
- **Matching algorithm** (optimal driver-rider pairing)
- **Concurrency & consistency** (distributed transactions)
- **Scalability at extreme scale** (100K+ concurrent rides)

Applicable to: food delivery, ride-sharing, location services, real-time marketplace.

---

## 📋 Requirements Clarification

**Functional:**
- Users request rides (source, destination, ride type)
- Match users to nearby drivers (within 5km radius, accepted status)
- Real-time driver location updates
- Trip tracking (pickup, in-transit, dropoff)
- Payment processing
- Rating system (driver + rider)

**Non-Functional:**
- Support 1M active drivers + 10M active riders globally
- Real-time matching (< 10 second match latency)
- Location updates every 5 seconds per driver
- Handle peak load (10x average)
- Geospatial queries on 1M+ drivers (< 100ms)

---

## 🧩 Core Entities & Enums

```java
public enum UserRole { RIDER, DRIVER }
public enum RideStatus { REQUESTED, ACCEPTED, PICKUP, IN_TRANSIT, COMPLETED, CANCELLED }
public enum RideType { ECO, COMFORT, PREMIUM }

public class User {
    private final String userId;
    private final String name;
    private final UserRole role;
    private String phoneNumber;
    private double rating;
    private List<Payment> paymentMethods;
}

public class Driver extends User {
    private String licenseNumber;
    private String vehicleNumber;
    private RideType acceptableTypes[];
    private volatile DriverStatus status;  // ONLINE, OFFLINE, ON_RIDE
    private volatile Location currentLocation;
}

public class Rider extends User {
    private Location homeAddress;
    private Location workAddress;
    private List<Favorite> favorites;
}

public class Location {
    private double latitude;
    private double longitude;
    
    public double distanceTo(Location other) {
        // Haversine formula: great-circle distance
        return haversine(this.lat, this.lng, other.lat, other.lng);
    }
}

public class Ride {
    private final String rideId;
    private final String riderId;
    private final String driverId;
    private RideStatus status;
    private Location pickupLocation;
    private Location dropoffLocation;
    private Location currentLocation;  // for in-transit
    private RideType rideType;
    private double estimatedFareCents;
    private double actualFareCents;
    private long createdAtMs;
    private long acceptedAtMs;
    private long pickedupAtMs;
    private long completedAtMs;
}

public class Payment {
    private final String paymentId;
    private double amountCents;
    private String method;  // CARD, UPI, CASH
    private PaymentStatus status;
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Geospatial Matching with Quadtrees

```java
public class GeoQuadTree {
    private static final double EARTH_RADIUS_KM = 6371;
    private Node root;

    private class Node {
        double minLat, maxLat, minLng, maxLng;
        List<Driver> drivers = new ArrayList<>();
        Node[] children = new Node[4];  // NW, NE, SW, SE quadrants
        
        boolean isLeaf() { return children[0] == null; }
    }

    public List<Driver> findNearbyDrivers(Location riderLocation, double radiusKm, RideType type) {
        List<Driver> nearby = new ArrayList<>();
        findNearby(root, riderLocation, radiusKm, type, nearby);
        return nearby;
    }

    private void findNearby(Node node, Location center, double radiusKm, 
                           RideType type, List<Driver> results) {
        if (node == null) return;
        
        if (!isNodeWithinRadius(node, center, radiusKm)) return;  // prune

        if (node.isLeaf()) {
            for (Driver driver : node.drivers) {
                if (driver.acceptableTypes.contains(type) && 
                    driver.currentLocation.distanceTo(center) <= radiusKm) {
                    results.add(driver);
                }
            }
        } else {
            for (Node child : node.children) {
                findNearby(child, center, radiusKm, type, results);
            }
        }
    }

    private boolean isNodeWithinRadius(Node node, Location center, double radiusKm) {
        // Check if node bounds intersect with circle
        double dLat = Math.min(Math.abs(node.minLat - center.latitude),
                               Math.abs(node.maxLat - center.latitude));
        double dLng = Math.min(Math.abs(node.minLng - center.longitude),
                               Math.abs(node.maxLng - center.longitude));
        return dLat * dLat + dLng * dLng <= radiusKm * radiusKm;
    }
}
```

**Why Quadtree?**
- ✅ 2D spatial indexing (lat/lng coordinates)
- ✅ O(log N) lookup for nearby points
- ✅ Pruning: skip irrelevant branches
- ❌ Rebalancing overhead on frequent updates

### Matching Algorithm

```java
public class MatchingService {
    private final GeoQuadTree driverTree;
    private final MatchingStrategy strategy;

    public Optional<String> findBestDriver(Ride ride) {
        List<Driver> candidates = driverTree.findNearbyDrivers(
            ride.getPickupLocation(), 5.0, ride.getRideType()
        );

        if (candidates.isEmpty()) return Optional.empty();

        // Score each candidate
        List<DriverScore> scored = candidates.stream()
            .map(driver -> new DriverScore(
                driver.getId(),
                calculateScore(driver, ride)
            ))
            .sorted(Comparator.reverseOrder())
            .collect(Collectors.toList());

        // Try top 3 in parallel
        for (DriverScore score : scored.subList(0, Math.min(3, scored.size()))) {
            boolean accepted = sendMatchRequest(score.driverId, ride, 30);  // 30 sec timeout
            if (accepted) return Optional.of(score.driverId);
        }

        return Optional.empty();
    }

    private double calculateScore(Driver driver, Ride ride) {
        double distanceFactor = 1.0 / (1.0 + driver.getDistanceTo(ride.getPickupLocation()));
        double ratingFactor = driver.getRating() / 5.0;
        double acceptanceRateFactor = driver.getAcceptanceRate();
        
        return distanceFactor * 0.5 + ratingFactor * 0.3 + acceptanceRateFactor * 0.2;
    }

    private boolean sendMatchRequest(String driverId, Ride ride, int timeoutSecs) {
        // Send push notification to driver
        // Wait for acceptance (via WebSocket/callback)
        // Return true if driver accepts within timeout
        // Else try next candidate
        return driverAcceptanceChannel.waitForResponse(driverId, ride.getId(), timeoutSecs);
    }
}
```

### Real-Time Location Updates

```java
public class LocationUpdateService {
    private final GeoQuadTree driverTree;
    private final Map<String, Location> driverLocations;  // Redis cache
    private final MessageQueue locationQueue;  // Kafka

    public void updateDriverLocation(String driverId, Location newLocation) {
        Location oldLocation = driverLocations.get(driverId);
        
        // Update cache
        driverLocations.put(driverId, newLocation);
        
        // Update tree
        if (oldLocation != null) {
            driverTree.remove(oldLocation, driverId);
        }
        driverTree.insert(newLocation, driverId);
        
        // Publish to Kafka for real-time processing
        locationQueue.publish("driver-locations", 
            new LocationUpdate(driverId, newLocation, System.currentTimeMillis()));
    }

    public Location getDriverLocation(String driverId) {
        return driverLocations.getOrDefault(driverId, null);
    }
}
```

### Fare Calculation

```java
public class FareCalculator {
    private final static double BASE_FARE = 5.0;
    private final static double COST_PER_KM = 2.0;
    private final static double COST_PER_MINUTE = 0.5;
    private final static double SURGE_MULTIPLIER_PEAK = 2.0;

    public double calculateEstimatedFare(Ride ride) {
        double distance = ride.getPickupLocation().distanceTo(ride.getDropoffLocation());
        double time = estimateTime(distance);  // in minutes
        
        double baseFare = BASE_FARE + (distance * COST_PER_KM) + (time * COST_PER_MINUTE);
        
        // Apply surge pricing during peak hours
        double surgeMultiplier = isSurgePricing() ? SURGE_MULTIPLIER_PEAK : 1.0;
        
        return Math.round(baseFare * surgeMultiplier * 100) / 100.0;  // round to 2 decimals
    }

    public double calculateActualFare(Ride ride) {
        // Use actual distance traveled (from GPS waypoints) + actual time
        double actualDistance = calculateActualDistance(ride);
        double actualTime = (ride.getCompletedAtMs() - ride.getPickedupAtMs()) / 60000.0;
        
        double baseFare = BASE_FARE + (actualDistance * COST_PER_KM) + (actualTime * COST_PER_MINUTE);
        
        // No surge on actual fare (already paid estimated)
        return Math.round(baseFare * 100) / 100.0;
    }
}
```

---

## 🗄️ Database Design

### PostgreSQL Schema

```sql
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  role VARCHAR(20),  -- RIDER, DRIVER
  rating DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_email (email)
);

CREATE TABLE drivers (
  id VARCHAR(50) PRIMARY KEY REFERENCES users(id),
  license_number VARCHAR(50) UNIQUE,
  vehicle_number VARCHAR(20),
  status VARCHAR(20),  -- ONLINE, OFFLINE, ON_RIDE
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  last_location_update TIMESTAMP,
  INDEX idx_status (status),
  SPATIAL INDEX idx_location (POINT(current_lat, current_lng))
);

CREATE TABLE rides (
  id VARCHAR(50) PRIMARY KEY,
  rider_id VARCHAR(50) REFERENCES users(id),
  driver_id VARCHAR(50) REFERENCES drivers(id),
  status VARCHAR(20),
  pickup_lat DECIMAL(10,8),
  pickup_lng DECIMAL(11,8),
  dropoff_lat DECIMAL(10,8),
  dropoff_lng DECIMAL(11,8),
  ride_type VARCHAR(20),
  estimated_fare_cents BIGINT,
  actual_fare_cents BIGINT,
  created_at TIMESTAMP,
  accepted_at TIMESTAMP,
  pickup_at TIMESTAMP,
  dropoff_at TIMESTAMP,
  INDEX idx_rider (rider_id),
  INDEX idx_driver (driver_id),
  INDEX idx_created_at (created_at DESC)
);

CREATE TABLE ratings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  from_user_id VARCHAR(50),
  to_user_id VARCHAR(50),
  ride_id VARCHAR(50) REFERENCES rides(id),
  rating INT,  -- 1-5 stars
  comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ride_id, from_user_id),
  INDEX idx_to_user (to_user_id)
);

CREATE TABLE payments (
  id VARCHAR(50) PRIMARY KEY,
  ride_id VARCHAR(50) REFERENCES rides(id),
  amount_cents BIGINT,
  method VARCHAR(20),  -- CARD, UPI, CASH
  status VARCHAR(20),  -- PENDING, COMPLETED, FAILED
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Redis Cache

```redis
# Driver locations (updated every 5 seconds)
driver:{driverId}:location
  {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 10,
    "timestamp": 1692374425000
  }
  TTL: 60s (expire stale locations)

# Active rides
ride:{rideId}
  {
    "riderId": "...",
    "driverId": "...",
    "status": "IN_TRANSIT",
    "pickupLat": 40.7128,
    "dropoffLat": 40.7580,
    "currentLat": 40.7300,  // updated in real-time
    "currentLng": -74.0050,
    "estimatedFare": 12.50,
    "createdAt": 1692374400000
  }
  TTL: Remove when ride completed

# Ride requests waiting for matching
ride-request-queue
  ZSET (sorted by timestamp)
  Members: {rideId:timestamp}
  Used for: aging requests, re-matching after timeout
```

---

## 🔌 API Routes & Contracts

```
POST   /api/v1/rides/request
├─ Request:  {
│     "riderId": "alice",
│     "pickupLat": 40.7128, "pickupLng": -74.0060,
│     "dropoffLat": 40.7580, "dropoffLng": -73.9855,
│     "rideType": "ECO"
│   }
├─ Response: {
│     "rideId": "ride-123",
│     "status": "REQUESTED",
│     "estimatedFareCents": 1250,
│     "estimatedPickupTimeSecs": 420
│   }
├─ Latency:  < 2 seconds (matching happens async)
└─ Async:    Matching service finds driver and notifies

GET    /api/v1/rides/{rideId}
├─ Response: {
│     "rideId": "ride-123",
│     "status": "IN_TRANSIT",
│     "driverId": "driver-456",
│     "driverName": "Bob",
│     "driverRating": 4.8,
│     "vehicleNumber": "ABC123",
│     "currentLat": 40.7300, "currentLng": -74.0050,
│     "estimatedDropoffTimeSecs": 180,
│     "fare": { "estimated": 12.50, "actual": null }
│   }
└─ Real-time updates via WebSocket

WebSocket /ws/rides/{rideId}
├─ Subscribe: rider/driver receive updates
├─ Message:   { "type": "DRIVER_ACCEPTED", "driverId": "driver-456" }
├─ Message:   { "type": "LOCATION_UPDATE", "lat": 40.7300, "lng": -74.0050 }
├─ Message:   { "type": "PICKUP", "driverArrived": true }
└─ Message:   { "type": "RIDE_COMPLETED", "finalFare": 12.75 }

POST   /api/v1/rides/{rideId}/cancel
├─ Request:  { "riderId": "alice", "reason": "Driver too far" }
├─ Response: { "cancelled": true, "refund": null }
└─ Latency:  < 500ms

POST   /api/v1/rides/{rideId}/rating
├─ Request:  { "fromUserId": "alice", "rating": 5, "comments": "Great driver!" }
├─ Response: 201 Created
└─ Effect:   Update user average rating

GET    /api/v1/drivers/nearby
├─ Query:    ?lat=40.7128&lng=-74.0060&radiusKm=5&type=ECO
├─ Response: [
│     { "driverId": "...", "lat": 40.7200, "lng": -74.0100, "rating": 4.9 },
│     { "driverId": "...", "lat": 40.7250, "lng": -73.9950, "rating": 4.7 }
│   ]
└─ For: debugging, user can request specific driver
```

---

## 🏗️ Service Architecture

### Microservices Architecture

```
┌────────────────────────────────────────────────┐
│           API Gateway                          │
│  (auth, rate limiting, routing)                │
└────────────┬─────────────────────────────────┬─┘
             │                                 │
    ┌────────▼──────────┐          ┌──────────▼────────┐
    │  Ride Service     │          │  Driver Service   │
    │                   │          │                   │
    │ • Create ride     │          │ • Update location │
    │ • Cancel ride     │          │ • Get status      │
    │ • Complete ride   │          │ • Accept/Decline  │
    └────────┬──────────┘          └──────────┬────────┘
             │                                │
    ┌────────▼──────────────────────────┐    │
    │  Matching Service                 │◄───┘
    │  (GeoQuadTree, scoring)           │
    │  • Find nearby drivers            │
    │  • Match algorithm                │
    │  • Ranking by score               │
    └────────┬──────────────────────────┘
             │
    ┌────────▼──────────────────────────┐
    │  Location Service                 │
    │  (Real-time tracking)             │
    │  • Update driver location         │
    │  • Broadcast to subscribers       │
    │  • Geospatial indexing            │
    └────────┬──────────────────────────┘
             │
    ┌────────▼──────────────────────────┐
    │  Payment Service                  │
    │  • Calculate fare                 │
    │  • Process payment                │
    │  • Handle refunds                 │
    └────────┬──────────────────────────┘
             │
    ├────────┴────────────────┬────────────────┐
    │                         │                │
┌───▼────────┐ ┌─────────────▼──┐ ┌──────────▼──────┐
│PostgreSQL  │ │  Redis Cache   │ │ Kafka (events) │
│ (durable)  │ │  (real-time)   │ │ (audit trail)  │
└────────────┘ └────────────────┘ └────────────────┘
```

### Complete Ride Request Flow

```
1. User requests ride: POST /api/v1/rides/request
   ├─> RideService.createRide() → status=REQUESTED
   ├─> Publish to Kafka: "ride-requested"
   └─> Return immediately (async matching)

2. MatchingService subscribes to Kafka
   ├─> Receive: ride-123
   ├─> Call LocationService.findNearbyDrivers(5km, type=ECO)
   │   └─> Quadtree lookup: ~O(log N) = O(log 1M) ≈ 20 comparisons
   ├─> Score top candidates
   ├─> Send match requests to top 3 drivers (parallel)
   └─> Wait for acceptance (30 sec timeout)

3. Driver receives push notification
   ├─> Driver action: Accept/Decline (WebSocket)
   └─> Send response to MatchingService

4. MatchingService handles response
   ├─> If accepted:
   │   ├─> Update ride status: ACCEPTED
   │   ├─> Assign driverId
   │   ├─> Update Redis: ride-123 (driver info)
   │   ├─> Publish to Kafka: "ride-accepted"
   │   └─> Notify rider via WebSocket
   │
   ├─> If declined:
   │   ├─> Try next candidate
   │   └─> If all decline: re-queue for retry

5. During ride (in-transit)
   ├─> Driver sends location every 5s
   ├─> LocationService updates Redis
   ├─> WebSocket pushes to rider real-time
   ├─> ETA calculator updates based on traffic

6. Ride completion
   ├─> Driver marks "Arrived at dropoff"
   ├─> Rider confirms pickup complete
   ├─> PaymentService calculates actual fare
   ├─> Process payment
   ├─> Publish to Kafka: "ride-completed"
   └─> Both can rate each other
```

---

## 📐 Scalability & HLD Thinking

**Throughput:**
- Single matching service: ~10K rides/min
- Distributed (10 instances): ~100K rides/min
- At scale: shard by city/region (each city has own GeoQuadTree)

**Latency:**
- Ride request: < 2 sec (async matching)
- Matching: < 10 sec (find + send + wait for response)
- Location update: ~500ms (update tree + publish)
- Fare calculation: < 10ms

**Consistency:**
- **Eventual consistency for driver availability** (cache expiry: 60s)
- **Strong consistency for payments** (transactions, no double-charging)
- **Eventual consistency for ratings** (eventual aggregate)

**Geographic Distribution:**
- Each city/region: separate PostgreSQL instance, Redis cluster, matching service
- Global leaderboard: replicate ratings to central store (denormalized)
- Cross-region: ride requests don't cross city boundaries

---

## 🗣️ How to Explain in the Interview

> "For matching drivers to riders, I'd use a Quadtree for 2D spatial indexing. When a ride is requested, I query the tree for drivers within 5km — this is O(log N). Then I score candidates by distance, rating, and acceptance rate.

For real-time location updates, I'd have drivers send their location every 5 seconds via WebSocket. I'd cache locations in Redis (60s TTL) and update the Quadtree. This allows sub-second location updates for riders.

For high availability, I'd shard by city — each city has its own matching service, databases, and Redis. This prevents a spike in one city from affecting others.

For payment, I'd use a separate payment service with transactions. Fare is estimated upfront (distance + time), then adjusted based on actual ride. This is a strong consistency operation.

For ratings, I eventually aggregate to PostgreSQL — eventual consistency is OK since ratings are not critical to the ride experience.

For surge pricing, I'd calculate multiplier based on demand/supply ratio every minute. This requires counting active drivers in each region — I'd denormalize this in Redis.

Monitoring: I'd track request-to-acceptance time (P95 < 10 sec), matching success rate (> 90%), and payment failure rate (< 0.1%)."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | MatchingService does matching, LocationService does location, PaymentService handles payments |
| **O** | New ride types (PREMIUM) = new config, no code changes |
| **L** | Different MatchingStrategy impls (distance vs rating) can substitute |
| **D** | Services depend on interfaces (LocationService, PaymentService) |
