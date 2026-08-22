# 5. REST APIs, Security and JPA

# 5.1 HTTP Methods

## GET

Retrieve a resource.

Should not change server state in the normal semantic sense.

## POST

Create a resource or trigger processing where the request semantics do not fit idempotent replacement.

## PUT

Typically full replacement/update semantics and should be idempotent.

## PATCH

Partial modification.

## DELETE

Delete a resource; repeated requests should generally have idempotent intended state even though exact response codes can vary.

---

# 5.2 Important HTTP Status Codes

- `200 OK`
- `201 Created`
- `202 Accepted`
- `204 No Content`
- `400 Bad Request`
- `401 Unauthorized` — in HTTP semantics, authentication is required/failed
- `403 Forbidden` — authenticated identity lacks permission
- `404 Not Found`
- `409 Conflict`
- `422 Unprocessable Content`
- `429 Too Many Requests`
- `500 Internal Server Error`
- `502 Bad Gateway`
- `503 Service Unavailable`
- `504 Gateway Timeout`

### 401 vs 403

A common answer:

> 401 relates to authentication credentials being missing or invalid, while 403 means the caller is understood/authenticated but is not allowed to perform the operation.

---

# 5.3 Idempotency

An operation is idempotent when repeating the same request produces the same intended final state.

Example challenge:

```text
POST /payments
```

A network timeout occurs.

The client does not know whether payment was created.

If it retries blindly:

```text
Payment created twice
```

Possible solution:

- Idempotency key
- Persist request/result mapping
- Return previous result for duplicate key

This is extremely relevant to payment, booking and distributed systems.

---

# 5.4 Global Exception Handling

Use a centralized approach such as `@ControllerAdvice`.

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    ResponseEntity<ApiError> handleNotFound(
            OrderNotFoundException ex) {
        return ResponseEntity.status(404)
            .body(new ApiError("ORDER_NOT_FOUND"));
    }
}
```

Return consistent error contracts.

Do not expose stack traces or internal database details.

---

# 5.5 Validation

Use declarative validation for API inputs.

Examples:

- `@NotNull`
- `@NotBlank`
- `@Size`
- `@Email`
- `@Valid`

Validation does not replace business-rule validation.

Example:

```text
@NotNull bookingDate
```

checks structural validity.

But:

```text
Flight cannot be booked after departure
```

is a business rule.

---

# 5.6 Authentication vs Authorization

Authentication:

> Who are you?

Authorization:

> What are you allowed to do?

Example:

```text
JWT validated
     ↓
Identity established
     ↓
Roles/authorities evaluated
     ↓
Access allowed or denied
```

---

# 5.7 JWT

Typical flow:

```text
User authenticates
       ↓
Authorization system issues token
       ↓
Client sends Bearer token
       ↓
Resource server validates token
       ↓
Claims are interpreted
       ↓
Authorization decision
```

Know:

- Header
- Payload/claims
- Signature
- Expiration
- Access token vs refresh token

Important:

JWT payload is generally encoded, not encrypted merely by being a JWT.

Do not store sensitive secrets in token claims assuming Base64 encoding protects them.

---

# 5.8 JPA Persistence Context

The persistence context tracks managed entities.

```java
@Transactional
public void updateName(Long id, String name) {
    User user = repository.findById(id).orElseThrow();
    user.setName(name);
}
```

The entity is managed.

Changes can be detected and synchronized with the database when the persistence context is flushed/transaction completes.

This is commonly called dirty checking.

---

# 5.9 @Transactional

At a high level:

- A transaction boundary is established.
- Database operations execute within the transaction.
- On successful completion, changes commit.
- On qualifying failure, changes can roll back.

Know important caveats:

- Proxy-based behavior is commonly involved.
- Self-invocation can prevent expected proxy interception.
- Rollback rules differ for checked vs unchecked exceptions unless configured.
- Transactions do not magically make remote REST calls transactional.
- A database transaction should not normally be held open while waiting on slow remote systems.

---

# 5.10 Lazy vs Eager Loading

## Lazy

Associated data is loaded when accessed.

Pros:

- Avoid unnecessary initial loading.

Risks:

- LazyInitializationException outside the appropriate persistence context.
- N+1 queries.

## Eager

Association is loaded immediately according to mapping/query behavior.

Risks:

- Fetching too much.
- Unexpected joins/queries.
- Performance issues.

Do not solve every lazy problem by changing everything to eager.

---

# 5.11 N+1 Problem

Example:

```text
1 query → fetch 100 orders

Then:
100 additional queries → fetch each customer
```

Total:

```text
101 queries
```

Possible solutions depending on use case:

- Fetch joins
- Entity graphs
- Batch fetching
- Projections
- Better query design

The correct solution depends on the required response shape.