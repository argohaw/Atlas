# 12. Production Troubleshooting Scenarios

# Scenario 1: API latency suddenly increases

Approach:

1. Check request rate.
2. Check p50/p95/p99 latency.
3. Check error rate.
4. Identify whether all endpoints or one endpoint are affected.
5. Use traces to identify slow downstream calls.
6. Check database query latency.
7. Check CPU, memory and thread pools.
8. Check recent deployment/configuration changes.
9. Roll back only when evidence supports it.

Do not answer:

> "I would restart the service."

Restarting can hide evidence and does not identify root cause.

---

# Scenario 2: Kafka lag is continuously increasing

Investigate:

1. Producer rate vs consumer throughput.
2. Which partitions have lag?
3. Are consumers healthy?
4. Is processing slow?
5. Is a downstream database/API slow?
6. Are enough partitions available for desired parallelism?
7. Is partition skew causing a hot partition?
8. Are consumer rebalances occurring frequently?

Potential solutions depend on cause:

- Optimize processing
- Scale consumers up to useful partition parallelism
- Increase partitions carefully
- Fix downstream bottleneck
- Batch processing if appropriate

---

# Scenario 3: Duplicate PaymentCompleted event

Never assume duplicates cannot happen.

Possible solution:

```text
Event ID
   ↓
Check processed-event record
   ↓
Already processed?
YES → return/skip safely
NO
 ↓
Perform state change
 ↓
Record processed event atomically where possible
```

Alternatively use domain state transitions and uniqueness constraints.

---

# Scenario 4: Payment Service is Down

Bad:

```text
Booking service retries indefinitely.
```

Better:

1. Timeout.
2. Limited retry for appropriate transient errors.
3. Backoff.
4. Circuit breaker if failures persist.
5. Return/record an appropriate pending state.
6. Continue/reconcile asynchronously when architecture permits.

Never claim a fallback can simply "pretend payment succeeded."

Fallback behavior must preserve business correctness.

---

# Scenario 5: Database is Slow

Check:

- Query execution plans
- Missing indexes
- N+1 queries
- Connection pool saturation
- Locks/contention
- CPU/IO
- Large scans
- Recent query changes

Then optimize based on evidence.

Do not add indexes randomly.

---

# Scenario 6: Pod Keeps Restarting

1. `kubectl describe pod`
2. Check events.
3. Check current logs.
4. Check previous container logs.
5. Determine exit code/reason.
6. Check configuration.
7. Check memory/resource events.
8. Check probes.
9. Check dependency assumptions.

Common causes:

- Application exception
- OOMKilled
- Incorrect configuration
- Incorrect startup command
- Liveness probe misconfiguration

---

# Scenario 7: Application Works Locally but Fails in Kubernetes

Check:

- Environment variables
- ConfigMap/Secret mounts
- DNS/service names
- Network policies/security
- Container port
- Service targetPort
- Image version
- JVM options
- File system assumptions
- Timeouts
- Dependency endpoints

A common mistake is assuming:

```text
localhost:9092
```

inside the container points to a Kafka broker running elsewhere.

It points to the local container/pod network context.