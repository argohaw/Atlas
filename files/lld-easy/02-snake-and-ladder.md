---
tags: [lld, easy, game-design, amazon-interview]
---
# LLD: Design Snake and Ladder Game

## 🎯 Why This Problem is Asked
This tests your ability to model **event-driven state transitions** and **board configuration**. The key insight Amazon looks for: can you separate the board setup (snakes/ladders as a map) from the game loop, and can you make it extensible for different board sizes and rules?

---

## 📋 Requirements Clarification

**Functional:**
- N players take turns rolling a dice
- Land on a snake's head → slide to its tail
- Land on a ladder's bottom → climb to its top
- First player to reach position 100 wins
- Support configurable board size, snake/ladder positions

**Non-Functional:**
- In-memory, single machine
- Dice can be plugged in (fair, loaded, multi-dice)
- Move resolution must be O(1) — no iteration over snakes/ladders

---

## 🧩 Core Entities & Enums

```java
public enum CellType { NORMAL, SNAKE_HEAD, LADDER_BOTTOM }

public class Player {
    private final String name;
    private int currentPosition; // starts at 0
}

public class Snake {
    private final int head;
    private final int tail; // tail < head always
}

public class Ladder {
    private final int bottom;
    private final int top;   // top > bottom always
}

public class Board {
    private final int size;                        // e.g. 100
    private final Map<Integer, Integer> snakes;    // head -> tail
    private final Map<Integer, Integer> ladders;   // bottom -> top
}

public class Dice {
    private final int faces; // default 6
    public int roll() { return new Random().nextInt(faces) + 1; }
}
```

**Why `Map<Integer, Integer>` for snakes/ladders?**
O(1) lookup on every move. When a player lands on position X, `snakes.getOrDefault(X, X)` either returns the tail or X itself — no if-else chains needed.

---

## 🏗️ Class Design & Patterns

### Pattern: Strategy (Dice Rolling)

```java
public interface DiceStrategy {
    int roll();
}

public class FairDice implements DiceStrategy {
    public int roll() { return new Random().nextInt(6) + 1; }
}

public class LoadedDice implements DiceStrategy {
    private final int fixedValue;
    public int roll() { return fixedValue; } // useful for testing
}
```

**Why?** Testability. In unit tests, inject `LoadedDice(6)` to deterministically test win conditions. In production, inject `FairDice`. The game loop never changes.

### Pattern: Factory (Board Builder)

```java
public class BoardFactory {
    public static Board createStandardBoard() {
        Map<Integer, Integer> snakes = Map.of(99,54, 70,55, 52,42);
        Map<Integer, Integer> ladders = Map.of(6,25, 11,40, 60,85);
        return new Board(100, snakes, ladders);
    }
}
```

### Core Game Loop

```java
public class Game {
    private final Board board;
    private final List<Player> players;
    private final DiceStrategy dice;
    private int currentIndex = 0;

    public Player playTurn() {
        Player player = players.get(currentIndex);
        int roll = dice.roll();
        int newPos = player.getCurrentPosition() + roll;

        if (newPos > board.getSize()) {
            // Can't move — must land exactly (optional rule, mention it)
        } else {
            // O(1) snake and ladder lookup
            newPos = board.getSnakes().getOrDefault(newPos, newPos);
            newPos = board.getLadders().getOrDefault(newPos, newPos);
            player.setCurrentPosition(newPos);
        }

        if (newPos == board.getSize()) return player; // winner

        currentIndex = (currentIndex + 1) % players.size();
        return null;
    }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Roll overshoots 100 | Player stays — must land exactly on 100 |
| Snake at position 100 | Invalid board config — validate in `BoardFactory` |
| Ladder on top of snake head | Validate no overlap in board construction |
| Multiple dice | `DiceStrategy` can sum N dice rolls |

---

## �️ Database Design

### Database Choices for a Multiplayer Snakes & Ladders Platform

| Layer | Database | Rationale |
|---|---|---|
| **Active games** | Redis | In-progress game state — O(1) access. Serialize: `game:{gameId} → {players, board, positions, status}` |
| **Game history** | PostgreSQL | Completed games for analytics, replays, leaderboard. Table: `games(id, created_at, completed_at, players, winner, duration_secs)` |
| **Board config** | PostgreSQL | Snakes/ladders map — read-only, cached in application. `board_templates(id, size, snakes, ladders, name)` |
| **Real-time leaderboard** | Redis Sorted Set | Top N players by win rate: `leaderboard:wins ZADD leaderboard:wins 150 alice 140 bob` |

**Schema & Rationale:**

```redis
# Active game state — TTL 3600s (1 hour, or until game ends)
game:{gameId}
  {
    "boardTemplateId": "standard",
    "players": [
      {"id": "p1", "name": "Alice", "position": 0, "rolled_sequence": [4, 2, 5]},
      {"id": "p2", "name": "Bob", "position": 15, "rolled_sequence": [3, 6, 6, 3]}
    ],
    "currentPlayerIndex": 0,
    "status": "IN_PROGRESS",
    "createdAt": 1692374400000
  }

# Player-to-game index
player:{playerId}:active_game → gameId

# Real-time leaderboard
leaderboard:wins
  ZADD leaderboard:wins 42 alice 35 bob 28 charlie
```

**PostgreSQL Schema:**

```sql
CREATE TABLE board_templates (
  id VARCHAR(50) PRIMARY KEY,
  size INT NOT NULL,
  snakes JSONB NOT NULL,  -- {"99": 54, "70": 55, "52": 42}
  ladders JSONB NOT NULL, -- {"6": 25, "11": 40}
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE games (
  id VARCHAR(50) PRIMARY KEY,
  board_template_id VARCHAR(50) REFERENCES board_templates(id),
  players JSONB NOT NULL,  -- [{id, name, final_position}, ...]
  winner_id VARCHAR(50),
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_secs INT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_winner_id (winner_id),
  INDEX idx_completed_at (completed_at)
);

CREATE TABLE player_stats (
  player_id VARCHAR(50) PRIMARY KEY,
  total_games INT DEFAULT 0,
  wins INT DEFAULT 0,
  avg_game_duration_secs INT,
  win_rate DECIMAL(5, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Why Not Cassandra or DynamoDB?
- ❌ Overkill for turn-based game (writes aren't continuous)
- ❌ Eventual consistency breaks turn ordering
- ✅ Redis is fast enough + PostgreSQL for analytics

---

## 🔌 API Routes & Contracts

### Multiplayer Snakes & Ladders API

```
POST   /api/v1/games
├─ Request:  { "playerIds": ["uuid1", "uuid2", "uuid3"], "boardTemplateId": "standard" }
├─ Response: { "gameId": "uuid", "status": "WAITING_FOR_FIRST_TURN", "board": {...} }
└─ Notes:    2-4 players, match to same difficulty level

GET    /api/v1/games/{gameId}
├─ Response: { "gameId", "players": [{id, name, position, hasMoved}], "currentPlayerId", "status", "boardTemplate" }
└─ Error:    404 Not Found

POST   /api/v1/games/{gameId}/turn
├─ Request:  { "playerId": "uuid", "diceCount": 1 }
├─ Response: {
│     "playerId": "uuid",
│     "diceRoll": 5,
│     "fromPosition": 20,
│     "toPosition": 25,
│     "event": "LADDER",  // "NORMAL" | "SNAKE" | "LADDER" | "WIN"
│     "currentPlayerIndex": 1,  // next player's turn
│     "status": "IN_PROGRESS"
│   }
├─ Error:    409 Conflict (not your turn)
└─ Error:    410 Gone (game already won)

GET    /api/v1/games/{gameId}/replay
├─ Response: [
│     { "moveNum": 1, "playerId": "...", "diceRoll": 4, "position": 4 },
│     { "moveNum": 2, "playerId": "...", "diceRoll": 3, "position": 7 },
│     ...
│   ]
└─ Useful for: debugging, watching previous games

GET    /api/v1/board-templates
├─ Response: [
│     {
│       "id": "standard",
│       "name": "Classic Snakes & Ladders",
│       "size": 100,
│       "snakeCount": 8,
│       "ladderCount": 6,
│       "difficulty": "MEDIUM"
│     },
│     ...
│   ]
└─ Cache in application for 1 hour (read-only)

GET    /api/v1/players/{playerId}/stats
├─ Response: { "playerId", "totalGames": 150, "wins": 47, "winRate": 31.3, "avgDuration": 420 }
└─ Cached in Redis for 5 minutes

WebSocket /ws/games/{gameId}?playerId={uuid}
├─ Subscribe: all players receive real-time updates
├─ Message:   { "type": "TURN_TAKEN", "playerId": "...", "diceRoll": 5, "newPosition": 25 }
└─ Event:     "GAME_WON" → { "winner": "Alice", "finalPosition": 100 }
```

---

## 🏗️ Service Architecture

### Microservices Breakdown

```
┌──────────────────────────────────┐
│      API Gateway                 │
│  (auth, rate limit: 100/min)     │
└──────────────┬───────────────────┘
               │
    ┌──────────┼──────────┬──────────────┐
    │          │          │              │
┌───▼────────┐ │    ┌─────▼────┐   ┌────▼────────┐
│GameService │ │    │TurnService   │PlayerService│
│            │ │    │             │             │
│ • Create   │ │    │ • Roll dice │ • Register  │
│ • List     │ │    │ • Move player  • Stats    │
│ • Delete   │ │    │ • Detect    │ • Leaderboard
│            │ │    │   snake/ladder  • Match  │
└───┬────────┘ │    └─────┬────┘   └────┬────────┘
    │          │          │              │
    └──────────┼──────────┴──────────────┘
               │
        ┌──────▼──────────┐
        │ Redis + PgSQL   │
        │ Caching + Logs  │
        └─────────────────┘
```

### Service Responsibilities

| Service | Role | Owns |
|---|---|---|
| **GameService** | Game lifecycle | Create, delete, list games; board templates |
| **TurnService** | Turn processing | Dice roll, movement, snake/ladder detection, win detection |
| **PlayerService** | Player data | Registration, stats tracking, leaderboard updates |
| **BoardService** | Board config | Snakes/ladders layouts, difficulty templates |

### Complete Turn Flow

```
POST /games/g123/turn { playerId: p1, diceCount: 1 }
    │
    ├─> GameService.validatePlayerTurn(g123, p1) ✓ (is p1's turn?)
    │
    ├─> TurnService.rollDice(diceCount) 
    │   └─> Returns: 5 (uses DiceStrategy)
    │
    ├─> TurnService.movePlayer(p1, currentPos=20, diceRoll=5)
    │   ├─> newPos = 20 + 5 = 25
    │   ├─> Check snakes: Map.get(25) → null
    │   ├─> Check ladders: Map.get(25) → null
    │   └─> Returns: { fromPos: 20, toPos: 25, event: "NORMAL" }
    │
    ├─> TurnService.checkWin(toPos=25, boardSize=100)
    │   └─> Returns: false (need to reach exactly 100)
    │
    ├─> GameService.applyMove(g123, p1, move)
    │   └─> Redis SET game:g123 { players: [{...}, {pos: 25}, {...}], currentPlayerIndex: 1 }
    │
    ├─> PlayerService.updateStats(p1)
    │   └─> Increment stats in PostgreSQL
    │
    ├─> Publish to Redis Pub/Sub: game:g123:events
    │   └─> { type: "TURN_TAKEN", playerId: p1, diceRoll: 5, toPos: 25 }
    │
    └─> WebSocket push to all players
        └─> { type: "TURN_TAKEN", playerId: "p1", diceRoll: 5, newPosition: 25 }

Response: 200 { playerId: p1, diceRoll: 5, toPosition: 25, event: "NORMAL", currentPlayerIndex: 1 }
```

### Inter-Service Dependencies

```
TurnService
  ├─> depends on BoardService.getBoard(templateId) [cached for 1hr]
  └─> depends on DiceStrategy [injected]

PlayerService
  └─> depends on PostgreSQL connection pool + Redis for leaderboard cache

GameService
  ├─> depends on TurnService for turn validation
  ├─> depends on PlayerService for matchmaking
  └─> depends on Redis for game state
```

---

## �📐 Scalability & HLD Thinking

**Scalability:**
- Each game is a self-contained session. Scale horizontally — route all turns for a `gameId` to the same instance via **consistent hashing** at the load balancer. No cross-instance coordination needed.
- For a real multiplayer platform (e.g., 1M concurrent games): persist game state in **Redis** as a hash. Each turn is a read-modify-write on a single Redis key — atomic with `WATCH`/`MULTI`/`EXEC`.

**Consistency:**
- Turn order is critical — two players must not take turns simultaneously. Use a **distributed lock** (Redis `SET NX EX`) on `game:{id}:lock` before processing a turn. Release after state is persisted.
- This is a **CP** system — we sacrifice availability (a turn may fail if the lock can't be acquired) over consistency (wrong turn order).

**Latency:**
- Move resolution is O(1) — Map lookup for snakes/ladders. Total latency budget: dice roll + state read + O(1) resolution + state write < 20ms.
- Dice randomness: use a **cryptographically secure RNG** (`SecureRandom`) for fairness in a real game — not `java.util.Random` which is predictable.

**Availability:**
- Redis primary-replica with automatic failover (Redis Sentinel or Cluster). If primary fails, replica promotes in ~30s. Turns during failover return 503 — client retries with the same `turnId` (idempotency key).

**Observability:**
- Metrics: turns/sec, average game duration, snake-hit rate, ladder-hit rate, win distribution per player position
- Logs: `{ gameId, playerId, roll, fromPos, toPos, event: "SNAKE|LADDER|NORMAL", winner }`
- Alert: p99 turn latency > 50ms, error rate > 0.5%

---

## 🗣️ How to Explain in the Interview

> "The key design decision is using a `Map` for snakes and ladders — O(1) lookup, data-driven configuration. The `DiceStrategy` interface makes the game testable with deterministic dice. If this were a real multiplayer service, I'd store game state in Redis and use a distributed lock to enforce turn order — this is a CP choice. A turn failing is acceptable; two players moving simultaneously is not."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | `Board` owns layout, `Game` owns loop, `Dice` owns randomness |
| **O** | New board variants via `BoardFactory`, new dice via `DiceStrategy` |
| **D** | `Game` depends on `DiceStrategy` interface, not `FairDice` directly |
