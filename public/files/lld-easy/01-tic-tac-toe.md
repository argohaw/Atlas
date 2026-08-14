---
tags: [lld, easy, game-design, amazon-interview]
---
# LLD: Design Tic-Tac-Toe

## 🎯 Why This Problem is Asked
Amazon asks this to test your ability to model a **finite state machine** cleanly. The game has explicit states (IN_PROGRESS, WIN, DRAW), clear entity boundaries, and a win-condition algorithm. It reveals whether you default to procedural `if-else` spaghetti or think in objects.

---

## 📋 Requirements Clarification (Say This Out Loud)

**Functional:**
- 2 players take turns placing their symbol (X or O) on a 3×3 board
- Detect win (row, column, diagonal) after each move
- Detect draw when board is full with no winner
- Support N×N board (generalization shows maturity)

**Non-Functional:**
- Single-machine, in-memory — no persistence needed
- Thread-safety not required (turn-based, sequential)
- Latency: every move must resolve in O(N) time — no full board scan

---

## 🧩 Core Entities & Enums

```java
public enum Symbol { X, O }

public enum GameStatus { IN_PROGRESS, WIN, DRAW }

public class Player {
    private final String name;
    private final Symbol symbol;
}

public class Cell {
    private final int row, col;
    private Symbol symbol; // null = empty
}

public class Board {
    private final int size;
    private final Cell[][] grid;
}

public class Game {
    private final Board board;
    private final List<Player> players;
    private int currentPlayerIndex;
    private GameStatus status;
}
```

**Why these entities?**
- `Cell` owns its own symbol — the board doesn't store raw chars, it stores typed objects. This makes win-checking type-safe.
- `Player` is separate from `Symbol` — tomorrow you could add AI players without changing the game loop.
- `GameStatus` enum prevents magic strings like `"win"` scattered across the codebase.

---

## 🏗️ Class Design & Patterns Used

### Pattern: Strategy (Win Condition Checker)
Extract win-checking into a strategy so you can swap 3×3 logic for N×N without touching `Game`.

```java
public interface WinStrategy {
    boolean checkWin(Board board, int row, int col, Symbol symbol);
}

public class StandardWinStrategy implements WinStrategy {
    @Override
    public boolean checkWin(Board board, int row, int col, Symbol symbol) {
        return checkRow(board, row, symbol)
            || checkCol(board, col, symbol)
            || checkDiagonals(board, symbol);
    }

    private boolean checkRow(Board board, int row, Symbol s) {
        for (int c = 0; c < board.getSize(); c++)
            if (board.getCell(row, c).getSymbol() != s) return false;
        return true;
    }
    // checkCol and checkDiagonals follow same pattern
}
```

**Why Strategy here?** The interviewer will ask "what if we want 5-in-a-row on a 10×10 board?" With Strategy, you just inject a new `WinStrategy` — zero changes to `Game`.

### Core Game Loop

```java
public class Game {
    private final WinStrategy winStrategy;

    public GameStatus makeMove(int row, int col) {
        if (status != GameStatus.IN_PROGRESS)
            throw new IllegalStateException("Game already over");

        Player current = players.get(currentPlayerIndex);
        Cell cell = board.getCell(row, col);

        if (cell.getSymbol() != null)
            throw new IllegalArgumentException("Cell already occupied");

        cell.setSymbol(current.getSymbol());

        if (winStrategy.checkWin(board, row, col, current.getSymbol())) {
            status = GameStatus.WIN;
        } else if (board.isFull()) {
            status = GameStatus.DRAW;
        } else {
            currentPlayerIndex = (currentPlayerIndex + 1) % players.size();
        }

        return status;
    }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Move on occupied cell | Throw `IllegalArgumentException` |
| Move after game ends | Throw `IllegalStateException` |
| N×N board generalization | `WinStrategy` handles variable size |
| More than 2 players | `players` is a `List` — supports N players |

---

## �️ Database Design

### Why Redis for Real-Time Game State?

**For a real multiplayer Tic-Tac-Toe service:**

| Layer | Database | Rationale |
|---|---|---|
| **Hot state** | Redis | Game in progress — fastest access, O(1) lookups. Serialize `Game` object as JSON: `game:{gameId} → {board, players, turn, status}` |
| **Archive** | PostgreSQL | Game history — durable, queryable for analytics. Table: `games(id, player1_id, player2_id, winner_id, started_at, ended_at, moves)` |
| **Cache** | Redis | Leaderboard — top 100 players by wins: `leaderboard:elo → sorted set with scores` |

**Schema & Rationale:**

```redis
# Active game state — TTL 86400s (24 hours)
game:{gameId}
  {
    "board": [[null, "X", "O"], ...],
    "players": [
      {"id": "p1", "name": "Alice", "symbol": "X"},
      {"id": "p2", "name": "Bob", "symbol": "O"}
    ],
    "currentPlayerId": "p1",
    "status": "IN_PROGRESS",
    "createdAt": 1692374400000,
    "lastMoveAt": 1692374510000
  }

# Game-to-players index for quick lookup
player:{playerId}:active_game → gameId

# Leaderboard sorted by rating
leaderboard:rating
  ZADD leaderboard:rating 1200 alice 1150 bob 1100 charlie
```

### Why Not SQLite or Embedded Database?
- ❌ Single-threaded lock overhead for concurrent games
- ❌ Requires file I/O (slow) instead of in-memory operations
- ✅ Use SQLite only for archival/logging

### Write Path (Move Applied)
```
Client → API Server → Redis GET game:{id} → Validate → Redis SET game:{id} (atomic) → Publish to opponent via WebSocket
```

---

## 🔌 API Routes & Contracts

### If Built as a Microservice

```
POST   /api/v1/games
├─ Request:  { "player1Id": "uuid", "player2Id": "uuid", "boardSize": 3 }
├─ Response: { "gameId": "uuid", "status": "IN_PROGRESS", "board": [...] }
└─ Error:    409 Conflict if players already in active game

GET    /api/v1/games/{gameId}
├─ Response: { "gameId", "board", "status", "currentPlayerId", "lastMoveAt" }
└─ Error:    404 Not Found

POST   /api/v1/games/{gameId}/moves
├─ Request:  { "playerId": "uuid", "row": 0, "col": 1 }
├─ Response: { "board": [...], "status": "IN_PROGRESS|WIN|DRAW", "winner": null | "uuid" }
├─ Error:    400 Invalid move (occupied cell)
├─ Error:    409 Not your turn
└─ Error:    410 Game already over

GET    /api/v1/games/{gameId}/history
├─ Response: [{ "moveNum": 1, "playerId": "...", "row": 0, "col": 0, "timestamp": "..." }, ...]
└─ Idempotency: N/A (read-only)

DELETE /api/v1/games/{gameId}
├─ Response: 204 No Content
└─ Effect:   Delete from Redis, archive to PostgreSQL

WebSocket /ws/games/{gameId}?playerId={uuid}
├─ Subscribe: player receives real-time board updates
├─ Message:   { "type": "MOVE_APPLIED", "board": [...], "by": "playerId" }
└─ Event:     "GAME_OVER" → { "winner": "playerId" | "DRAW" }
```

### Idempotency & Retry Safety
```java
POST /api/v1/games/{gameId}/moves
  Idempotency-Key: {gameId}:{playerId}:{moveNum}
  // If move already applied, return 200 with same response
  // Prevents double-moves on network retry
```

---

## 🏗️ Service Architecture

### Three-Service Decomposition

```
┌────────────────────────────────────────┐
│         API Gateway                    │
│  (Auth, rate limiting, routing)        │
└─────────────────┬──────────────────────┘
                  │
        ┌─────────┴─────────┬──────────────────┐
        │                   │                  │
    ┌───▼────────┐  ┌──────▼─────┐  ┌────────▼────┐
    │ GameService│  │ValidService │  │StateService │
    │            │  │             │  │             │
    │ • Create   │  │ • Move      │  │ • Persist   │
    │ • Query    │  │   validate  │  │ • Archive   │
    │ • Delete   │  │ • Check win │  │ • Fetch     │
    └───┬────────┘  └──────┬──────┘  └────────┬────┘
        │                  │                  │
        └──────────────────┬──────────────────┘
                           │
                    ┌──────▼────────┐
                    │ Redis + PgSQL  │
                    │ (State + Logs) │
                    └────────────────┘
```

### Service Responsibilities

| Service | Responsibility | Data Access |
|---|---|---|
| **GameService** | Create, list, delete games; player matchmaking | Redis (game registry), PostgreSQL (player stats) |
| **ValidService** | Validate moves; detect win/draw; check turn order | Redis (game state), in-process (WinStrategy logic) |
| **StateService** | Persist game state; archive completed games; leaderboard updates | Redis, PostgreSQL |
| **NotificationService** | Push move notifications to opponent via WebSocket | Redis Pub/Sub |

### Inter-Service Communication

```
POST /games/{id}/moves (GameService)
  │
  ├─> Calls ValidService.validateMove(gameId, move)
  │   └─> Returns { valid: bool, winner: null | playerId, newStatus }
  │
  ├─> If valid: Calls StateService.applyMove(gameId, move)
  │   └─> Persists to Redis + publishes event
  │
  └─> Publishes to Redis Pub/Sub topic `game:{id}:updates`
      └─> NotificationService subscribes, pushes to opponent's WebSocket
```

### Example: Complete Move Flow

```
Client A submits move (e2-e4)
    │
    ▼
API Server validates client auth, rate limit
    │
    ▼
POST /games/g123/moves { playerId: p1, row: 1, col: 2 }
    │
    ├─> GameService.validatePlayerTurn(g123, p1) ✓
    │
    ├─> ValidService.validateMove(board, row, col, playerSymbol)
    │   └─> Check cell empty, apply, run WinStrategy.checkWin() ✓
    │
    ├─> StateService.applyAndPersist(g123, move, newStatus)
    │   └─> Redis SET game:g123 { ..., board: updated, status: "IN_PROGRESS" }
    │
    ├─> Publish event to Redis Pub/Sub: game:g123:updates
    │   └─> { type: "MOVE", playerId: p1, board: [...], status: "IN_PROGRESS" }
    │
    └─> WebSocket push to Client B (via NotificationService)
        └─> { type: "MOVE_APPLIED", board: [...], opponent: "Alice" }

Response to Client A: 200 { board: [...], status: "IN_PROGRESS" }
```

---

## �📐 Scalability & HLD Thinking

Even though this is an in-memory LLD problem, Amazon expects you to think about what happens if this were a **real multiplayer service**. Proactively mention:

**Scalability:**
- Each game session is independent — horizontally scalable. Route all moves for `gameId` to the same server instance using **consistent hashing** on `gameId` at the load balancer. No shared state between instances.
- If scaling to millions of concurrent games: store game state in **Redis** (key: `game:{id}`, value: serialized `Game` object). Any instance can serve any game.

**Consistency:**
- Turn-based games require **strong consistency** — two players must never see different board states. If using Redis, use a **single-key transaction** (`WATCH` + `MULTI`/`EXEC`) to atomically validate and apply a move.
- This is a **CP** choice (CAP theorem) — we prefer consistency over availability. A move failing is better than two players seeing conflicting boards.

**Latency:**
- Win-check is O(N) per move — acceptable. For N=3, it's 9 operations. For N=1000, consider incremental win-checking (only check the row/col/diagonal of the last move — already implemented above).
- Target latency budget: move validation < 5ms, state persistence < 10ms, total response < 50ms.

**Availability:**
- Game state in Redis with replication. If the primary Redis node fails, replica promotes in < 30 seconds. In-flight moves during failover return a 503 — client retries with **idempotency key** (`gameId + moveSequenceNumber`) to prevent duplicate moves.

**Observability:**
- Metrics: moves/sec, game completion rate, error rate (invalid moves), p99 move latency
- Logs: structured JSON — `{ gameId, playerId, move: {row, col}, result, durationMs }`
- Alerts: error rate > 1% or p99 > 100ms

---

## 🗣️ How to Explain in the Interview

> "I'm separating the win-checking logic into a `WinStrategy` interface — Open-Closed Principle. If the interviewer asks me to extend to a 5×5 board, I inject a different strategy with zero changes to `Game`. If this were a real multiplayer service, I'd store game state in Redis and use consistent hashing to route all moves for a game to the same instance. For consistency, I'd use a Redis transaction — a move must be atomic. Two players seeing different boards is worse than a move failing."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** — Single Responsibility | `Board` manages cells, `Game` manages turns, `WinStrategy` checks wins |
| **O** — Open/Closed | New win rules = new `WinStrategy`, no `Game` changes |
| **L** — Liskov | Any `WinStrategy` impl can replace another |
| **I** — Interface Segregation | `WinStrategy` has one method, not a bloated interface |
| **D** — Dependency Inversion | `Game` depends on `WinStrategy` interface, not concrete class |
