---
tags: [lld, advanced, system-design, crypto, exchange]
---
# LLD: Design Cryptocurrency Exchange

## 🎯 Why This Problem is Asked
Crypto exchange systems combine:
- order matching
- wallet accounting
- hot/cold wallet separation
- settlement and risk controls
- real-time price feeds

---

## 📋 Requirements Clarification

### Functional
- place buy/sell orders
- match orders by price/time priority
- maintain wallet balances
- support deposits and withdrawals
- expose market data and order book

### Non-Functional
- low-latency order matching
- strong consistency for balances and ledger entries
- resilience to outages and partial failures

---

## 🧩 Core Entities

```java
public class Order {
    private String orderId;
    private String userId;
    private String symbol;
    private OrderSide side; // BUY / SELL
    private BigDecimal price;
    private BigDecimal quantity;
    private OrderStatus status;
}

public class Wallet {
    private String walletId;
    private String userId;
    private String assetSymbol;
    private BigDecimal balance;
}
```

---

## 🏗️ LLD Patterns

### 1. Order Book
Maintain bid/ask priority queues for each trading pair.

```java
public class OrderBook {
    PriorityQueue<Order> bids;
    PriorityQueue<Order> asks;
}
```

### 2. Ledger and Settlement
Every trade updates balances atomically.

```java
public class TradeExecutor {
    public void executeTrade(Order buy, Order sell) {
        // debit buyer, credit seller, record trade event
    }
}
```

### 3. Risk Controls
Implement withdrawal restrictions, AML checks, and custody policies.

---

## 🗄️ Database Design

```sql
CREATE TABLE orders (
  order_id UUID PRIMARY KEY,
  user_id UUID,
  symbol VARCHAR(20),
  side VARCHAR(10),
  price DECIMAL(18,8),
  quantity DECIMAL(18,8),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE wallets (
  wallet_id UUID PRIMARY KEY,
  user_id UUID,
  asset_symbol VARCHAR(20),
  balance DECIMAL(18,8),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trades (
  trade_id UUID PRIMARY KEY,
  buy_order_id UUID,
  sell_order_id UUID,
  price DECIMAL(18,8),
  quantity DECIMAL(18,8),
  executed_at TIMESTAMP DEFAULT NOW()
);
```

Redis caches order books, hot wallets, and market feed.

---

## 🔌 API Routes & Contracts

```
POST /v1/orders
Request: { "symbol": "BTC/USDT", "side": "BUY", "price": 56000, "quantity": 0.1 }
Response: { "orderId": "o-88" }

GET /v1/order-book/BTC/USDT
Response: { "bids": [...], "asks": [...] }
```

---

## 🏗️ Service Architecture

```text
Clients
   |
   v
API Gateway
   |
   +--> Order Service
   +--> Matching Engine
   +--> Wallet Service
   +--> Risk Service
   +--> Market Data Service
```

---

## 📐 HLD Concepts

- matching engine requires low-latency in-memory structures
- balances must be strongly consistent
- hot wallets separate from cold storage for security
- withdrawals must include KYC and risk screens

---

## 🗣️ How to Explain in the Interview

> "The exchange is really two systems: a low-latency matching engine and a highly reliable wallet ledger. I would keep the matching engine in memory for speed, but every trade must still update the wallet balances and trade ledger atomically to preserve correctness."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Matching and wallet concerns are separate |
| O | New order types or markets can be plugged in |
| D | Services depend on abstractions for risk and settlement |

---

## ⚠️ Follow-up Questions
- How do you ensure no double-spend or balance corruption?
- How do you handle extremely high-frequency order flow?
- How do you secure cold-wallet withdrawals?

---

## 🔥 Deep Dive: Production Realities for Crypto Exchange

### 1. Matching Engine Architecture
The matching engine is usually an in-memory component because price-time priority matching must be extremely fast. It maintains:
- bid and ask priority queues per trading pair
- a microsecond-scale event loop for incoming orders
- an execution engine that matches best ask with best bid
- a trade ledger that records every execution atomically

A create-only order from the API should not directly mutate the wallet; it only enqueues an order for the matching engine.

### 2. Wallet Safety and Ledger Integrity
A crypto exchange must separate:
- hot wallets: used for customer withdrawals and rapid liquidity
- cold wallets: better for long-term custody, offline storage
- internal account ledger: canonical record of balances and transfers

The wallet service should be built around ledger semantics. A user’s balance should not live in a single mutable cached value; it should be reconciled against a ledger of credits/debits.

### 3. Preventing Double-Spend and Race Conditions
If two withdrawal requests for the same account arrive simultaneously, the system can corrupt balances unless protected by locking or transactional semantics. Typical protections:
- account-level serialized writes
- idempotent withdrawal requests using request IDs
- balance checks before execution
- ledger write + wallet state update in same transaction

### 4. Order Book Partitioning and Latency
At exchange scale, order flow is huge. You normally partition by symbol and route matching on dedicated engine nodes. This gives:
- low contention per symbol
- easier hot-spot isolation
- regional failover and scaling for major pairs like BTC/USDT

### 5. Risk and Compliance
Wallets also have to pass risk checks:
- KYC and AML validation for withdrawals
- whitelisting of addresses
- velocity/risk rules for deposit/withdraw patterns
- freeze or manual review for suspicious activity

### 6. Market Data and Real-Time Feeds
A separate market data service publishes:
- order book snapshots
- last traded price
- trade stream updates
- candlestick aggregates

This requires high-throughput pub/sub and careful backpressure handling.

### 7. Failure Modes
Common issues:
- engine node crash during a match cycle
- ledger write succeeds but trade event publication fails
- cold wallet withdrawal partially completes
- stale order book after failover

Mitigations:
- durable event logs for trade execution
- journaling and snapshot recovery for order book state
- reconciliation jobs for balances and withdrawals
- replication of matching engine state across nodes

### 8. Interview Answer Template
> "I’d split the exchange into three subsystems: a low-latency matching engine, a wallet and ledger service, and a risk/compliance layer. The matching engine keeps sell and buy order books in memory for speed, while the wallet service preserves strong correctness by updating a ledger and balances atomically. Withdrawal and move-between-wallet operations are further protected by KYC checks, address whitelisting, and cold-wallet custody workflows. For scale, I’d partition by symbol and keep a durable trade log for reconciliation and failover."
