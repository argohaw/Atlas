# 13. Rapid-Fire Interview Questions

## Java

### How does HashMap work internally?
Explain hash → bucket → collision handling → equals → resizing.

### Why override hashCode with equals?
Equal objects must have equal hash codes for correct hash-based collection behavior.

### HashMap vs ConcurrentHashMap?
Thread safety, concurrent access, null behavior and use cases.

### synchronized vs volatile?
Mutual exclusion + visibility versus primarily visibility/order; volatile does not make compound operations atomic.

### What causes a deadlock?
Circular waiting on locks.

### ArrayList vs LinkedList?
Array-backed random access vs node-based traversal; ArrayList is commonly the default in real application code.

### map vs flatMap?
One-to-one transformation versus transformation plus flattening.

### thenApply vs thenCompose?
Transform result versus chain an asynchronous operation returning another future.

### What is immutable and why useful?
State cannot change after construction; useful for safety, sharing and reasoning.

---

## Spring Boot

### What is IoC?
Framework manages object lifecycle/wiring.

### Why constructor injection?
Explicit required dependencies, immutability, easier testing.

### How does Spring Boot auto-configuration work?
Conditional configuration based on classpath/configuration/existing beans.

### @Component vs @Service vs @Repository?
Different semantic stereotypes; Repository also participates in persistence exception translation.

### What does @Transactional do?
Defines transaction boundaries, commits/rollbacks according to configuration and execution outcome; does not make remote systems one global transaction.

### What is the N+1 problem?
One query loads parents, then one additional query per associated record.

### How do you secure a Spring Boot API?
Authentication, authorization, token validation, least privilege, input validation, TLS, secure secrets/configuration and appropriate logging.

---

## Microservices

### Why microservices?
Independent deployment/scaling and domain ownership, but only when benefits justify distributed complexity.

### What happens when a downstream service fails?
Timeout, bounded retry, backoff, circuit breaker, graceful degradation or asynchronous recovery depending on business requirements.

### What is Saga?
Sequence of local transactions coordinated through events or an orchestrator with compensating actions.

### What is Outbox?
Persist business change and event intent atomically, then publish asynchronously.

### Why database per service?
Preserves service ownership and reduces tight data coupling.

### REST vs Kafka?
Immediate synchronous request/response versus asynchronous event-driven communication.

---

## Kafka

### What is a partition?
Ordered append-only log segment enabling parallelism and scalability.

### Does Kafka guarantee ordering?
Within a partition, not globally across partitions.

### What is a consumer group?
Consumers cooperating to process topic partitions; each partition is assigned to one active consumer in a group at a time.

### What is consumer lag?
Difference between produced/available progress and consumer processing progress.

### What happens when consumer crashes before offset commit?
Message can be redelivered; design consumer idempotently.

### What is a rebalance?
Partition assignments change when group membership/conditions change.

### At-most vs at-least vs exactly once?
Loss vs duplicates trade-offs; exactly-once guarantees have defined boundaries and do not magically cover arbitrary external side effects.

---

## AWS

### What is IAM?
Identity and access management; users, roles, policies and least privilege.

### Public vs private subnet?
Network routing/exposure model; private application/database resources generally avoid direct public exposure.

### What is a security group?
Stateful traffic rules around AWS resources.

### How would you deploy a Spring Boot app?
Image registry + compute platform + load balancing + private networking + IAM + observability + database + autoscaling.

---

## Docker

### Image vs container?
Packaged template versus running instance.

### CMD vs ENTRYPOINT?
Default command/arguments versus executable-oriented container startup configuration.

### Why multi-stage builds?
Smaller, cleaner runtime images without build dependencies.

### Why not run as root?
Reduce blast radius and privilege.

---

## Kubernetes

### Pod vs Deployment?
Pod runs workload containers; Deployment manages desired state/replicas/updates.

### Service vs Ingress?
Service provides stable access to pods; Ingress handles HTTP/HTTPS routing into services depending on setup.

### Liveness vs readiness?
Restart health versus traffic eligibility.

### What is CrashLoopBackOff?
Repeated container failure with increasing restart delay.

### What causes Pending?
Scheduling/resource/constraint problems.

### Requests vs limits?
Scheduling resource expectation versus resource ceiling/enforcement behavior.

### How does HPA help?
Changes replicas based on metrics, but does not solve every downstream bottleneck.