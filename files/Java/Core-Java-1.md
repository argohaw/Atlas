# Core Java & Fundamentals: Complete Senior Engineer Interview Blueprint

---

## 1. Java 8+ Features: Modern Functional Programming & Streams

### 1.1 Lambda Expressions & Functional Interfaces

#### Deep Dive & Explanation
Java 8 introduced Lambda Expressions to enable functional programming techniques in a object-oriented ecosystem. At its core, a Lambda expression is an anonymous function—a block of code that accepts parameters and returns a result without needing a formally declared class.

Under the hood, Java does **not** compile Lambdas into anonymous inner classes (which created separate `.class` files and heavy metadata overhead). Instead, Java utilizes the `invokedynamic` bytecode instruction introduced in Java 7. When a Lambda expression is first evaluated, the JVM uses `LambdaMetafactory` to dynamically generate a call site and bind it to a static method representing the lambda body. This results in significantly lower memory footprint and faster startup performance.

A **Functional Interface** is any interface that contains **exactly one abstract method** (SAM - Single Abstract Method). It can contain any number of `default` or `static` methods. The `@FunctionalInterface` annotation is optional but recommended as it forces the compiler to generate an error if the interface violates SAM rules.

#### Key Standard Functional Interfaces

| Interface | Method Signature | Use Case | Example |
| :--- | :--- | :--- | :--- |
| `Function<T, R>` | `R apply(T t)` | Transforming input `T` into output `R` | Mapping object `Flight` to `FlightNumber` string |
| `Predicate<T>` | `boolean test(T t)` | Filtering or evaluating conditions | Checking if `Passenger` is on `BoardingList` |
| `Consumer<T>` | `void accept(T t)` | Executing side-effects without returning data | Printing baggage logs, sending email alerts |
| `Supplier<T>` | `T get()` | Lazy evaluation or object creation | Generating UUIDs, lazy initialization |
| `BiFunction<T, U, R>` | `R apply(T t, U u)` | Combining two distinct inputs into one result | Calculating ticket price from `Distance` and `Class` |
| `UnaryOperator<T>` | `T apply(T t)` | Transformation where input and output types match | Uppercasing flight code strings |

#### Comparison: Anonymous Inner Class vs. Lambda Expression

| Feature | Anonymous Inner Class | Lambda Expression |
| :--- | :--- | :--- |
| **Bytecode Generation** | Generates a new `.class` file for every instance (e.g., `Main$1.class`). | Uses `invokedynamic`; no separate `.class` file generated. |
| **Memory Footprint** | Higher memory footprint due to class loading and instance overhead. | Low memory footprint due to JVM-level dynamic call site optimization. |
| **`this` Scope Keyword** | `this` refers to the inner class instance itself. | `this` refers to the enclosing lexical scope class. |
| **State / Scope Variable** | Can implement interfaces with multiple abstract methods. | Strictly bound to Single Abstract Method (SAM) interfaces. |

#### Real-Life Scenario & Code Example
**Airline Scenario:** An airline booking system needs to filter eligible passengers for automatic upgrade to First Class based on frequent flyer status and baggage compliance, and then send them an updated boarding pass notification.

```java
import java.util.*;
import java.util.function.*;

public class FlightUpgradeSystem {

    public static class Passenger {
        private String name;
        private String tierStatus; // "PLATINUM", "GOLD", "SILVER"
        private int checkedBags;

        public Passenger(String name, String tierStatus, int checkedBags) {
            this.name = name;
            this.tierStatus = tierStatus;
            this.checkedBags = checkedBags;
        }

        public String getName() { return name; }
        public String getTierStatus() { return tierStatus; }
        public int getCheckedBags() { return checkedBags; }

        @Override
        public String toString() {
            return "Passenger{" + "name='" + name + ''' + ", tier='" + tierStatus + ''' + '}';
        }
    }

    public static void main(String[] args) {
        List<Passenger> passengers = Arrays.asList(
            new Passenger("Sriram", "PLATINUM", 2),
            new Passenger("Ananya", "GOLD", 1),
            new Passenger("Vikram", "SILVER", 3),
            new Passenger("Priya", "PLATINUM", 1)
        );

        // Predicate: Eligible if PLATINUM status and 2 or fewer bags
        Predicate<Passenger> isEligibleForUpgrade = 
            p -> "PLATINUM".equalsIgnoreCase(p.getTierStatus()) && p.getCheckedBags() <= 2;

        // Function: Transform Passenger to Notification Message
        Function<Passenger, String> upgradeNotification = 
            p -> "Congratulations " + p.getName() + "! You have been upgraded to First Class.";

        // Consumer: Process side-effect (Send notification)
        Consumer<String> notificationSender = 
            msg -> System.out.println("[SMS ALERT] " + msg);

        // Execution
        for (Passenger p : passengers) {
            if (isEligibleForUpgrade.test(p)) {
                String message = upgradeNotification.apply(p);
                notificationSender.accept(message);
            }
        }
    }
}
```

---

### 1.2 Streams API & Pipeline Architecture

#### Deep Dive & Explanation
The `java.util.stream` package introduced in Java 8 is not a data structure; it is a view of data that allows developers to process collections of objects in a declarative, functional manner.

A Stream Pipeline consists of three distinct phases:
1. **Source Creation:** Created from collections, arrays, or I/O channels (e.g., `list.stream()`, `IntStream.range()`).
2. **Intermediate Operations:** Lazy evaluation operations that build a execution graph without executing until a terminal operation is reached. Examples include `.filter()`, `.map()`, `.flatMap()`, `.sorted()`, `.distinct()`, `.peek()`.
3. **Terminal Operations:** Triggers the pipeline execution, consumes the stream, and produces a concrete result (e.g., `.collect()`, `.forEach()`, `.reduce()`, `.count()`, `.findFirst()`). Once a terminal operation completes, the stream is consumed and cannot be reused.

#### Key Mechanics & Optimizations
* **Short-circuiting:** Operations like `.limit()`, `.findFirst()`, and `.anyMatch()` abort processing as soon as their target condition is fulfilled, avoiding unnecessary execution over remaining elements.
* **Lazy Evaluation:** Intermediate operations do not iterate over data immediately. They construct pipeline stages. Execution occurs in a single pass over the data during the terminal operation call.
* **`map` vs `flatMap`:**
  * `map(Function<T, R>)`: Performs a 1-to-1 transformation. Each element of type `T` yields one element of type `R`.
  * `flatMap(Function<T, Stream<R>>)`: Performs a 1-to-N transformation. It unpacks nested streams/collections (flattening) into a single unified stream of type `R`.

#### Parallel Streams & ForkJoinPool
When `.parallelStream()` is invoked, the processing is partitioned across worker threads using Java’s shared `ForkJoinPool.commonPool()`.
* **When to use:** CPU-intensive tasks with large datasets (> 100,000 items) and independent element operations where operations are non-blocking.
* **When to avoid:** Tasks involving shared mutable state, synchronized blocks, I/O operations (file/network calls), or small datasets where the thread management and splitting overhead outpaces sequential execution speed.

#### Real-Life Scenario & Code Example
**Airline Scenario:** An airport monitoring dashboard needs to calculate average baggage weight for all international flights across multiple airlines, flattening nested flight rosters and filtering out cancelled operations.

```java
import java.util.*;
import java.util.stream.Collectors;

public class AirportStreamAnalytics {

    public static class Luggage {
        private String tagId;
        private double weightKg;

        public Luggage(String tagId, double weightKg) {
            this.tagId = tagId;
            this.weightKg = weightKg;
        }

        public double getWeightKg() { return weightKg; }
    }

    public static class Flight {
        private String flightNumber;
        private boolean isCancelled;
        private List<Luggage> manifest;

        public Flight(String flightNumber, boolean isCancelled, List<Luggage> manifest) {
            this.flightNumber = flightNumber;
            this.isCancelled = isCancelled;
            this.manifest = manifest;
        }

        public boolean isCancelled() { return isCancelled; }
        public List<Luggage> getManifest() { return manifest; }
    }

    public static void main(String[] args) {
        Flight f1 = new Flight("AA101", false, Arrays.asList(
            new Luggage("L01", 23.5), new Luggage("L02", 18.0)
        ));
        Flight f2 = new Flight("AA202", true, Arrays.asList(
            new Luggage("L03", 30.0) // Cancelled flight - should be ignored
        ));
        Flight f3 = new Flight("AA303", false, Arrays.asList(
            new Luggage("L04", 12.5), new Luggage("L05", 25.0), new Luggage("L06", 22.0)
        ));

        List<Flight> scheduledFlights = Arrays.asList(f1, f2, f3);

        // Stream Pipeline: Calculate average weight of luggage across active flights
        double averageLuggageWeight = scheduledFlights.stream()
            .filter(flight -> !flight.isCancelled()) // Intermediate: Filter active
            .map(Flight::getManifest)               // Intermediate: Extract manifests (List<List<Luggage>>)
            .flatMap(List::stream)                  // Intermediate: Flatten to Stream<Luggage>
            .mapToDouble(Luggage::getWeightKg)      // Primitive specialization Stream<Double>
            .average()                              // Terminal operation
            .orElse(0.0);

        System.out.println("Average Active Luggage Weight: " + averageLuggageWeight + " kg");

        // Advanced Collecting: Grouping bags into heavy (>20kg) and normal (<=20kg)
        Map<Boolean, List<Luggage>> partitionedBaggage = scheduledFlights.stream()
            .filter(f -> !f.isCancelled())
            .flatMap(f -> f.getManifest().stream())
            .collect(Collectors.partitioningBy(bag -> bag.getWeightKg() > 20.0));

        System.out.println("Heavy Baggage Count (>20kg): " + partitionedBaggage.get(true).size());
        System.out.println("Normal Baggage Count (<=20kg): " + partitionedBaggage.get(false).size());
    }
}
```

---

### 1.3 `Optional` Class Architecture

#### Deep Dive & Explanation
Introduced in Java 8, `java.util.Optional<T>` is a container object that may or may not contain a non-null value. It was designed primarily as a return type for methods where returning `null` was prone to triggering a `NullPointerException` (NPE).

#### Best Practices vs. Anti-Patterns
* **DO NOT** use `Optional` as class fields, method parameters, or collection elements (it is not `Serializable` and adds overhead).
* **DO NOT** invoke `.get()` directly without checking `.isPresent()`. Doing so throws `NoSuchElementException`, defeating the purpose of using `Optional`.
* **DO** use functional methods like `.map()`, `.flatMap()`, `.filter()`, `.orElse()`, `.orElseGet()`, and `.orElseThrow()`.

#### `orElse` vs `orElseGet`
* `orElse(T other)`: Evaluates the default value **eagerly**, regardless of whether the `Optional` value is present or empty.
* `orElseGet(Supplier<? extends T> supplier)`: Evaluates the default value **lazily** using a `Supplier`. The supplier is executed **only** if the `Optional` is empty.

```java
// Anti-Pattern: Eager execution inside orElse triggers database call regardless!
String result = optionalUser.orElse(fetchUserFromDatabase()); 

// Correct Practice: Lazy execution inside orElseGet triggers DB call ONLY if empty!
String result = optionalUser.orElseGet(() -> fetchUserFromDatabase()); 
```

#### Real-Life Scenario & Code Example
**Airline Scenario:** Retrieve a passenger's frequent flyer loyalty lounge access tier given an optional ticket code and optional user profile.

```java
import java.util.Optional;

public class LoungeAccessService {

    public static class LoyaltyProfile {
        private String tier;
        public LoyaltyProfile(String tier) { this.tier = tier; }
        public String getTier() { return tier; }
    }

    public static class Customer {
        private String name;
        private LoyaltyProfile profile; // Can be null

        public Customer(String name, LoyaltyProfile profile) {
            this.name = name;
            this.profile = profile;
        }

        public Optional<LoyaltyProfile> getProfile() {
            return Optional.ofNullable(profile);
        }
    }

    public static void main(String[] args) {
        Customer VIP = new Customer("Sriram", new LoyaltyProfile("GOLD_MEDALLION"));
        Customer Regular = new Customer("John", null);

        System.out.println("VIP Access: " + getLoungeTier(Optional.of(VIP)));
        System.out.println("Regular Access: " + getLoungeTier(Optional.of(Regular)));
        System.out.println("Missing Customer Access: " + getLoungeTier(Optional.empty()));
    }

    public static String getLoungeTier(Optional<Customer> customerOptional) {
        return customerOptional
            .flatMap(Customer::getProfile)
            .map(LoyaltyProfile::getTier)
            .filter(tier -> tier.startsWith("GOLD") || tier.startsWith("PLATINUM"))
            .orElse("STANDARD_LOUNGE_ACCESS");
    }
}
```

---

## 2. Multithreading & Concurrency

### 2.1 Thread Lifecycle & Thread Management

#### Deep Dive & Explanation
A thread in Java represents an independent path of execution managed by the operating system scheduler via the JVM.

```
       [ NEW ] 
          |  start()
          v
    [ RUNNABLE ] <======> [ RUNNING ] (OS Scheduler dependent)
     /    |        /     |     \  waiting / sleeping / blocked
   v      v      v
[BLOCKED] [WAITING] [TIMED_WAITING]
   \      |      /
    \     |     /  lock acquired / notified / time elapsed
     v    v    v
    [ RUNNABLE ]
          |
          |  run() completes or exception occurs
          v
    [ TERMINATED ]
```

#### Thread States
1. **NEW:** Created via `new Thread()`, but `start()` has not yet been executed.
2. **RUNNABLE:** Ready to run or currently running in the JVM, waiting for OS processor allocation.
3. **BLOCKED:** Waiting to acquire a monitor lock (entering a `synchronized` block/method).
4. **WAITING:** Waiting indefinitely for another thread to perform a specific action (via `Object.wait()`, `Thread.join()`, or `LockSupport.park()`).
5. **TIMED_WAITING:** Waiting for a specified time period (via `Thread.sleep(ms)`, `Object.wait(ms)`, or `Thread.join(ms)`).
6. **TERMINATED:** Completed execution of `run()` or exited due to an unhandled exception.

#### Implementation Approaches
* **Extending `Thread`:** Restricts inheritance (Java does not support multiple inheritance).
* **Implementing `Runnable`:** Separates task execution logic from thread instantiation. Standard for task execution.
* **Implementing `Callable<V>`:** Similar to `Runnable`, but can return a value (`V`) and throw checked exceptions.

---

### 2.2 Thread Synchronization, Locks & Visibility (`volatile`)

#### Synchronization (`synchronized` vs `ReentrantLock`)
* `synchronized`: Intrinsic lock built into Java language syntax. Automatically acquires and releases the monitor lock on an object/class. Non-fair by default, and does not support interruptible lock acquisition or timed lock acquisition attempts.
* `ReentrantLock`: Programmatic lock implementation in `java.util.concurrent.locks`. Offers enhanced capabilities:
  * **Fairness Policy:** Options to assign locks to the longest-waiting thread (`new ReentrantLock(true)`).
  * **Non-blocking lock acquisition:** `tryLock()` attempts to acquire a lock without blocking indefinitely.
  * **Interruptible locking:** `lockInterruptibly()` allows a thread to break out when interrupted.

#### Memory Visibility & `volatile`
In multi-core CPU architectures, each core maintains local L1/L2 hardware caches. When a thread writes to a variable, the change might reside in CPU cache memory before flushing to main memory (RAM).

The `volatile` keyword guarantees:
1. **Visibility:** Writes to a `volatile` variable are immediately flushed to main memory, and reads are always pulled from main memory.
2. **Instruction Reordering Protection (Happens-Before Relationship):** Prevents the compiler and processor from reordering read/write instructions around the `volatile` variable.

*Crucial Limitation:* `volatile` guarantees **visibility**, but it does **NOT** guarantee **atomicity**. Operations like `count++` (which consist of read, modify, and write steps) are not atomic and require `AtomicInteger` or explicit synchronization.

#### Real-Life Scenario & Code Example
**Airline Flight Booking Seat Reservation System:** Multiple customers attempting to book the last remaining seat concurrently require thread-safe reservation to prevent double-booking.

```java
import java.util.concurrent.locks.ReentrantLock;

public class SeatBookingSystem {

    public static class FlightSeat {
        private final String seatNumber;
        private boolean isBooked = false;
        private final ReentrantLock lock = new ReentrantLock(true); // Fair lock policy

        public FlightSeat(String seatNumber) {
            this.seatNumber = seatNumber;
        }

        public boolean reserveSeat(String passengerName) {
            // Attempt non-blocking reservation attempt
            System.out.println(passengerName + " attempting to lock seat " + seatNumber + "...");
            
            lock.lock(); // Acquire reentrant lock
            try {
                if (!isBooked) {
                    // Simulate system validation delay
                    Thread.sleep(100);
                    isBooked = true;
                    System.out.println("SUCCESS: Seat " + seatNumber + " successfully assigned to " + passengerName);
                    return true;
                } else {
                    System.out.println("FAILED: Seat " + seatNumber + " is already reserved. Request for " + passengerName + " declined.");
                    return false;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            } finally {
                lock.unlock(); // Ensure lock release inside finally block!
            }
        }
    }

    public static void main(String[] args) {
        FlightSeat seatA1 = new FlightSeat("12A");

        Runnable task1 = () -> seatA1.reserveSeat("Passenger-Sriram");
        Runnable task2 = () -> seatA1.reserveSeat("Passenger-John");
        Runnable task3 = () -> seatA1.reserveSeat("Passenger-Anita");

        // Concurrent booking attempts
        new Thread(task1).start();
        new Thread(task2).start();
        new Thread(task3).start();
    }
}
```

---

### 2.3 Executor Framework & ThreadPool Management

#### Deep Dive & Explanation
Creating raw Java threads (`new Thread()`) incurs high OS-level system overhead due to stack allocation and native thread management. The `java.util.concurrent.ExecutorService` architecture decoupling task submission from thread management via managed thread pools.

#### Core ThreadPoolExecutor Parameters
`ThreadPoolExecutor(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue, threadFactory, handler)`

1. **`corePoolSize`:** The minimum number of worker threads kept alive, even if idle.
2. **`maximumPoolSize`:** The upper limit of threads allowed in the pool.
3. **`workQueue`:** A `BlockingQueue` storing tasks waiting for thread availability (e.g., `ArrayBlockingQueue`, `LinkedBlockingQueue`).
4. **`keepAliveTime`:** Duration non-core idle threads wait before terminating.
5. **`RejectedExecutionHandler`:** Policy invoked when queue capacity is full and `maximumPoolSize` is reached:
   * `AbortPolicy` (Default): Throws `RejectedExecutionException`.
   * `CallerRunsPolicy`: Executes task directly on caller's thread, slowing task submission rate.
   * `DiscardPolicy`: Silently drops the rejected task.
   * `DiscardOldestPolicy`: Drops the oldest unhandled task in queue and retries task submission.

#### Factory Thread Pools (`Executors`)

| Pool Factory Method | Work Queue Type | Usage Recommendation |
| :--- | :--- | :--- |
| `Executors.newFixedThreadPool(n)` | Unbounded `LinkedBlockingQueue` | Known stable concurrency loads. *Risk: OutOfMemoryError if task queue grows infinitely.* |
| `Executors.newCachedThreadPool()` | `SynchronousQueue` (0 capacity) | Short-lived asynchronous tasks with dynamic traffic spikes. |
| `Executors.newSingleThreadExecutor()` | Unbounded `LinkedBlockingQueue` | Sequential task ordering guarantee. |
| `Executors.newScheduledThreadPool(n)` | `DelayedWorkQueue` | Periodically executing background tasks or scheduled timeouts. |

---

### 2.4 Asynchronous Programming with `CompletableFuture`

#### Deep Dive & Explanation
Introduced in Java 8, `CompletableFuture<T>` implements both `Future<T>` and `CompletionStage<T>`. It resolves limitations of legacy `Future` objects (which required blocking `.get()` calls to check results). `CompletableFuture` allows non-blocking asynchronous pipeline chaining, exception handling, and combining multiple concurrent tasks.

#### Essential Methods
* `supplyAsync(Supplier<U>)`: Runs asynchronous tasks returning a result using `ForkJoinPool.commonPool()` or custom `Executor`.
* `thenApply(Function)`: Transforms output of a stage (equivalent to `map`).
* `thenCompose(Function)`: Flattens and chains dependent async stages (equivalent to `flatMap`).
* `thenCombine(CompletionStage, BiFunction)`: Executes two independent futures concurrently and combines their results once both complete.
* `allOf(CompletableFuture...)`: Waits for all supplied futures to finish execution.
* `exceptionally(Function)`: Catches exceptions in the pipeline and provides fallback recovery data.

#### Real-Life Scenario & Code Example
**Airline Flight Price Aggregator System:** Query ticket pricing concurrently from multiple external partner services (e.g., American Airlines, British Airways, Qatar Airways), aggregate results, and select the lowest price without blocking the thread.

```java
import java.util.concurrent.*;
import java.util.*;

public class FlightPriceAggregator {

    private static final ExecutorService customPool = Executors.newFixedThreadPool(10);

    public static CompletableFuture<Double> fetchPriceFromPartner(String partnerName, double basePrice) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // Simulate network latency delay
                long latency = (long) (Math.random() * 800 + 200);
                Thread.sleep(latency);
                System.out.println("Received response from " + partnerName + " in " + latency + "ms");
                return basePrice + (Math.random() * 50);
            } catch (InterruptedException e) {
                throw new IllegalStateException("API fetch failed for " + partnerName, e);
            }
        }, customPool);
    }

    public static void main(String[] args) throws Exception {
        System.out.println("Initiating concurrent flight pricing lookup...");

        CompletableFuture<Double> partnerA = fetchPriceFromPartner("Partner American", 350.00);
        CompletableFuture<Double> partnerB = fetchPriceFromPartner("Partner British", 340.00);
        CompletableFuture<Double> partnerC = fetchPriceFromPartner("Partner Qatar", 360.00);

        // Combine all async tasks
        CompletableFuture<Void> allPricesFuture = CompletableFuture.allOf(partnerA, partnerB, partnerC);

        // Processing combined result asynchronously
        CompletableFuture<Double> cheapestPriceFuture = allPricesFuture.thenApply(v -> {
            try {
                double p1 = partnerA.get();
                double p2 = partnerB.get();
                double p3 = partnerC.get();
                return Math.min(p1, Math.min(p2, p3));
            } catch (Exception e) {
                throw new RuntimeException("Error computing price aggregation", e);
            }
        }).exceptionally(ex -> {
            System.err.println("Fallback triggered due to error: " + ex.getMessage());
            return 500.00; // Default fallback flight price
        });

        System.out.println("Cheapest Flight Price Found: $" + String.format("%.2f", cheapestPriceFuture.get()));

        customPool.shutdown();
    }
}
```

---

## 3. Java Collections Framework

### 3.1 `HashMap` Internal Architecture Deep Dive

#### Deep Dive & Explanation
`HashMap<K,V>` is an un-synchronized key-value associative data structure that permits one `null` key and multiple `null` values.

#### Storage Architecture & Mechanics
Underlying representation is an array of Nodes/Buckets: `Node<K,V>[] table`.

```
HashMap Bucket Array:
Index [0] -> null
Index [1] -> Node(Hash, Key1, Val1) -> Node(Hash, Key2, Val2) -> null (Linked List Collision)
Index [2] -> TreeNode(Root) [Red-Black Tree, size >= 8]
Index [3] -> null
```

1. **Hash Code Calculation & High-Bit Spreading:**
   When `map.put(key, value)` is called, Java calculates an optimized hash code to minimize collisions:
   ```java
   static final int hash(Object key) {
       int h;
       return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
   }
   ```
   *Explanation:* The XOR `^` operation mixes high-order 16 bits with low-order 16 bits to distribute hashes across smaller array capacities.

2. **Bucket Index Determination:**
   `index = (n - 1) & hash` (Where `n` is array length, enforced to always be a power of 2, allowing bitwise AND bit-masking equivalent to modulo `% n`).

3. **Collision Handling & Java 8 Treeification:**
   * **Collision:** Occurs when two distinct keys yield identical bucket indices.
   * Prior to Java 8, collisions were stored in a singly Linked List (O(N) search time in worst case).
   * **Java 8+ Optimization:** When a single bucket list length reaches `TREEIFY_THRESHOLD = 8` AND the total table array capacity is at least `MIN_TREEIFY_CAPACITY = 64`, the bucket transforms from a Singly Linked List into a Balanced **Red-Black Tree**. Search time drops from **O(N)** to **O(log N)**.
   * If entries drop to `UNTREEIFY_THRESHOLD = 6` during dynamic removals, the tree reverts back to a Linked List.

4. **Load Factor & Resizing:**
   * **Default Initial Capacity:** 16
   * **Default Load Factor:** 0.75
   * **Threshold = Capacity × Load Factor** (e.g., $16 	imes 0.75 = 12$).
   * When element size exceeds threshold, table capacity doubles ($16 	o 32 	o 64$), and all entries are rehashed/re-indexed.

---

### 3.2 Concurrent Collections: `ConcurrentHashMap` vs `Collections.synchronizedMap` vs `Hashtable`

#### Deep Dive & Explanation

```
Hashtable / SynchronizedMap:
[ Lock Entire Map ] -> Thread 1 works -> Thread 2 BLOCKED

ConcurrentHashMap (Java 8+):
[ Bucket 0 ] [ Bucket 1 (CAS Lock) ] [ Bucket 2 ] [ Bucket 3 (synchronized node) ]
Thread 1 updates Bucket 1  |  Thread 2 simultaneously updates Bucket 3!
```

#### Detailed Comparison

| Feature | `Hashtable` | `Collections.synchronizedMap()` | `ConcurrentHashMap` |
| :--- | :--- | :--- | :--- |
| **Locking Granularity** | Global lock on entire object table. | Global wrapper lock on backing Map instance object. | Fine-grained lock at bucket node level (Java 8+). |
| **Java 8+ Locking Mechanism** | Methods marked `synchronized`. | Uses `synchronized(mutex)` block wrappers. | Uses **CAS (Compare-And-Swap)** for empty bucket insertions and `synchronized` on individual head nodes for collisions. |
| **Null Key/Value Rules** | Disallows `null` keys or values. | Allows `null` key and values (if underlying map permits). | Disallows `null` keys or values (avoids ambiguity in concurrent reads). |
| **Read Operations** | Thread-safe, but blocked by concurrent writes. | Thread-safe, but blocked by concurrent writes. | **Non-blocking lock-free reads** (volatile entry pointers). |
| **Iterator Behavior** | Fail-fast (`ConcurrentModificationException`). | Fail-fast. | **Weakly Consistent Iterator** (reflects state at creation without throwing exceptions). |

#### Real-Life Scenario & Code Example
**Flight Telemetry Tracking:** Thousands of aircraft continuously stream concurrent altitude and location updates. `ConcurrentHashMap` allows concurrent writes to different flight entries without global map locks.

```java
import java.util.concurrent.ConcurrentHashMap;

public class FlightTracker {

    public static class Location {
        public double lat, lon;
        public Location(double lat, double lon) { this.lat = lat; this.lon = lon; }
        @Override
        public String toString() { return "[" + lat + ", " + lon + "]"; }
    }

    public static void main(String[] args) {
        ConcurrentHashMap<String, Location> liveFlightPositions = new ConcurrentHashMap<>();

        // Thread-safe atomic insertion/update using computeIfPresent / putIfAbsent
        liveFlightPositions.put("AA100", new Location(32.7767, -96.7970)); // Dallas

        // Atomic update without explicit synchronization blocks
        liveFlightPositions.compute("AA100", (flightId, currentLoc) -> {
            if (currentLoc == null) return new Location(0, 0);
            return new Location(currentLoc.lat + 0.05, currentLoc.lon + 0.08); // Simulate movement
        });

        System.out.println("Updated Position for AA100: " + liveFlightPositions.get("AA100"));
    }
}
```

---

### 3.3 Custom `Equals` & `HashCode` Contract

#### Deep Dive & Explanation
Whenever overriding `equals(Object o)`, a developer **MUST** override `hashCode()` to satisfy Java's contract:

1. **Consistency:** Multiple invocations of `hashCode()` on the same object during execution must yield the same integer result, provided no fields evaluated in `equals` are modified.
2. **Equality Implication:** If `objectA.equals(objectB)` evaluates to `true`, then `objectA.hashCode() == objectB.hashCode()` **MUST** be `true`.
3. **Inequality Non-Implication:** If `objectA.hashCode() == objectB.hashCode()`, it does **NOT** require `objectA.equals(objectB)` to be `true` (this condition is a hash collision).

#### Violation Consequence
If `hashCode()` is not overridden properly, two logically equal objects (according to `equals()`) will return different hash values. If added to a `HashMap` or `HashSet`, the second object will be placed in a different bucket array index, making lookup operations fail and creating memory leaks.

#### Code Example: Custom Key Implementation
```java
import java.util.*;

public class BaggageTag {
    private final String barcode;
    private final String flightCode;

    public BaggageTag(String barcode, String flightCode) {
        this.barcode = barcode;
        this.flightCode = flightCode;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true; // Identity check
        if (o == null || getClass() != o.getClass()) return false; // Type check
        BaggageTag tag = (BaggageTag) o;
        return Objects.equals(barcode, tag.barcode) &&
               Objects.equals(flightCode, tag.flightCode);
    }

    @Override
    public int hashCode() {
        // Generates hash code based on equality fields using prime multiplier (31)
        return Objects.hash(barcode, flightCode);
    }

    public static void main(String[] args) {
        Map<BaggageTag, String> luggageLocationMap = new HashMap<>();

        BaggageTag tag1 = new BaggageTag("BAG-9921", "AA505");
        BaggageTag tag2 = new BaggageTag("BAG-9921", "AA505"); // Distinct instance, identical logic

        luggageLocationMap.put(tag1, "Baggage Carousel 4");

        // Lookup using tag2 works ONLY because equals & hashCode contracts are met!
        System.out.println("Luggage Tag 2 Location: " + luggageLocationMap.get(tag2));
    }
}
```

---

## 4. JVM Architecture & Memory Management

### 4.1 JVM Memory Layout: Heap vs Stack

#### Structural Breakdown

```
+-------------------------------------------------------------------+
|                        JVM MEMORY STRUCTURE                       |
+-------------------------------------------------------------------+
|  [ PER-THREAD STACK MEMORY ]       |  [ HEAP MEMORY (SHARED) ]    |
|  - Frame: Method local variables   |  +------------------------+  |
|  - Frame: Primitive data types     |  | Young Generation       |  |
|  - Frame: Object reference pointers|  | - Eden Space           |  |
|                                    |  | - Survivor S0 / S1     |  |
|                                    |  +------------------------+  |
|                                    |  | Tenured / Old Gen      |  |
|                                    |  +------------------------+  |
|                                    |                              |
|                                    |  [ METASPACE (OFF-HEAP) ]   |
|                                    |  - Class Metadata        |  |
|                                    |  - Method Bytecode       |  |
+-------------------------------------------------------------------+
```

#### Detailed Component Comparison

| Memory Region | Lifecycle | Stored Content | Thread Safety | Error Type |
| :--- | :--- | :--- | :--- | :--- |
| **Stack Memory** | Destroyed when method frame execution finishes. | Local primitive variables (`int`, `boolean`), object reference addresses. | Intrinsic per-thread isolation (Thread-Safe). | `java.lang.StackOverflowError` |
| **Heap Memory** | Persists until reclaimed by Garbage Collector. | All object instances (`new Passenger()`), instance field data, primitive/object arrays. | Shared across all application threads. | `java.lang.OutOfMemoryError: Java heap space` |
| **Metaspace (Java 8+)** | Persists while classloader remains active. | Runtime class metadata, method definitions, constant pools. Uses native RAM. | Shared across application threads. | `java.lang.OutOfMemoryError: Metaspace` |

---

### 4.2 Garbage Collection Mechanics & Algorithms

#### Deep Dive & Explanation
Garbage Collection (GC) automates memory deallocation by identifying and removing unreachable objects from the JVM Heap.

#### Generational Garbage Collection Hypothesis
1. Most created objects become unreachable shortly after instantiation (e.g., short-lived variables in method scopes).
2. Objects that survive multiple garbage collection cycles tend to remain active for a long time.

#### Memory Generations & Progression Lifecycle
1. **Eden Space (Young Gen):** All newly instantiated objects are allocated here first.
2. **Survivor Spaces S0 & S1 (Young Gen):** Minor GC sweeps Eden. Live objects are copied to one of the Survivor spaces with an increased age counter (tenure threshold). One Survivor space always remains empty as a target buffer.
3. **Tenured / Old Generation:** Objects that survive a configured number of Minor GC cycles (default threshold: 15 iterations) are promoted to Old Generation.
4. **Major / Full GC:** Cleans Old Generation space. A Full GC stops all application threads (**Stop-The-World (STW)** event).

#### Garbage Collection Collectors Comparison

| Collector Name | Architecture Focus | Mechanism Features | Recommended Use Case |
| :--- | :--- | :--- | :--- |
| **G1 GC (Garbage-First)** | High throughput with bounded target latency pauses. | Divides Heap into equal-sized independent regions (~1MB-32MB). Collects regions with the highest amount of freeable garbage first. | Multi-core servers with large Heap sizes (> 4GB - 32GB+). Default in JDK 9+. |
| **ZGC (Z Garbage Collector)** | Ultra-low latency (< 1ms pause times). | Scalable low-latency collector using colored object pointers and load barriers. | Large scale applications with massive heaps (GBs to Terabytes) where low latency is critical. |
| **Shenandoah** | Low pause times independent of heap volume size. | Performs concurrent compaction in parallel with running application threads. | Applications prioritizing low pause times over raw throughput. |

---

### 4.3 Memory Leak Diagnosis & Optimization Strategy

#### Common Causes of Java Memory Leaks
1. **Unclosed Static Collections:** Static fields persist for the lifetime of the JVM classloader; adding objects continuously to static maps/lists prevents GC.
2. **Unregistered Event Listeners / Callbacks:** Objects registered with publishers without explicit unregister/removal handlers.
3. **Overridden `equals`/`hashCode` Omission in Keys:** Adding custom key objects continuously without `hashCode` overrides prevents lookup and deletion.
4. **Unclosed ThreadLocal State:** Long-running application server thread pools (e.g., Tomcat) retaining unbounded `ThreadLocal` context variables.

#### Professional Diagnostic Workflow
1. **Generate Heap Dumps:**
   Extract heap memory state during OOM events using flag:
   `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/logs/java_heapdump.hprof`
2. **Profile with Diagnostics Tools:**
   Analyze heap dump files using **Eclipse Memory Analyzer Tool (MAT)**, **VisualVM**, or **JProfiler**.
3. **Identify Leak Suspects:**
   Inspect "Dominator Tree" views to locate objects retaining the largest total byte count via GC Roots pathways.

---

## 5. Senior Technical Interview QA (Targeted Scenarios)

### Q1: How does Java 8+ optimize `HashMap` collision resolution, and why was a Red-Black Tree selected over a Binary Search Tree?

**Answer:**
Prior to Java 8, `HashMap` bucket collisions were managed using singly Linked Lists. In worst-case scenarios—such as malicious hash attacks or poor `hashCode()` implementations generating identical indices—all elements ended up in a single bucket, degrading search lookup performance from **O(1)** to **O(N)**.

In Java 8+, when a bucket array size reaches at least 64 and a single bucket list length exceeds 8, the bucket converts into a **Red-Black Tree**. Red-Black Trees are self-balancing binary search trees that guarantee **O(log N)** search, insertion, and deletion complexity even in worst-case scenarios. 

A self-balancing Red-Black Tree was selected over a standard Binary Search Tree (BST) because a standard BST can degenerate into a linear linked list (O(N)) if elements are inserted in sorted order. Red-Black trees enforce structural invariants via node colorings (Red/Black) and dynamic tree rotations, guaranteeing bounded tree depth ($2 \log(N + 1)$).

---

### Q2: Explain the "Happens-Before" guarantee in the Java Memory Model and how `volatile` enforces it.

**Answer:**
The **Happens-Before** relation is a formal guarantee in the Java Memory Model (JMM) ensuring that memory writes performed by one thread are guaranteed to be visible to reads performed by another thread.

When a field variable is declared `volatile`:
1. **Write Visibility:** A write to a `volatile` variable *happens-before* every subsequent read of that same `volatile` variable.
2. **Instruction Reordering Barriers:** The JVM inserts hardware memory barriers (fences):
   * A **StoreStore / StoreLoad barrier** prevents memory writes preceding the volatile write from being reordered *after* it.
   * A **LoadLoad / LoadStore barrier** prevents memory reads following the volatile read from being reordered *before* it.

This guarantees that all state changes made by Thread A prior to writing a `volatile` flag are visible to Thread B as soon as it reads that same `volatile` flag.

---

### Q3: What happens if an exception is thrown inside a `CompletableFuture` stage pipeline? How do `.exceptionally()`, `.handle()`, and `.whenComplete()` differ?

**Answer:**
When an unhandled exception occurs in a `CompletableFuture` pipeline stage, the future completes exceptionally, skipping downstream standard processing stages (`thenApply`, `thenAccept`) until an exception-handling stage is encountered.

* **`.exceptionally(Function<Throwable, T>)`:**
  Acts like a standard `catch` block. Triggers **only** if an exception occurred in an earlier stage. Converts the exception into a fallback return value of type `T`, allowing the pipeline to recover and resume normal processing.
  
* **`.handle(BiFunction<T, Throwable, U>)`:**
  Executes **always**, regardless of whether an exception occurred or the stage succeeded. It accepts both result `T` and exception `Throwable` (one will be `null`), returning a transformed output `U`.

* **`.whenComplete(BiConsumer<T, Throwable>)`:**
  Acts like a telemetry or monitoring block (similar to `finally`). It consumes the result and exception for side-effects (e.g., logging) without modifying the payload or pipeline return type.

---

### Q4: Why is it an anti-pattern to use `Executors.newFixedThreadPool()` or `Executors.newCachedThreadPool()` in mission-critical microservice environments?

**Answer:**
Both factory approaches create risks of `OutOfMemoryError` (OOM) under high concurrent traffic spikes:

1. **`newFixedThreadPool(n)`:**
   Uses an unbounded `LinkedBlockingQueue` (capacity $2^{31}-1$). Under heavy load, if incoming requests outpace processing capacity, tasks queue up infinitely, consuming Heap memory until an `OutOfMemoryError: Java heap space` crash occurs.

2. **`newCachedThreadPool()`:**
   Uses a `SynchronousQueue` with an unbounded maximum thread count (`Integer.MAX_VALUE`). If incoming request velocity spikes, the executor continuously creates new native threads. Each Java thread allocates OS stack memory (typically 1MB per thread), exhausting system resources and throwing `java.lang.OutOfMemoryError: unable to create new native thread`.

**Best Practice:** Explicitly instantiate `ThreadPoolExecutor` with a bounded work queue (e.g., `ArrayBlockingQueue`), a bounded `maximumPoolSize`, and an appropriate `RejectedExecutionHandler` (e.g., `CallerRunsPolicy`).
