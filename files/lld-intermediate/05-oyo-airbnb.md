---
tags: [lld, intermediate, system-design, airbnb-interview, booking-system]
---
# LLD: Design OYO / Airbnb (Booking Platform)

## 🎯 Why This Problem is Asked
OYO/Airbnb tests:
- **Inventory management** (double-booking prevention)
- **Search optimization** (filter by date, price, location)
- **Distributed transactions** (atomicity across multiple services)
- **Denial of Service mitigation** (flash sales, inventory exhaustion)
- **Complex business logic** (cancellation policies, refunds)

Relevant for: hotel booking, car rentals, event ticketing, resource scheduling.

---

## 📋 Requirements Clarification

**Functional:**
- Users search available properties by location, dates, price
- Users book properties (reserve specific dates)
- Prevent double-booking (same property, overlapping dates)
- Cancellations with refunds (based on cancellation policy)
- Reviews and ratings
- Payment processing
- Host dashboard (manage listings, bookings)

**Non-Functional:**
- Support 100M+ properties, 1B+ users globally
- Search results < 500ms (filter by location, dates, price)
- No double-bookings (strict consistency)
- Handle 100K concurrent bookings/hour (peak)
- Support cancellations within cancellation window

---

## 🧩 Core Entities & Enums

```java
public enum ListingStatus { ACTIVE, INACTIVE, DELISTED }
public enum BookingStatus { CONFIRMED, CANCELLED, COMPLETED }
public enum CancellationPolicy { FLEXIBLE, MODERATE, STRICT }

public class Property {
    private final String propertyId;
    private final String hostId;
    private String title;
    private String description;
    private Location location;  // lat, lng
    private double pricePerNightUSD;
    private int maxGuests;
    private String[] amenities;  // pool, wifi, kitchen, etc.
    private ListingStatus status;
    private double rating;  // 1-5 stars
    private long createdAtMs;
}

public class Booking {
    private final String bookingId;
    private final String propertyId;
    private final String guestId;
    private LocalDate checkInDate;
    private LocalDate checkOutDate;
    private int numGuests;
    private double totalPriceUSD;
    private BookingStatus status;
    private String cancellationPolicyType;
    private double refundPercentageIfCancelledNow;  // dynamic
    private long createdAtMs;
    private long confirmedAtMs;
}

public class AvailabilityCalendar {
    private final String propertyId;
    private Map<LocalDate, DayAvailability> calendar;
    
    public class DayAvailability {
        private boolean available;
        private double priceUSD;
        private String bookingId;  // if booked
    }
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Optimistic Locking (Prevent Double-Booking)

```java
public class BookingService {
    private final PropertyRepository propertyRepo;
    private final AvailabilityRepository availabilityRepo;
    private final PaymentService paymentService;

    public String createBooking(BookingRequest request) throws BookingException {
        String propertyId = request.getPropertyId();
        LocalDate checkIn = request.getCheckInDate();
        LocalDate checkOut = request.getCheckOutDate();
        
        // Step 1: Read availability with version
        AvailabilityCalendar calendar = availabilityRepo.getWithLock(propertyId);
        long versionBefore = calendar.getVersion();
        
        // Step 2: Check if dates available
        for (LocalDate date = checkIn; date.isBefore(checkOut); date = date.plusDays(1)) {
            if (!calendar.isAvailable(date)) {
                throw new BookingException("Dates not available");
            }
        }
        
        // Step 3: Calculate price (dynamic pricing)
        double totalPrice = calculatePrice(propertyId, checkIn, checkOut);
        
        // Step 4: Process payment (idempotent with idempotencyKey)
        String paymentId = paymentService.processPayment(
            request.getGuestId(),
            totalPrice,
            request.getIdempotencyKey()  // prevent duplicate charges
        );
        
        // Step 5: Mark dates as booked (optimistic locking)
        Booking booking = new Booking(propertyId, request.getGuestId(), checkIn, checkOut);
        booking.setStatus(BookingStatus.CONFIRMED);
        booking.setPaymentId(paymentId);
        
        try {
            // Only succeeds if version hasn't changed
            availabilityRepo.updateWithVersionCheck(
                propertyId, 
                booking,
                versionBefore
            );
            return booking.getId();
        } catch (OptimisticLockException e) {
            // Dates changed between read & write → refund & retry
            paymentService.refund(paymentId);
            throw new BookingException("Dates were just booked, please try again");
        }
    }

    private double calculatePrice(String propertyId, LocalDate checkIn, LocalDate checkOut) {
        double total = 0;
        Property property = propertyRepo.get(propertyId);
        
        for (LocalDate date = checkIn; date.isBefore(checkOut); date = date.plusDays(1)) {
            double dayPrice = property.getPricePerNightUSD();
            
            // Dynamic pricing: surge on weekends/holidays
            if (isWeekendOrHoliday(date)) {
                dayPrice *= 1.5;
            }
            
            total += dayPrice;
        }
        
        // Add service fees
        total *= 1.12;  // 12% platform fee
        return total;
    }
}
```

**Why Optimistic Locking?**
- ✅ No locks held during payment (fast)
- ✅ Retries are rare (most bookings succeed)
- ✅ No deadlocks
- ❌ Requires retry logic

### Calendar Index for Fast Search

```java
public class CalendarIndex {
    // Inverted index: date → list of available properties
    private Map<LocalDate, Set<String>> availablePropertiesByDate;
    
    public List<String> findAvailableProperties(LocalDate checkIn, LocalDate checkOut, 
                                               int maxGuests, double maxPrice) {
        // Find properties available on ALL dates in range
        Set<String> available = new HashSet<>();
        
        for (LocalDate date = checkIn; date.isBefore(checkOut); date = date.plusDays(1)) {
            Set<String> propertiesThisDate = availablePropertiesByDate.getOrDefault(date, Set.of());
            
            if (available.isEmpty()) {
                available.addAll(propertiesThisDate);
            } else {
                available.retainAll(propertiesThisDate);  // intersection
            }
        }
        
        // Filter by guest capacity and price
        return available.stream()
            .filter(pid -> propertyRepo.get(pid).getMaxGuests() >= maxGuests)
            .filter(pid -> propertyRepo.get(pid).getPricePerNightUSD() <= maxPrice)
            .collect(Collectors.toList());
    }
}
```

### Cancellation Policy Logic

```java
public class CancellationService {
    public CancellationResult cancelBooking(String bookingId) throws CancellationException {
        Booking booking = bookingRepo.get(bookingId);
        
        if (booking.getStatus() != BookingStatus.CONFIRMED) {
            throw new CancellationException("Booking already cancelled or completed");
        }
        
        long hoursUntilCheckIn = Duration.between(
            Instant.now(), 
            booking.getCheckInDate().atStartOfDay().toInstant(ZoneOffset.UTC)
        ).toHours();
        
        double refundPercentage;
        CancellationPolicy policy = getCancellationPolicy(booking.getPropertyId());
        
        switch (policy) {
            case FLEXIBLE:
                // Full refund if cancelled 48hrs before check-in
                refundPercentage = (hoursUntilCheckIn >= 48) ? 1.0 : 0.5;
                break;
            case MODERATE:
                // Full refund if cancelled 14 days before, 50% after
                refundPercentage = (hoursUntilCheckIn >= 14 * 24) ? 1.0 : 0.5;
                break;
            case STRICT:
                // Full refund only if cancelled 30 days before
                refundPercentage = (hoursUntilCheckIn >= 30 * 24) ? 1.0 : 0.0;
                break;
            default:
                refundPercentage = 0.0;
        }
        
        double refundAmount = booking.getTotalPrice() * refundPercentage;
        
        // Process refund
        paymentService.refund(booking.getPaymentId(), refundAmount);
        
        // Mark booking as cancelled
        booking.setStatus(BookingStatus.CANCELLED);
        bookingRepo.save(booking);
        
        // Free up dates in calendar
        releaseAvailability(booking.getPropertyId(), booking.getCheckInDate(), booking.getCheckOutDate());
        
        return new CancellationResult(refundAmount, refundPercentage);
    }
}
```

---

## 🗄️ Database Design

### PostgreSQL Schema

```sql
CREATE TABLE properties (
  id VARCHAR(50) PRIMARY KEY,
  host_id VARCHAR(50) NOT NULL,
  title VARCHAR(500),
  description TEXT,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  price_per_night_usd DECIMAL(10,2),
  max_guests INT,
  amenities JSONB,
  status VARCHAR(20),  -- ACTIVE, INACTIVE
  rating DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  SPATIAL INDEX idx_location (POINT(location_lat, location_lng)),
  INDEX idx_host_id (host_id),
  INDEX idx_status (status)
);

CREATE TABLE bookings (
  id VARCHAR(50) PRIMARY KEY,
  property_id VARCHAR(50) NOT NULL REFERENCES properties(id),
  guest_id VARCHAR(50) NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  num_guests INT,
  total_price_usd DECIMAL(10,2),
  status VARCHAR(20),  -- CONFIRMED, CANCELLED, COMPLETED
  cancellation_policy VARCHAR(20),
  payment_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  version INT DEFAULT 1,  -- for optimistic locking
  INDEX idx_property (property_id),
  INDEX idx_guest (guest_id),
  INDEX idx_status (status),
  INDEX idx_dates (check_in_date, check_out_date),
  UNIQUE(property_id, check_in_date, check_out_date)  -- prevent double-booking
);

CREATE TABLE availability_calendar (
  property_id VARCHAR(50) REFERENCES properties(id),
  date DATE NOT NULL,
  available BOOLEAN DEFAULT TRUE,
  price_usd DECIMAL(10,2),
  booking_id VARCHAR(50) REFERENCES bookings(id),
  version INT DEFAULT 1,  -- for optimistic locking
  PRIMARY KEY (property_id, date),
  INDEX idx_date (date),
  INDEX idx_available (available)
);

CREATE TABLE reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  booking_id VARCHAR(50) NOT NULL REFERENCES bookings(id),
  reviewer_id VARCHAR(50),
  rating INT,  -- 1-5 stars
  title VARCHAR(200),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_booking (booking_id),
  INDEX idx_reviewer (reviewer_id)
);
```

### Redis Cache

```redis
# Property search cache (expires hourly)
search:{location}:{checkIn}:{checkOut}:{guests}:{maxPrice}
  [property1_id, property2_id, property3_id, ...]
  TTL: 3600s

# Availability for specific property (updated on every booking)
property:{propertyId}:availability
  {
    "2024-08-15": { "available": false, "bookingId": "booking-123" },
    "2024-08-16": { "available": true, "price": 150 },
    "2024-08-17": { "available": true, "price": 150 },
    ...
  }
  TTL: 86400s (refresh daily)

# Popular properties (hot data)
trending:{location}:properties
  ZSET { propertyId: score (by reviews/popularity) }
  TTL: 3600s
```

---

## 🔌 API Routes & Contracts

```
GET    /api/v1/search
├─ Query:    ?location=San Francisco&checkIn=2024-08-15&checkOut=2024-08-20
│            &guests=2&minPrice=100&maxPrice=500&amenities=wifi,pool
├─ Response: {
│     "properties": [
│       {
│         "id": "prop-123",
│         "title": "Cozy SF Apartment",
│         "lat": 37.7749, "lng": -122.4194,
│         "price": 150,
│         "rating": 4.8,
│         "availableDates": [
│           { "date": "2024-08-15", "available": true },
│           ...
│         ],
│         "imageUrl": "..."
│       }
│     ],
│     "totalCount": 1245,
│     "pageToken": "..." // pagination
│   }
├─ Latency:  < 500ms (cached index)
└─ Caching:  Redis cache by (location, dates, filters)

POST   /api/v1/bookings
├─ Request:  {
│     "propertyId": "prop-123",
│     "checkInDate": "2024-08-15",
│     "checkOutDate": "2024-08-20",
│     "numGuests": 2,
│     "paymentMethodId": "...",
│     "idempotencyKey": "uuid"  // prevent duplicate bookings
│   }
├─ Response: {
│     "bookingId": "booking-456",
│     "status": "CONFIRMED",
│     "totalPrice": 750,
│     "checkInTime": "15:00",
│     "checkOutTime": "11:00"
│   }
├─ Error:    409 Conflict (dates already booked)
└─ Idempotent: same idempotencyKey returns cached result

GET    /api/v1/bookings/{bookingId}
├─ Response: {
│     "bookingId": "booking-456",
│     "propertyId": "prop-123",
│     "propertyTitle": "Cozy SF Apartment",
│     "status": "CONFIRMED",
│     "checkInDate": "2024-08-15",
│     "checkOutDate": "2024-08-20",
│     "totalPrice": 750,
│     "cancellationPolicy": "MODERATE",
│     "refundableUntilDate": "2024-07-20",
│     "refundPercentageIfCancelledNow": 1.0
│   }
└─ Dynamic refund %: updates as cancel deadline approaches

POST   /api/v1/bookings/{bookingId}/cancel
├─ Request:  { "guestId": "guest-1", "reason": "Schedule change" }
├─ Response: {
│     "cancelled": true,
│     "refundAmount": 750,
│     "refundPercentage": 1.0,
│     "refundDate": "2024-08-22"
│   }
└─ Effect:   Free up dates, process refund, send notifications

POST   /api/v1/reviews
├─ Request:  { "bookingId": "booking-456", "rating": 5, "comment": "Amazing!" }
├─ Response: { "reviewId": "review-789", "created": true }
└─ Effect:   Update property rating aggregate

GET    /api/v1/properties/{propertyId}/availability
├─ Query:    ?startDate=2024-08-01&endDate=2024-08-31
├─ Response: [
│     { "date": "2024-08-01", "available": true, "price": 150 },
│     { "date": "2024-08-02", "available": false, "bookedBy": "guest-123" },
│     ...
│   ]
└─ For: hosts (manage listing availability)
```

---

## 🏗️ Service Architecture

```
┌─────────────────────────────────┐
│   API Gateway                   │
│  (auth, rate limit)             │
└────────────┬────────────────────┘
             │
    ┌────────▼────────────────────┐
    │ Search Service              │
    │ (availability index)        │
    └────────┬────────────────────┘
             │
    ┌────────▼────────────────────┐
    │ Booking Service             │
    │ (matching, transactions)    │
    └────────┬────────────────────┘
             │
    ├────────┴────────────┬──────────────┐
    │                     │              │
┌───▼───────┐ ┌───────────▼──┐ ┌────────▼──────┐
│PostgreSQL │ │Payment       │ │Redis Cache   │
│           │ │Service       │ │+ Kafka queue │
│ • Bookings│ │              │ │              │
│ • Calendar│ │ • Process    │ │• Invalidate  │
│ • Reviews │ │ • Refund     │ │ cache on book│
└───────────┘ └──────────────┘ └───────────────┘
```

### Complete Booking Flow

```
1. User searches: GET /search (location, dates, filters)
   ├─> Search Service hits Redis cache
   ├─> If miss: query PostgreSQL with spatial index
   ├─> Return 1000+ results, sorted by rating/price
   └─> Cache in Redis for 1 hour

2. User selects property & checks availability
   ├─> GET /properties/{id}/availability
   ├─> Show date picker (already booked dates greyed out)
   └─> Show cancellation policy + refund timeline

3. User books: POST /bookings
   ├─> Booking Service.createBooking()
   │
   ├─> Read availability with version (optimistic lock)
   │   └─> SQL: SELECT * FROM availability_calendar WHERE property_id=? AND version=?
   │
   ├─> Check dates available (all dates must be free)
   │   └─> If any date booked: throw exception, return
   │
   ├─> Calculate price (base + surge pricing + fees)
   │
   ├─> Process payment (idempotent with idempotencyKey)
   │   └─> Payment Service ensures no double-charge
   │
   ├─> Save booking + mark dates occupied (atomic)
   │   └─> SQL: BEGIN; INSERT booking; UPDATE availability_calendar; COMMIT;
   │       (will fail if version changed)
   │
   ├─> Invalidate cache
   │   └─> Redis: DEL search:{location}:*
   │   └─> Redis: SET property:{id}:availability (refresh)
   │
   ├─> Publish event to Kafka
   │   └─> Topic: "booking-confirmed" → triggers notifications, etc.
   │
   └─> Return: bookingId, confirmation details

4. If double-booking detected (version mismatch)
   ├─> OptimisticLockException caught
   ├─> Refund payment automatically
   ├─> Return 409 error: "Dates just got booked"
   └─> User retries (usually succeeds on 2nd try)

5. User cancels within window: POST /bookings/{id}/cancel
   ├─> Check cancellation policy
   │   └─> FLEXIBLE: 48hrs before = full refund
   │   └─> MODERATE: 14 days before = full refund
   │   └─> STRICT: 30 days before = full refund only
   │
   ├─> Calculate refund %
   │
   ├─> Process refund (idempotent)
   │
   ├─> Mark booking CANCELLED
   │
   ├─> Free dates in calendar
   │   └─> DELETE FROM availability_calendar WHERE booking_id = ?
   │
   ├─> Invalidate cache
   │
   └─> Notify host + guest
```

---

## 📐 Scalability & HLD Thinking

**Throughput:**
- Single booking service: 10K bookings/hour
- Distributed (50 instances): 500K bookings/hour
- Search: 100K queries/sec (cached)

**Latency:**
- Search: < 500ms (Redis cache)
- Booking: < 2 sec (payment processing)
- Cancellation: < 500ms

**Consistency:**
- **Strong consistency for bookings** (optimistic locking prevents double-booking)
- **Eventual consistency for reviews** (aggregate rating updates eventually)
- **Strong consistency for payments** (no double-charging)

**Scalability Strategy:**
- **Shard by geography**: each region has own database (no cross-region queries)
- **Cache popular properties**: top 1% of properties cached in Redis
- **Denormalize averages**: pre-compute property ratings (updated hourly)

**Double-Booking Prevention:**
- **Method 1** (used above): Optimistic locking on availability_calendar.version
- **Method 2**: Pessimistic locking (SELECT FOR UPDATE) — slower but guaranteed
- **Method 3**: Distributed locks (Redis, etcd) — overkill, causes contention

---

## 🗣️ How to Explain in the Interview

> "The key challenge is preventing double-bookings at scale. I'd use optimistic locking: read the version of the availability record, process payment, then try to update with CAS (Compare-And-Swap). If version changed, abort, refund, and retry.

For search, I'd use PostgreSQL spatial indexes on (lat, lng) to find properties near a location. For date availability, I'd maintain an inverted index in Redis: date → available properties. This allows sub-second searches.

For pricing, I'd support dynamic pricing (surge on weekends/holidays). This is stored in the availability_calendar table and refreshed daily.

For cancellations, the refund % depends on when they cancel relative to check-in. I'd calculate this dynamically, showing guests the current refund amount in real-time.

For high availability, I'd shard by geography — US East, US West, Europe, APAC each have own database. This prevents a regional outage from affecting global bookings.

For monitoring, I'd track: booking success rate (should be > 95%), average booking latency (< 2sec), double-booking incidents (should be 0), refund disputes."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | BookingService books, SearchService searches, CancellationService cancels |
| **O** | New cancellation policy = new enum value, no code changes |
| **D** | Services depend on repositories (interface), not direct DB access |
