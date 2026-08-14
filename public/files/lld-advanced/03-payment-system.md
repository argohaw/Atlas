---
tags: [lld, advanced, system-design, payment-system, fin-tech]
---
# LLD: Design Payment System

## 🎯 Why This Problem is Asked
Payment systems are one of the hardest distributed systems because they combine:
- Financial correctness
- Idempotency and replay safety
- Strong consistency
- Reconciliation and settlement
- Fraud detection and rate limiting

This is a classic advanced system design for finance and platform engineering roles.

---

## 📋 Requirements Clarification

### Functional
- Create and authorize payment
- Capture funds
- Refund or reverse payment
- Maintain ledger entries
- Support multiple payment methods
- Handle payouts and settlements
- Detect suspicious transactions

### Non-Functional
- Strong consistency for ledger updates
- Exactly-once semantics in practice via idempotency
- High availability across regions
- Auditable financial records
- Low latency under normal traffic

---

## 🧩 Core Entities

```java
public enum PaymentStatus { INITIATED, AUTHORIZED, CAPTURED, FAILED, REFUNDED }
public enum PaymentMethodType { CARD, UPI, NET_BANKING, WALLET }
public enum LedgerEntryType { DEBIT, CREDIT }

public class Account {
    private String accountId;
    private String userId;
    private String currency;
    private BigDecimal availableBalance;
    private BigDecimal ledgerBalance;
    private boolean isFrozen;
}

public class Payment {
    private String paymentId;
    private String payerAccountId;
    private String payeeAccountId;
    private BigDecimal amount;
    private String currency;
    private PaymentStatus status;
    private String idempotencyKey;
    private String merchantId;
    private long createdAtMs;
}

public class LedgerEntry {
    private String entryId;
    private String accountId;
    private LedgerEntryType type;
    private BigDecimal amount;
    private String paymentId;
    private String reason;
    private long createdAtMs;
}

public class RefundRequest {
    private String refundId;
    private String paymentId;
    private BigDecimal amount;
    private String reason;
    private long createdAtMs;
}
```

---

## 🏗️ LLD Patterns

### 1. Idempotency Keys
Every payment request must be safe to retry. The payment service stores the idempotency key and returns the same result for repeated requests.

```java
public class PaymentService {
    private final PaymentRepository paymentRepo;
    private final LedgerService ledgerService;

    public Payment processPayment(String payerId, String payeeId, BigDecimal amount, String idempotencyKey) {
        if (paymentRepo.existsByIdempotencyKey(idempotencyKey)) {
            return paymentRepo.findByIdempotencyKey(idempotencyKey);
        }

        Payment payment = new Payment();
        payment.setPaymentId(UUID.randomUUID().toString());
        payment.setPayerAccountId(payerId);
        payment.setPayeeAccountId(payeeId);
        payment.setAmount(amount);
        payment.setStatus(PaymentStatus.AUTHORIZED);
        payment.setIdempotencyKey(idempotencyKey);

        paymentRepo.save(payment);
        ledgerService.postDebitAndCredit(payment);
        return payment;
    }
}
```

### 2. Double-Entry Ledger
Money movements are recorded as balanced journal entries: a debit and a credit.

```java
public class LedgerService {
    private final LedgerRepository ledgerRepo;

    public void postDebitAndCredit(Payment payment) {
        ledgerRepo.insert(new LedgerEntry(payment.getPayerAccountId(), LedgerEntryType.DEBIT, payment.getAmount(), payment.getPaymentId()));
        ledgerRepo.insert(new LedgerEntry(payment.getPayeeAccountId(), LedgerEntryType.CREDIT, payment.getAmount(), payment.getPaymentId()));
    }
}
```

### 3. Saga Pattern for Distributed Actions
If payment authorization and settlement are split across services, a saga coordinates local transactions and compensations.

```java
public class PaymentSaga {
    public void authorizeAndSettle(Payment payment) {
        try {
            gateway.authorize(payment);
            ledgerService.postDebitAndCredit(payment);
            riskService.checkFraud(payment);
            payment.setStatus(PaymentStatus.CAPTURED);
        } catch (Exception ex) {
            gateway.voidAuthorization(payment);
            payment.setStatus(PaymentStatus.FAILED);
        }
    }
}
```

---

## 🗄️ Database Design

### PostgreSQL for Ledger and Payments

```sql
CREATE TABLE accounts (
  account_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  currency VARCHAR(10) NOT NULL,
  available_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  ledger_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_frozen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, currency)
);

CREATE TABLE payments (
  payment_id UUID PRIMARY KEY,
  payer_account_id UUID REFERENCES accounts(account_id),
  payee_account_id UUID REFERENCES accounts(account_id),
  merchant_id UUID,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_payer (payer_account_id),
  INDEX idx_payee (payee_account_id),
  INDEX idx_status (status)
);

CREATE TABLE ledger_entries (
  entry_id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(account_id),
  payment_id UUID REFERENCES payments(payment_id),
  type VARCHAR(10), -- DEBIT or CREDIT
  amount DECIMAL(18,2) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_account_time (account_id, created_at),
  INDEX idx_payment (payment_id)
);

CREATE TABLE refunds (
  refund_id UUID PRIMARY KEY,
  payment_id UUID REFERENCES payments(payment_id),
  amount DECIMAL(18,2) NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Redis for Fast Reconciliation and Idempotency
```redis
# Payment idempotency cache
payment:idempotency:{key} -> paymentId

# account balance cache
account:{accountId}:balance -> 15000.00

# risk score / fraud cache
risk:user:123 -> { score: 0.82, lastChecked: ts }
```

---

## 🔌 API Routes & Contracts

```
POST   /v1/payments
Request: {
  "payerAccountId": "acc-1",
  "payeeAccountId": "acc-2",
  "amount": 250.00,
  "currency": "INR",
  "merchantId": "m-67",
  "idempotencyKey": "uuid-123"
}
Response: {
  "paymentId": "pay-1",
  "status": "AUTHORIZED",
  "amount": 250.00
}

POST   /v1/payments/{paymentId}/capture
Response: {
  "status": "CAPTURED"
}

POST   /v1/payments/{paymentId}/refund
Request: { "amount": 100.00, "reason": "customer_requested" }
Response: {
  "refundId": "rf-1",
  "status": "PROCESSING"
}

GET    /v1/accounts/{accountId}/balance
Response: {
  "availableBalance": 1200.50,
  "currency": "INR"
}
```

---

## 🏗️ Service Architecture

```text
Client / Merchant App
         |
         v
  API Gateway
         |
  ┌------v-----------┐
  │ Payment Service   │
  │ - idempotency     │
  │ - auth + capture  │
  └------┬-----------┘
         |
  ┌------v-----------┐
  │ Ledger Service    │
  │ - double-entry    │
  │ - balance update  │
  └------┬-----------┘
         |
  ┌------v-----------┐
  │ Risk / FraudSvc   │
  │ - velocity checks │
  │ - device checks   │
  └------┬-----------┘
         |
      PostgreSQL + Redis
         |
      Kafka / Outbox
         |
   Notification + Reconciliation + Settlement
```

### Payment flow
1. Payment request arrives with idempotency key
2. Payment service checks if key already processed
3. Risk service validates transaction rules
4. Authorization is attempted with gateway / bank
5. Ledger posts balanced entries
6. Settlement event goes to downstream services
7. Reconciliation ensures banks and internal books match

---

## 📐 HLD Concepts & Scalability

### Strong Consistency
- Ledger and accounts require strong consistency
- Use transactional writes within the same database shard
- Avoid splitting debit and credit across different databases without a saga

### Idempotency
- Every external retry should return same result, not duplicate execution
- Idempotency key is stored and checked before processing

### Fraud Detection
- Real-time velocity checks, geo mismatches, network anomalies
- Use cached risk signals and asynchronous ML scoring

### Reconciliation
- At end of day, compare settlement totals with bank statement and merchant reports
- Handle partial failure cases by ledger audit trail

---

## 🗣️ How to Explain in the Interview

> "The hardest part of a payment system is ensuring correctness under retries and partial failures. I would treat the ledger as the source of truth and ensure all balance changes are recorded via atomic DB transactions. For every API call, I’d use an idempotency key so the same request can be retried without charging the user twice.

I’d separate payment orchestration from ledger updates. The payment service decides whether a payment is authorized or failed, while the ledger service ensures the money movement is balanced and auditable. This makes the system easier to reason about and safer under failures.

If a downstream step like settlement or bank callback fails, I’d use an outbox or saga pattern so the system can reconcile and compensate without losing consistency."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | PaymentService, LedgerService, RiskService have separate responsibilities |
| O | New payment method or risk policy can be added without rewriting the core flow |
| D | Services depend on abstraction and repository interfaces |
| L | Risk failure should not corrupt the ledger |
| I | Auth, settlement, and risk logic are not tangled together |

---

## ⚠️ Follow-up Questions to Prepare
- How do you prevent duplicate charges under network retries?
- How do you reconcile with bank settlement reports?
- How do you handle international currencies and FX conversion?
- How do you detect and block fraudulent transactions?
- What happens during a partial outage or data center failover?

---

## 🔥 Deep Dive: Production Realities for Payment Systems

### 1. The Ledger Is the Truth
In a payments system, the ledger is not a convenience; it is the source of truth. Every successful payment eventually generates:
- a debit to payer account
- a credit to payee account
- a metadata entry for merchant and settlement
- an audit event for reconciliation

This is why double-entry accounting matters deeply. The system must never allow an unbalanced journal.

### 2. Exactly-Once Semantics in Practice
Business systems rarely achieve true exactly-once semantics. The practical approach is:
- receive idempotency key from client
- store it with the payment state
- if the same key is retried, return prior payment response
- use deduplicated event logs for downstream settlement and notification services

This gives the appearance of exactly-once processing even when network retries occur.

### 3. Settlement and Gateway Integration
A payment platform often integrates with banks, cards, and gateways. Each external call carries risk:
- 3DS challenge flows
- network timeouts or provider backoff
- bank response delays
- settlement finality mismatch

The system must support a state machine like INITIATED -> AUTHORIZED -> CAPTURED -> SETTLED -> FAILED / REFUNDED.

### 4. Fraud Rules
A payment system must detect anomalies like:
- same card used for multiple merchants in a short window
- IP mismatch with user account location
- velocity pattern spikes
- high-risk countries or BIN mismatches

This is often implemented as a risk engine with a fast scoring model using cached context and a slower async ML assessment.

### 5. Reliability During Failover
If a database failover happens in the middle of a payment, it must either:
- preserve atomicity using committed transaction logs or replicas
- or record a repair task to reconcile pending operations later

Partial fail states are worse than downtime because they can create silent financial discrepancies.

### 6. Reconciliation and Audit
At the end of each settlement window, the system does:
- compare payment ledger entries against bank statements
- reconcile merchant payout totals
- identify orphaned or partial refunds
- produce a ledger summary for control and compliance

A good system never loses the audit trail.

### 7. Capacity Planning
Typical high-scale payment workload:
- read heavy on account summary and status checks
- write heavy on ledger updates during business hours
- significant burstiness during sales or promotions

This leads to:
- separate ledger and account services
- write-optimized DB shards for ledger tables
- Redis caches for active balances and idempotency keys
- asynchronous reconciliation workers for settlement jobs

### 8. Interview Answer Template
> "A payment system is a strong-consistency ledger plus an orchestration layer. The money movement must be atomic, and every external retry must be idempotent. I would model the system around a ledger database that records balanced debit/credit entries, while a separate payment service enforces authorization, fraud checks, and settlement rules. Payment operations are serialized at the account or ledger level, with idempotency keys to prevent replays and a reconciliation process to reconcile against bank statements."
