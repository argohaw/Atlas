---
tags: [lld, easy, game-design, amazon-interview]
---
# LLD: Design Tetris Game

## 🎯 Why This Problem is Asked
Tetris tests **real-time state management**, **polymorphism** (7 different piece shapes), and **collision detection**. Amazon uses it to see if you can model a system with continuous state mutation cleanly — without a god-class that does everything.

---

## 📋 Requirements Clarification

**Functional:**
- 7 Tetromino shapes (I, O, T, S, Z, J, L)
- Pieces fall one row per tick; player can move left/right/rotate
- Full rows are cleared; score increases per cleared row
- Game ends when a new piece cannot be placed (board full)

**Non-Functional:**
- Single-player, in-memory
- Pluggable tick speed (for difficulty levels)
- Tick processing must complete in < 16ms (60fps target)

---

## 🧩 Core Entities & Enums

```java
public enum TetrominoType { I, O, T, S, Z, J, L }

public enum Direction { LEFT, RIGHT, DOWN }

public class Cell {
    private final int row, col;
}

public abstract class Tetromino {
    protected int pivotRow, pivotCol;
    protected List<Cell> cells; // relative offsets from pivot

    public abstract TetrominoType getType();
    public abstract Tetromino rotate(); // returns new rotated instance (immutable)
    public List<Cell> getAbsoluteCells() { /* pivot + offset */ }
}

public class Board {
    private final int rows, cols;
    private final boolean[][] grid; // true = occupied
    private Tetromino activePiece;
}

public class GameEngine {
    private final Board board;
    private int score;
    private boolean gameOver;
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Factory (Tetromino Creation)

```java
public class TetrominoFactory {
    public static Tetromino create(TetrominoType type) {
        return switch (type) {
            case I -> new ITetromino();
            case O -> new OTetromino();
            case T -> new TTetromino();
            // ...
        };
    }

    public static Tetromino createRandom() {
        TetrominoType[] types = TetrominoType.values();
        return create(types[new Random().nextInt(types.length)]);
    }
}
```

**Why Factory?** The game loop only calls `TetrominoFactory.createRandom()`. Adding a new piece shape means adding a new class + one case in the factory — zero changes to `GameEngine`.

### Concrete Tetromino (Immutable Rotation)

```java
public class ITetromino extends Tetromino {
    public ITetromino() {
        cells = List.of(new Cell(0,-1), new Cell(0,0), new Cell(0,1), new Cell(0,2));
    }

    @Override
    public Tetromino rotate() {
        return new ITetromino().withCells(rotateOffsets(this.cells));
    }
}
```

**Why immutable rotation?** `rotate()` returns a *new* Tetromino. The board validates the rotated position before committing — if invalid (wall collision), it discards the new instance. No rollback needed.

### Pattern: Command (Player Input)

```java
public interface Command { void execute(Board board); }

public class MoveCommand implements Command {
    private final Direction direction;
    public void execute(Board board) { board.movePiece(direction); }
}

public class RotateCommand implements Command {
    public void execute(Board board) { board.rotatePiece(); }
}
```

**Why Command?** Decouples input handling from game logic. You can queue commands, replay games, or add undo without touching `Board`. Also enables **input buffering** — queue commands during a tick and process them at the next frame boundary.

### Row Clearing Logic

```java
public class Board {
    public int clearFullRows() {
        int cleared = 0;
        for (int r = rows - 1; r >= 0; r--) {
            if (isRowFull(r)) {
                removeRow(r);
                shiftRowsDown(r);
                cleared++;
                r++; // re-check same index after shift
            }
        }
        return cleared;
    }
}
```

### Scoring Strategy

```java
public interface ScoringStrategy {
    int calculate(int linesCleared);
}

public class ClassicScoring implements ScoringStrategy {
    private static final int[] POINTS = {0, 100, 300, 500, 800}; // Tetris = 800
    public int calculate(int lines) { return POINTS[Math.min(lines, 4)]; }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Rotation causes out-of-bounds | Wall-kick: try offset positions before rejecting rotation |
| Multiple rows cleared at once | Score multiplier (Tetris = 4 rows = 800 pts) |
| Piece spawns on occupied cell | `gameOver = true` |
| Piece locks immediately on spawn | Detect and end game |

---

---

## 🗄️ Database Design

### Database Strategy for Tetris Platform

| Layer | Database | Rationale |
|---|---|---|
| **Active sessions** | Redis | In-progress games — real-time state. Serialize game board, current piece, score: `session:{sessionId} → {board, activePiece, score, level, ticks}` |
| **Replay archive** | PostgreSQL | Completed game replays for leaderboard, VOD, analytics. `games(id, player_id, score, lines_cleared, duration_secs, started_at, ended_at)` |
| **Leaderboard (hot)** | Redis Sorted Set | Top 1000 players by score — real-time updates. `leaderboard:scores ZADD leaderboard:scores 25000 alice 24500 bob` |
| **Leaderboard (archived)** | PostgreSQL | Historical leaderboard snapshots — weekly/monthly for analytics |

**Schema & Rationale:**

```redis
# Active game session — TTL 1800s (game duration ~5-10 min)
session:{sessionId}
  {
    "playerId": "p1",
    "board": [[0, 1, 1, 0, ...], ...],  // 1 = occupied, 0 = empty
    "activePiece": {
      "type": "I",
      "rotation": 0,
      "row": 2,
      "col": 4,
      "cells": [[2, 4], [2, 5], [2, 6], [2, 7]]
    },
    "score": 2400,
    "lines": 5,
    "level": 2,
    "ticks": 1247,
    "startedAt": 1692374400000,
    "lastInputAt": 1692374425000
  }

# Leaderboard sorted by score
leaderboard:scores
  ZADD leaderboard:scores 120000 alice 95000 bob 87000 charlie
```

**PostgreSQL Schema:**

```sql
CREATE TABLE games (
  id VARCHAR(50) PRIMARY KEY,
  player_id VARCHAR(50) NOT NULL,
  score INT NOT NULL,
  lines_cleared INT NOT NULL,
  max_level INT NOT NULL,
  duration_secs INT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NOT NULL,
  replay BYTEA,  -- compressed serialized moves
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_player_id (player_id),
  INDEX idx_score (score DESC),
  INDEX idx_ended_at (ended_at DESC)
);

CREATE TABLE player_statistics (
  player_id VARCHAR(50) PRIMARY KEY,
  total_games INT DEFAULT 0,
  high_score INT DEFAULT 0,
  avg_score INT DEFAULT 0,
  total_lines INT DEFAULT 0,
  longest_game_secs INT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE leaderboard_snapshots (
  snapshot_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  snapshot_date DATE NOT NULL,
  rankings JSONB NOT NULL,  -- [{rank, player_id, score}, ...]
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_snapshot_date (snapshot_date DESC)
);
```

### Why Redis for Active Games?
- ✅ Sub-millisecond reads for 60fps rendering
- ✅ Can handle concurrent updates (same session = single Redis key)
- ❌ PostgreSQL would struggle with per-tick writes
- ✅ Automatic TTL prevents stale sessions

### Replay Serialization
```java
// Compress move sequence for storage
games.replay = compress(Arrays.asList(
  new GameState(tick=0, piece="I", rotation=0, col=4, cleared=0),
  new GameState(tick=1, piece="I", rotation=0, col=5, cleared=0),
  new GameState(tick=7, piece="I", rotation=1, col=5, cleared=2)
));
```

---

## 🔌 API Routes & Contracts

### Tetris Platform API

```
POST   /api/v1/games
├─ Request:  { "playerId": "uuid", "difficulty": "EASY|NORMAL|HARD" }
├─ Response: { "sessionId": "uuid", "board": [...], "activePiece": {...}, "score": 0 }
└─ Effect:   Create game session in Redis

GET    /api/v1/sessions/{sessionId}
├─ Response: { "playerId", "score", "lines", "level", "board", "activePiece" }
└─ Latency:  < 10ms (single Redis GET)

POST   /api/v1/sessions/{sessionId}/input
├─ Request:  { "command": "LEFT|RIGHT|ROTATE|DOWN|DROP" }
├─ Response: { "board": [...], "activePiece": {...}, "score": 2400, "linesCleared": 5 }
├─ Latency:  < 5ms (command execution)
└─ Error:    410 Gone (game over or session expired)

GET    /api/v1/sessions/{sessionId}/replay
├─ Response: [
│     { "tick": 0, "command": "LEFT", "score": 0 },
│     { "tick": 1, "command": "ROTATE", "score": 0 },
│     { "tick": 7, "command": "DROP", "score": 100, "linesCleared": 1 }
│   ]
└─ Useful for: post-game analysis, VOD generation

POST   /api/v1/sessions/{sessionId}/end
├─ Request:  { "playerId": "uuid", "finalScore": 2400 }
├─ Response: { "gameId": "uuid", "rank": 42, "highScore": 25000 }
├─ Effect:   Archive to PostgreSQL, update leaderboard
└─ Idempotency-Key: {sessionId} (don't double-count score)

GET    /api/v1/leaderboard
├─ Query:    ?limit=100&period=daily|weekly|all_time
├─ Response: [
│     { "rank": 1, "playerId": "alice", "score": 120000, "gamesPlayed": 342 },
│     { "rank": 2, "playerId": "bob", "score": 95000, "gamesPlayed": 287 }
│   ]
└─ Cached in Redis for 5 minutes

WebSocket /ws/sessions/{sessionId}?playerId={uuid}
├─ Subscribe: game updates (if multiplayer/spectating)
├─ Broadcast: every N ticks (gravity tick at difficulty-dependent speed)
├─ Message:   { "type": "BOARD_UPDATE", "board": [...], "score": 2400 }
└─ Event:     "GAME_OVER" → { "finalScore": 2400, "rank": 42 }
```

### Input Buffering Protocol
```
Client sends: LEFT, ROTATE, LEFT (within 16ms)
Server queue: [LEFT, ROTATE, LEFT]
On next tick: Apply all buffered inputs, then gravity
Response: Board reflects all 3 inputs in one frame
```

---

## 🏗️ Service Architecture

### Event-Driven Tetris Platform

```
┌─────────────────────────────────┐
│   WebSocket Gateway             │
│  (connection pool, broadcast)   │
└──────────────┬──────────────────┘
               │
    ┌──────────┼──────────────────┬──────────────┐
    │          │                  │              │
┌───▼────────┐ │  ┌──────────────┐│  ┌──────────▼──┐
│GameService │ │  │ GameEngine   ││  │LeaderService│
│            │ │  │              ││  │             │
│ • Create   │ │  │ • Tick loop  ││  │ • Top 1000  │
│ • Archive  │ │  │ • Input      ││  │ • Snapshot  │
│ • Replay   │ │  │   processing ││  │ • Analytics │
└───┬────────┘ │  │ • Collision  ││  └──────────┬──┘
    │          │  │ • Row clear  ││             │
    │          │  │ • Scoring    ││             │
    │          │  └──────┬───────┘│             │
    │          │         │        │             │
    └──────────┼─────────┴────────┴─────────────┘
               │
        ┌──────▼──────────┐
        │ Redis + PgSQL   │
        │ + Kafka (events)│
        └─────────────────┘
```

### Service Responsibilities

| Service | Role | Handles |
|---|---|---|
| **GameService** | Lifecycle management | Create session, archive completed game, fetch replay |
| **GameEngine** | Real-time gameplay | Tick loop (60Hz), input processing, collision detection, scoring, row clearing |
| **RenderService** | State serialization | Convert board + pieces to JSON for client |
| **LeaderService** | Rankings & analytics | Update top 1000, archive snapshots, compute stats |
| **EventService** | Pub/Sub coordination | Broadcast tick updates via WebSocket, publish completion events |

### Tick-by-Tick Execution

```
Every 16ms (60fps):

1. Read buffered inputs from queue
   └─> e.g., [LEFT, ROTATE]

2. Apply inputs to activePiece
   ├─> Check collision with walls & board
   └─> Update activePiece position/rotation or discard invalid

3. Apply gravity (drop piece one row)
   ├─> Check collision
   ├─> If collision: lock piece to board, spawn new piece
   └─> If collision & can't spawn: game over

4. Check for complete rows
   ├─> Find all complete rows
   ├─> Remove them, drop rows above
   ├─> Award points: 100 × (lines²)
   └─> Update level if score threshold hit

5. Serialize game state
   └─> { board, activePiece, score, lines, level, ticks }

6. Save to Redis
   └─> SET session:{sessionId} <serialized state>

7. Publish to subscribers
   └─> WebSocket broadcast: { type: "TICK", board: [...], score: 2400 }

8. Check game-over condition
   └─> If activePiece can't spawn: end game, archive to PostgreSQL
```

### Example: Complete Game Session

```
Client:  POST /games → { playerId: "alice", difficulty: "NORMAL" }
Server:  Create session:abc in Redis
         Spawn initial piece (random Tetromino)
         Subscribe alice to WebSocket /ws/sessions/abc

Every 16ms:
  Gravity tick processes automatically
  Input queue drains (LEFT, ROTATE commands from alice)
  Board updates published to WebSocket
  State persisted to Redis

After 5 minutes (alice clears 10 lines, score=5000):
  alice sends: POST /sessions/abc/end { finalScore: 5000 }
  
  Server:
    ├─> Archive game to PostgreSQL
    ├─> Update leaderboard (alice now rank #47)
    ├─> Cache new leaderboard in Redis
    └─> Respond: { gameId: "g123", rank: 47, highScore: 25000 }
```

---

## 📐 Scalability & HLD Thinking

**Scalability:**
- Single-player game — no shared state, no coordination. Scales trivially: each game session is an isolated process/thread.
- For a **multiplayer competitive Tetris** (e.g., Tetris 99): each player's board is independent. Broadcast garbage lines via a **message queue** (Kafka topic per match). Consumers apply garbage lines to their board asynchronously.

**Latency:**
- Tick processing must complete in < 16ms for 60fps. The critical path: process input commands → apply gravity → check collisions → clear rows → update score → render. All O(rows × cols) = O(200) for a standard 10×20 board — well within budget.
- **Latency budget breakdown:**
  - Input processing: < 1ms
  - Gravity + collision: < 2ms
  - Row clearing: < 1ms
  - Render/state serialization: < 5ms
  - Total: < 10ms (leaves 6ms headroom)

**Consistency (Multiplayer):**
- In competitive mode, garbage line delivery must be **ordered** — use Kafka with a single partition per match to guarantee ordering. Eventual consistency is acceptable: a player may receive garbage lines 50ms late — imperceptible to humans.
- This is an **AP** choice (CAP theorem) — availability (game continues) over strict consistency (exact simultaneous state).

**Availability:**
- Single-player: no availability concern — game state is local.
- Multiplayer: match state in Redis. If the match server crashes, reconnecting clients restore state from Redis. Use **Redis persistence** (AOF) to survive restarts.

**Observability:**
- Metrics: active games, moves/sec, average game duration, lines cleared/sec, game-over rate
- Logs: `{ sessionId, event: "PIECE_PLACED|ROW_CLEARED|GAME_OVER", score, level, durationMs }`
- Trace: tick processing time histogram — alert if p99 tick > 14ms (approaching 16ms budget)

---

## 🗣️ How to Explain in the Interview

> "Each Tetromino subclass owns its shape and rotation logic — Open-Closed Principle. The `Command` pattern decouples input from game logic, enabling input buffering and replay. Rotation returns a new immutable instance — the board validates it before committing, so no rollback is needed. For multiplayer, I'd use Kafka with one partition per match to deliver garbage lines in order — eventual consistency is fine here since 50ms lag is imperceptible."
