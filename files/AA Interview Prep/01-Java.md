# 3. Java

# 3.1 OOP

## Encapsulation

Encapsulation means bundling state and behavior together and controlling direct access to internal state.

```java
public class Account {
    private BigDecimal balance;

    public void deposit(BigDecimal amount) {
        if (amount.signum() <= 0) {
            throw new IllegalArgumentException();
        }
        balance = balance.add(amount);
    }

    public BigDecimal getBalance() {
        return balance;
    }
}
```

The important point is not simply "private variables and getters/setters."

A strong explanation:

> Encapsulation protects object invariants. Instead of allowing any caller to directly modify balance, the object controls how state changes and can validate business rules.

---

## Abstraction

Expose what the caller needs while hiding unnecessary implementation details.

```java
public interface PaymentProcessor {
    PaymentResult process(PaymentRequest request);
}
```

The caller depends on the contract, not whether the implementation uses a REST API, Kafka, or another payment provider.

---

## Inheritance

Inheritance models an **is-a** relationship.

Use carefully.

Prefer composition when inheritance does not represent a genuine specialization.

Bad example:

```text
Car extends Engine
```

A car **has an** engine.

Better:

```java
class Car {
    private final Engine engine;
}
```

### Interview point

> Prefer composition over inheritance when behavior can be delegated and tight coupling to a superclass is unnecessary.

---

## Polymorphism

One interface can have multiple implementations.

```java
PaymentProcessor processor = new CardPaymentProcessor();
processor.process(request);
```

Runtime polymorphism occurs when the actual implementation is selected dynamically.

---

# 3.2 Interface vs Abstract Class

## Interface

Use when defining a contract/capability.

```java
public interface NotificationSender {
    void send(Notification notification);
}
```

A class can implement multiple interfaces.

## Abstract class

Use when implementations share state or common behavior.

```java
public abstract class BaseProcessor {
    protected final Logger logger;

    protected BaseProcessor(Logger logger) {
        this.logger = logger;
    }

    public abstract void process();
}
```

### Strong answer

> Use an interface when I primarily need a contract and multiple independent implementations. Use an abstract class when related implementations need shared state or behavior. I usually avoid forcing inheritance just for code reuse.

---

# 3.3 equals() and hashCode()

This is a critical Java topic.

`equals()` determines logical equality.

`hashCode()` produces an integer used by hash-based collections.

Contract:

```text
If a.equals(b) is true,
then a.hashCode() must equal b.hashCode().
```

The reverse is not required.

Two objects can have the same hash code but not be equal.

## Why?

HashMap first uses hashing to find the likely bucket, then uses equality to identify the exact key.

If you override `equals()` without overriding `hashCode()`, logically equal objects may be placed or searched in different buckets.

### Interview answer

> Hash code is used for efficient lookup, while equals confirms actual logical equality. Hash collisions are possible, so equal hash codes alone do not mean objects are equal.

---

# 3.4 HashMap Internals

Conceptually:

```text
key
 ↓
hashCode()
 ↓
hash spreading
 ↓
bucket index
 ↓
bucket lookup
 ↓
equals()
 ↓
value
```

Important concepts:

- Bucket array
- Hash calculation
- Collision
- Linked structure / tree structure for heavy collisions
- Load factor
- Resizing
- Capacity

Average lookup is generally close to O(1), assuming good hash distribution.

Worst-case behavior can degrade because collisions cause more comparisons.

Modern Java implementations can convert sufficiently collision-heavy buckets into tree structures under specific conditions.

### Common question: What happens when two keys have the same hash?

They can land in the same bucket. HashMap compares keys using `equals()` to determine whether the existing key matches or whether a separate entry is needed.

### Common question: Why is a mutable key dangerous?

If fields used by `hashCode()` or `equals()` change after insertion, the object may no longer be found in the bucket calculated using its new state.

Therefore, immutable keys are preferred.

---

# 3.5 HashMap vs ConcurrentHashMap

## HashMap

- Not thread-safe
- Concurrent modification can produce incorrect behavior
- Best for single-threaded or externally synchronized usage

## ConcurrentHashMap

- Designed for concurrent access
- Uses finer-grained concurrency techniques rather than synchronizing every operation globally
- Does not allow null keys or null values

### Strong interview answer

> I use ConcurrentHashMap when multiple threads need safe concurrent access. I do not simply wrap every map in synchronization because that can unnecessarily reduce concurrency.

---

# 3.6 ArrayList vs LinkedList

## ArrayList

Backed by a resizable array.

Good for:

- Random access
- Iteration
- Appending

Insertion/removal in the middle can require shifting elements.

## LinkedList

Nodes point to neighboring nodes.

Conceptually:

```text
A <-> B <-> C
```

Can be useful when inserting/removing nodes after the location is already known.

But random access requires traversal.

### Practical answer

> In most modern application code, ArrayList is usually the default choice. LinkedList is not automatically better simply because it has theoretically cheap insertion; finding the insertion point can itself be expensive and object/node overhead also matters.

---

# 3.7 Comparable vs Comparator

## Comparable

Natural ordering defined by the class.

```java
class Employee implements Comparable<Employee> {
    @Override
    public int compareTo(Employee other) {
        return this.id.compareTo(other.id);
    }
}
```

## Comparator

External/custom ordering.

```java
employees.sort(
    Comparator.comparing(Employee::getName)
              .thenComparing(Employee::getId)
);
```

Use Comparator when multiple orderings are required.

---

# 3.8 Generics

Generics provide compile-time type safety.

```java
List<String> names = new ArrayList<>();
```

Avoids unnecessary casts and catches type errors earlier.

## PECS

A useful rule:

> Producer Extends, Consumer Super.

```java
List<? extends Number>
```

Use when reading numbers from a producer.

```java
List<? super Integer>
```

Use when adding Integers to a consumer.

You do not need to become a generics language-lawyer, but understand why wildcards exist.

---

# 3.9 Exception Handling

Know:

- Checked exceptions
- Unchecked exceptions
- Error
- `try/catch/finally`
- `throw`
- `throws`
- Custom exceptions

### Checked exception

The compiler requires handling or declaration.

### Unchecked exception

Subclass of `RuntimeException`.

Usually represents programming errors or invalid state that callers are not necessarily expected to recover from.

### Important interview point

Do not catch `Exception` everywhere and silently log it.

A good approach:

- Catch exceptions where meaningful recovery or translation is possible.
- Preserve useful context.
- Avoid exposing internal exception details to API consumers.

---

# 3.10 Java Streams

Know:

- `filter`
- `map`
- `flatMap`
- `sorted`
- `distinct`
- `limit`
- `collect`
- `reduce`
- `groupingBy`
- `partitioningBy`

Example:

```java
Map<String, List<Employee>> byDepartment =
    employees.stream()
        .collect(Collectors.groupingBy(Employee::getDepartment));
```

## map vs flatMap

`map` transforms one element into one resulting element.

`flatMap` transforms one element into a stream/collection and flattens the results.

Example:

```java
List<String> tags =
    orders.stream()
        .flatMap(order -> order.getTags().stream())
        .toList();
```

---

# 3.11 Optional

Optional represents an explicitly optional result.

Good example:

```java
Optional<User> findById(UUID id);
```

Avoid using it as a replacement for every nullable field or as a method parameter in typical application code.

## Important

Do not write:

```java
if (optional.isPresent()) {
    ...
}
```

everywhere when functional alternatives are clearer.

Know:

- `map`
- `flatMap`
- `filter`
- `orElse`
- `orElseGet`
- `orElseThrow`

### orElse vs orElseGet

`orElse()` evaluates its argument eagerly.

`orElseGet()` evaluates the supplier only when needed.

---

# 3.12 Functional Interfaces

Common examples:

- `Predicate<T>`
- `Function<T, R>`
- `Consumer<T>`
- `Supplier<T>`

```text
Predicate → T -> boolean
Function  → T -> R
Consumer  → T -> void
Supplier  → () -> T
```

---

# 3.13 Concurrency

## Race Condition

Occurs when multiple threads access and modify shared state and the result depends on timing.

Example:

```text
balance = 100

Thread A reads 100
Thread B reads 100

A writes 110
B writes 120

Expected? 130
Actual?   120
```

---

## synchronized

Provides mutual exclusion around a critical section and establishes visibility guarantees.

```java
public synchronized void increment() {
    count++;
}
```

Only one thread can execute the synchronized critical section for the relevant monitor at a time.

---

## volatile

Ensures visibility of writes between threads.

It does **not** make compound operations atomic.

```java
volatile boolean running = true;
```

Suitable for flags.

Not sufficient for:

```java
count++;
```

because increment involves multiple operations.

### Classic answer

> volatile is primarily about visibility and ordering guarantees, while synchronized provides mutual exclusion as well as visibility.

---

## Atomic Classes

Examples:

- `AtomicInteger`
- `AtomicLong`
- `AtomicReference`

Useful for certain atomic operations without manually using synchronized blocks.

```java
counter.incrementAndGet();
```

---

## synchronized vs ReentrantLock

ReentrantLock can provide additional features such as:

- Try-lock behavior
- Interruptible locking
- Explicit lock/unlock
- Multiple conditions

But always ensure unlock occurs reliably:

```java
lock.lock();
try {
    // critical section
} finally {
    lock.unlock();
}
```

---

# 3.14 ExecutorService

Avoid manually creating uncontrolled threads for routine server work.

Use executors to manage thread pools.

```java
ExecutorService executor =
    Executors.newFixedThreadPool(10);
```

Benefits:

- Controlled concurrency
- Thread reuse
- Queueing
- Resource management

### Production consideration

Thread pool sizing depends on workload.

- CPU-bound workloads often benefit from a number of threads related to available CPU cores.
- I/O-bound workloads may tolerate more concurrency because threads spend time waiting.

There is no universal magic number.

---

# 3.15 CompletableFuture

Useful for asynchronous workflows.

```java
CompletableFuture<User> userFuture =
    CompletableFuture.supplyAsync(() -> userClient.getUser(id));

CompletableFuture<Account> accountFuture =
    CompletableFuture.supplyAsync(() -> accountClient.getAccount(id));
```

Combine independent operations:

```java
userFuture.thenCombine(
    accountFuture,
    (user, account) -> new Profile(user, account)
);
```

Know:

- `thenApply`
- `thenCompose`
- `thenCombine`
- `exceptionally`
- `handle`
- `allOf`

### Important distinction

`thenApply` transforms a result.

`thenCompose` is used when the transformation itself returns another CompletableFuture and you want to avoid nested futures.

---

# 3.16 Deadlock

A common situation:

```text
Thread A:
Lock 1 → waits for Lock 2

Thread B:
Lock 2 → waits for Lock 1
```

Both wait indefinitely.

Typical prevention techniques:

- Consistent lock ordering
- Minimize nested locks
- Use timeouts/tryLock where appropriate
- Reduce shared mutable state

---

# 3.17 JVM Memory

High-level model:

```text
Thread Stack                    Heap
------------                   --------
method frames                  objects
local variables                instance data
references                     arrays
                               shared objects
```

Also know Metaspace stores class metadata in modern JVM implementations.

Do not claim:

> "Stack stores primitives and heap stores objects."

That is an oversimplification. Local variables and references are associated with stack frames, while objects are generally allocated on the heap, but JVM implementation optimizations exist.

---

# 3.18 OutOfMemoryError vs StackOverflowError

## OutOfMemoryError

The JVM cannot allocate required memory/resources.

Potential causes:

- Heap exhaustion
- Memory leak
- Excessive caching
- Very large data structures
- Native/resource limits depending on the situation

## StackOverflowError

Usually excessive/deep recursion or runaway recursive calls exhaust the thread stack.