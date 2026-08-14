---
tags: [lld, patterns, reference]
---
# 3-Day LLD (Low-Level Design) Intensive Prep Plan

## 🎯 The Core Mental Model for LLD
In an LLD interview, your code is evaluated on 4 parameters:
1. **Separation of Concerns:** Clear boundaries between entities (Controller vs Service vs Repository).
2. **Extensibility (Open-Closed Principle):** Can you add a new feature (e.g., a new Payment Gateway) without modifying existing code?
3. **Clean Abstractions:** Correct use of interfaces, abstract classes, and enums.
4. **Concurrency Safety:** Preventing race conditions in shared resources (e.g., double-booking a seat or parking spot).

---

## 🛠️ The Standard 5-Step Interview Framework
Follow this strict structure during every LLD round (spend 5–7 mins discussing step 1–3 before coding):
1. **Requirements Clarification** ──> Scope functional requirements & constraints
2. **Core Entities & Enums** ──> Identify nouns (Classes) & types (Enums)
3. **Class Interfaces & Design** ──> Apply Patterns (Strategy, Factory, Observer)
4. **Implementation / Code** ──> Write production-grade, thread-safe code
5. **Edge Cases & Concurrency** ──> Discuss locking, synchronization, and scalability

---

## 📅 Day-by-Day Schedule

### Day 1: Mastering Clean Architecture & Core Design Patterns
*Focus: Master the top 5 GoF patterns that cover 90% of LLD interview scenarios.*

#### Morning: Design Patterns Mastery
* **Strategy Pattern** *(Must-Know)*
  * *Use Case:* Swappable algorithms or logic at runtime (e.g., Payment strategies, Pricing models, Sorting/Routing algorithms).
* **Factory / Abstract Factory Pattern**
  * *Use Case:* Object creation logic encapsulation (e.g., Creating different types of notifications, vehicle objects, or database connections).
* **Observer Pattern**
  * *Use Case:* Event-driven state updates (e.g., Notifying users on order status change, stock price changes, pub-sub systems).
* **State Pattern**
  * *Use Case:* Entity transitions through explicit states (e.g., Vending Machine, Order lifecycle: `ORDERED` -> `SHIPPED` -> `DELIVERED`).
* **Decorator Pattern**
  * *Use Case:* Dynamically adding behaviors without changing base classes (e.g., Pizza toppings pricing, Coffee customizations, I/O streams).

#### Afternoon & Evening: Hands-On Problem 1
* **Problem:** Design a **Parking Lot** or **Vending Machine**
* **Key Focus:** 
  * Class structure: `Vehicle` (abstract), `Car`, `Bike`, `ParkingSpot` (abstract), `ParkingFloor`, `PaymentTicket`.
  * Strategy Pattern for Pricing (`HourlyPricingStrategy`, `FlatPricingStrategy`).
  * Concurrency control when assigning parking spots (`ConcurrentHashMap` or `ReentrantLock`).

---

### Day 2: High-Frequency Amazon LLD Problems & Concurrency
*Focus: Practice end-to-end design for complex, real-world systems.*

#### Morning: Concurrency & Thread-Safety Basics
* Learn how to make shared states thread-safe:
  * Java Locks (`ReentrantLock`, `synchronized`).
  * Atomic operations (`AtomicInteger`).
  * Thread-safe collections (`ConcurrentHashMap`, `CopyOnWriteArrayList`).

#### Afternoon: Hands-On Problem 2
* **Problem:** Design **Amazon Locker Service** (Classic Amazon Problem)
* **Key Requirements:**
  * Find nearest available locker based on package dimensions.
  * OTP generation & expiration for unlocking.
  * Return package workflow.
* **Key Focus:** 
  * Entity design: `Package`, `Locker`, `LockerSize` (Enum), `LockerSite`, `OTP`.
  * Strategy Pattern for Locker Matching Algorithm (`SmallestFitStrategy`).

#### Evening: Hands-On Problem 3
* **Problem:** Design a **Movie Ticket / Event Booking System** (BookMyShow / Ticketmaster)
* **Key Focus:**
  * Entities: `Show`, `Theater`, `Screen`, `Seat`, `Booking`, `Payment`.
  * **Handling Race Conditions:** Preventing two users from booking the exact same seat simultaneously (Pessimistic vs Optimistic Locking at class/database level).

---

### Day 3: Advanced Problems, Review & Dry Runs
*Focus: Polishing implementation speed, edge cases, and SOLID refactoring.*

#### Morning: Hands-On Problem 4
* **Problem:** Design an **Elevator Control System** or **In-Memory Rate Limiter**
* **Key Focus for Elevator:**
  * `ElevatorController`, `ElevatorCar`, `Button`, `Direction` (Enum).
  * Dispatch Algorithm (LOOK / SCAN algorithm implemented via Strategy Pattern).
* **Key Focus for Rate Limiter:**
  * Token Bucket or Sliding Window Log pattern.
  * In-memory storage with quick lookup and automatic cleanup.

#### Afternoon: Cheat Sheet & Refactoring Review
* Review SOLID principles against code written over the last 2 days:
  * **S**ingle Responsibility: Are controllers mixed with business logic?
  * **O**pen/Closed: Can you add a new payment method without modifying `PaymentProcessor`?
  * **L**iskov Substitution: Do subclasses violate parent invariants?
  * **I**nterface Segregation: Are interfaces bloated with unused methods?
  * **D**ependency Inversion: Are classes dependent on abstractions (interfaces) rather than concrete implementations?

#### Evening: Mock Interview Run-Through
* Pick one problem, set a 45-minute timer, and write out:
  1. Enums & Models
  2. Main Interfaces
  3. Core Service Implementation with Design Patterns
  4. Unit/Driver code demonstrating usage

---

## ⚡ LLD Code Template Structure (Java Example)

Keep your code organized during the interview using this modular structure:

```java
// 1. ENUMS & VALUE OBJECTS
public enum SeatStatus { AVAILABLE, BOOKED, RESERVED }
public enum VehicleType { CAR, BIKE, TRUCK }

// 2. STRATEGY INTERFACES
public interface PricingStrategy {
    double calculatePrice(long durationInHours, VehicleType type);
}

// 3. CONCRETE STRATEGIES
public class DefaultPricingStrategy implements PricingStrategy {
    @Override
    public double calculatePrice(long durationInHours, VehicleType type) {
        return durationInHours * 10.0;
    }
}

// 4. CORE ENTITIES
public class ParkingSpot {
    private final String spotId;
    private final VehicleType supportedType;
    private boolean isOccupied;

    public ParkingSpot(String spotId, VehicleType supportedType) {
        this.spotId = spotId;
        this.supportedType = supportedType;
        this.isOccupied = false;
    }

    public synchronized boolean assignVehicle(Vehicle vehicle) {
        if (isOccupied || vehicle.getType() != supportedType) {
            return false;
        }
        this.isOccupied = true;
        return true;
    }
}

// 5. SINGLETON / MAIN SERVICE
public class ParkingLotManager {
    private static ParkingLotManager instance;
    private final List<ParkingSpot> spots;
    private final PricingStrategy pricingStrategy;

    private ParkingLotManager(PricingStrategy pricingStrategy) {
        this.spots = new ArrayList<>();
        this.pricingStrategy = pricingStrategy;
    }

    public static synchronized ParkingLotManager getInstance(PricingStrategy strategy) {
        if (instance == null) {
            instance = new ParkingLotManager(strategy);
        }
        return instance;
    }
}