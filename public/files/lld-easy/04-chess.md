---
tags: [lld, easy, game-design, amazon-interview]
---
# LLD: Design Chess Game

## 🎯 Why This Problem is Asked
Chess is the **gold standard** LLD game problem. It tests deep polymorphism (6 piece types with unique movement rules), the Command pattern (move history/undo), and state management (check, checkmate, stalemate). Amazon uses it to see if you can handle a complex domain without a monolithic `ChessGame` class.

---

## 📋 Requirements Clarification

**Functional:**
- 8×8 board, 2 players (White, Black)
- 6 piece types: King, Queen, Rook, Bishop, Knight, Pawn
- Validate legal moves per piece type
- Detect check, checkmate, stalemate
- Support castling, en passant, pawn promotion (mention, implement if time allows)

**Non-Functional:**
- In-memory, single machine
- Move history for undo/replay
- Move validation must complete in < 10ms

---

## 🧩 Core Entities & Enums

```java
public enum Color { WHITE, BLACK }
public enum PieceType { KING, QUEEN, ROOK, BISHOP, KNIGHT, PAWN }
public enum GameState { ACTIVE, CHECK, CHECKMATE, STALEMATE }

public class Position {
    private final int row; // 0-7
    private final int col; // 0-7
}

public abstract class Piece {
    protected Color color;
    protected Position position;
    protected boolean hasMoved; // for castling, pawn double-move

    public abstract PieceType getType();
    public abstract List<Position> getLegalMoves(Board board);
}

public class Board {
    private final Piece[][] grid = new Piece[8][8];
}

public class Move {
    private final Piece piece;
    private final Position from, to;
    private final Piece capturedPiece; // null if no capture
    private final boolean isCastling;
    private final boolean isEnPassant;
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Polymorphism (Piece Movement)

Each piece encapsulates its own movement rules — `Board` never contains movement logic.

```java
public class Rook extends Piece {
    @Override
    public List<Position> getLegalMoves(Board board) {
        List<Position> moves = new ArrayList<>();
        int[][] directions = {{1,0},{-1,0},{0,1},{0,-1}};
        for (int[] dir : directions) {
            int r = position.getRow() + dir[0];
            int c = position.getCol() + dir[1];
            while (isInBounds(r, c)) {
                Piece target = board.getPiece(r, c);
                if (target == null) {
                    moves.add(new Position(r, c));
                } else {
                    if (target.getColor() != this.color)
                        moves.add(new Position(r, c)); // capture
                    break; // blocked
                }
                r += dir[0]; c += dir[1];
            }
        }
        return moves;
    }
}

public class Knight extends Piece {
    private static final int[][] OFFSETS =
        {{-2,-1},{-2,1},{-1,-2},{-1,2},{1,-2},{1,2},{2,-1},{2,1}};

    @Override
    public List<Position> getLegalMoves(Board board) {
        return Arrays.stream(OFFSETS)
            .map(o -> new Position(position.getRow()+o[0], position.getCol()+o[1]))
            .filter(p -> isInBounds(p) && !isFriendlyOccupied(board, p))
            .collect(Collectors.toList());
    }
}
```

**Why polymorphism instead of a switch?** Adding a new piece means adding one class. A switch in `Board` would require modifying existing code — violating Open-Closed.

### Pattern: Command (Move History & Undo)

```java
public interface ChessCommand {
    void execute(Board board);
    void undo(Board board);
}

public class MoveCommand implements ChessCommand {
    private final Move move;

    public void execute(Board board) { board.applyMove(move); }

    public void undo(Board board) {
        board.reverseMove(move); // restore piece, restore captured piece
    }
}

public class GameHistory {
    private final Deque<ChessCommand> history = new ArrayDeque<>();

    public void executeMove(ChessCommand cmd, Board board) {
        cmd.execute(board);
        history.push(cmd);
    }

    public void undoLastMove(Board board) {
        if (!history.isEmpty()) history.pop().undo(board);
    }
}
```

### Check Detection

```java
public class CheckDetector {
    public boolean isInCheck(Board board, Color kingColor) {
        Position kingPos = board.findKing(kingColor);
        Color opponentColor = (kingColor == Color.WHITE) ? Color.BLACK : Color.WHITE;

        return board.getAllPieces(opponentColor).stream()
            .anyMatch(p -> p.getLegalMoves(board).contains(kingPos));
    }

    public boolean isCheckmate(Board board, Color color) {
        if (!isInCheck(board, color)) return false;
        return board.getAllPieces(color).stream()
            .allMatch(p -> getMovesNotLeavingCheck(board, p, color).isEmpty());
    }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Move leaves own King in check | Filter out such moves in `getLegalMoves` |
| Castling | King & Rook haven't moved, no pieces between, King not in check |
| En passant | Track last pawn double-move in `GameState` |
| Pawn promotion | Prompt player to choose piece; default to Queen |
| Stalemate | No legal moves but not in check |

---

## �️ Database Design

### Enterprise Chess Platform Schema

| Layer | Database | Rationale |
|---|---|---|
| **Active games** | Redis | In-progress game state — O(1) access per move. Serialize board + move history: `game:{gameId} → {board, players, moves, status, lastMoveAt}` |
| **Move history** | PostgreSQL | Permanent game record for replay, analysis, opening book. `moves(id, game_id, from, to, piece, captured_piece, sequence, timestamp)` |
| **User stats & ratings** | PostgreSQL + Redis Cache | ELO rating, game count, win rate. Cache in Redis for leaderboard queries |
| **Opening book** | PostgreSQL or SQLite | Pre-computed first 10-15 moves (standard openings). Read-only, cached at app startup |

**Schema & Rationale:**

```redis
# Active game state — TTL 604800s (7 days)
game:{gameId}
  {
    "players": [
      { "id": "p1", "name": "Alice", "color": "WHITE", "rating": 2100 },
      { "id": "p2", "name": "Bob", "color": "BLACK", "rating": 1950 }
    ],
    "board": [
      ["r", "n", "b", "q", "k", "b", "n", "r"],
      ["p", "p", "p", "p", "p", "p", "p", "p"],
      [null, null, null, null, null, null, null, null],
      ...
    ],
    "moveHistory": [
      {"from": "e2", "to": "e4", "piece": "P", "capturedPiece": null, "check": false},
      {"from": "c7", "to": "c5", "piece": "p", "capturedPiece": null, "check": false}
    ],
    "currentPlayerColor": "WHITE",
    "status": "ACTIVE",
    "check": false,
    "checkmate": false,
    "createdAt": 1692374400000,
    "lastMoveAt": 1692374425000
  }

# Player-to-game index
player:{playerId}:active_games → [gameId1, gameId2]

# Real-time leaderboard (ELO ratings)
leaderboard:elo
  ZADD leaderboard:elo 2500 kasparov 2475 fischer 2450 carlsen
```

**PostgreSQL Schema:**

```sql
CREATE TABLE games (
  id VARCHAR(50) PRIMARY KEY,
  white_player_id VARCHAR(50) NOT NULL,
  black_player_id VARCHAR(50) NOT NULL,
  result VARCHAR(10),  -- "WHITE_WIN", "BLACK_WIN", "DRAW", "ABANDONED"
  termination_reason VARCHAR(50),  -- "CHECKMATE", "RESIGNATION", "TIMEOUT", "STALEMATE"
  white_elo_before INT,
  black_elo_before INT,
  white_elo_after INT,
  black_elo_after INT,
  elo_change INT,
  time_control VARCHAR(20),  -- "5+3", "10+0", "Classical"
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_secs INT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_white_player (white_player_id),
  INDEX idx_black_player (black_player_id),
  INDEX idx_ended_at (ended_at DESC)
);

CREATE TABLE moves (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  game_id VARCHAR(50) NOT NULL REFERENCES games(id),
  sequence INT NOT NULL,  -- move number
  from_pos VARCHAR(2) NOT NULL,  -- "e2"
  to_pos VARCHAR(2) NOT NULL,    -- "e4"
  piece CHAR NOT NULL,           -- "P", "N", "B", ...
  captured_piece CHAR,           -- null if no capture
  check BOOLEAN DEFAULT FALSE,
  checkmate BOOLEAN DEFAULT FALSE,
  castling BOOLEAN DEFAULT FALSE,
  en_passant BOOLEAN DEFAULT FALSE,
  pawn_promoted_to CHAR,         -- "Q", "R", "B", "N"
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX idx_game_id (game_id),
  INDEX idx_sequence (sequence)
);

CREATE TABLE player_ratings (
  player_id VARCHAR(50) PRIMARY KEY,
  current_rating INT NOT NULL,
  peak_rating INT,
  total_games INT DEFAULT 0,
  wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  losses INT DEFAULT 0,
  win_rate DECIMAL(5, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE opening_book (
  id INT PRIMARY KEY AUTO_INCREMENT,
  move_sequence VARCHAR(500) NOT NULL,  -- "e2e4 c7c5 g1f3 d7d6"
  opening_name VARCHAR(100),            -- "Sicilian Defense"
  frequency INT,  -- how many master games used this opening
  INDEX idx_sequence (move_sequence(10))
);
```

### Why Redis + PostgreSQL?
- **Redis:** Every move must be < 100ms. Storing 2000 characters of game state in Redis is instant
- **PostgreSQL:** Archival, historical analysis, ELO calculation (batch job)
- **Hybrid:** Write to both for durability — Redis for latency, PostgreSQL for analytics

---

## 🔌 API Routes & Contracts

### Professional Chess Platform API

```
POST   /api/v1/games
├─ Request:  { 
│     "whitePlayerId": "uuid", 
│     "blackPlayerId": "uuid", 
│     "timeControl": "5+3" // 5min + 3sec per move
│   }
├─ Response: { 
│     "gameId": "uuid", 
│     "board": [...], 
│     "status": "ACTIVE",
│     "whiteToMove": true
│   }
└─ Effect:   Create game in Redis, publish to both players' WebSocket

GET    /api/v1/games/{gameId}
├─ Response: { 
│     "gameId", 
│     "players": [{id, name, rating, color}, ...],
│     "board": [...],
│     "moveHistory": [...],
│     "status": "ACTIVE|CHECK|CHECKMATE|STALEMATE|DRAW|ABANDONED",
│     "whiteToMove": true,
│     "timeRemaining": { "white": 250000, "black": 180000 }
│   }
└─ Latency:  < 20ms (Redis GET)

POST   /api/v1/games/{gameId}/moves
├─ Request:  { 
│     "playerId": "uuid", 
│     "from": "e2", 
│     "to": "e4",
│     "promotion": "Q"  // if pawn promotion
│   }
├─ Response: { 
│     "board": [...],
│     "moveHistory": [...],
│     "status": "ACTIVE|CHECK|CHECKMATE|DRAW",
│     "check": true,
│     "whiteToMove": false
│   }
├─ Error:    400 Illegal move (validate in service)
├─ Error:    409 Not your turn
├─ Error:    410 Game already over
└─ Idempotency: use (gameId + playerId + moveNum) as idempotency key

GET    /api/v1/games/{gameId}/pgn
├─ Response: [PGN format]
│   [Event "Chess.com"]
│   [Site "Online"]
│   [White "Alice"]
│   [Black "Bob"]
│   [Result "1-0"]
│   1. e4 c5 2. Nf3 d6 3. ...
└─ Standard format for sharing/analysis

POST   /api/v1/games/{gameId}/resign
├─ Request:  { "playerId": "uuid" }
├─ Response: { "result": "WHITE_WIN|BLACK_WIN", "reason": "RESIGNATION" }
└─ Effect:   End game, update ELO ratings, archive to PostgreSQL

POST   /api/v1/games/{gameId}/draw-offer
├─ Request:  { "playerId": "uuid", "accept": true|false }
├─ Response: { "result": "DRAW" | "DRAW_REJECTED" }
└─ Broadcast: Both players notified

GET    /api/v1/games/{gameId}/analysis
├─ Query:    ?engine=stockfish&depth=20
├─ Response: {
│     "moves": [
│       { "move": "e2-e4", "eval": "+0.5", "bestContinuation": ["c7-c5", "g1-f3", ...] },
│       ...
│     ]
│   }
└─ Optional: Expensive operation, cache for 24 hours

GET    /api/v1/players/{playerId}/stats
├─ Response: { 
│     "rating": 2100, 
│     "peakRating": 2150, 
│     "games": 342, 
│     "wins": 155, 
│     "draws": 87, 
│     "losses": 100, 
│     "winRate": 45.3 
│   }
└─ Cached in Redis for 1 hour

WebSocket /ws/games/{gameId}?playerId={uuid}&token={jwt}
├─ Subscribe: player receives real-time updates
├─ Message:   { "type": "MOVE", "from": "e2", "to": "e4", "board": [...] }
├─ Message:   { "type": "CHECK", "player": "black", "position": "e8" }
├─ Message:   { "type": "TIME_UPDATE", "white": 250000, "black": 180000 }
└─ Event:     "GAME_OVER" → { "result": "WHITE_WIN", "reason": "CHECKMATE" }
```

---

## 🏗️ Service Architecture

### Domain-Driven Chess Service

```
┌─────────────────────────────────────────┐
│      API Gateway (rate limit: 1000/min) │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┬──────────┬───────────┐
    │          │          │          │           │
┌───▼────────┐ │ ┌───────▼──────┐ ┌─▼──────────┐ │
│GameService │ │ │MoveValidator ││ │ELOService  │ │
│            │ │ │              ││ │            │ │
│ • Create   │ │ │ • Legal move?││ │ • Calculate│ │
│ • Archive  │ │ │ • Check?     ││ │   ELO  │ │
│ • Resign   │ │ │ • Stalemate? ││ │ • Update   │ │
│            │ │ │ • Validate   ││ │            │ │
│            │ │ │   promotion  ││ │            │ │
└───┬────────┘ │ └───────┬──────┘ └────────┬────┘ │
    │          │         │                │     │
    │          │ ┌───────▼──────┐  ┌──────▼───┐ │
    │          │ │TimeService   │  │CheckDetec││ │
    │          │ │              │  │          │ │
    │          │ │ • Track time │  │ • Detect │ │
    │          │ │ • Timeout?   │  │   check  │ │
    │          │ │ • Increment  │  │ • Detect │ │
    │          │ │   clock      │  │   mate   │ │
    │          │ └──────────────┘  └──────────┘ │
    │          │                                │
    └──────────┼────────────────────────────────┘
               │
        ┌──────▼──────────────┐
        │ Redis + PostgreSQL  │
        │ + Kafka (events)    │
        └─────────────────────┘
```

### Service Responsibilities

| Service | Responsibility | Uses |
|---|---|---|
| **GameService** | Lifecycle: create, archive, resign, draw | Redis, PostgreSQL |
| **MoveValidator** | Legal move check, special moves (castling, en passant) | Board state, piece rules |
| **CheckDetector** | Detect check/checkmate/stalemate/draw | Board state, attack map |
| **TimeService** | Time management, clock increment, timeout | Redis (per-game timer) |
| **ELOService** | Rating calculation, leaderboard updates | PostgreSQL (ratings table) |
| **ReplayService** | Generate PGN, move list, analysis | PostgreSQL (moves table) |

### Move Validation Pipeline

```
POST /games/g123/moves { playerId: p1, from: "e2", to: "e4" }
    │
    ├─> GameService.validatePlayerTurn(g123, p1) ✓
    │
    ├─> TimeService.checkTimeRemaining(p1)
    │   └─> If expired: return 410 "Time forfeit"
    │
    ├─> MoveValidator.isLegalMove(board, e2, e4, whitePiece)
    │   ├─> Check target square not occupied by own piece ✓
    │   ├─> Check piece can move to target (Pawn? Rook? Knight?) ✓
    │   ├─> Check path is clear (no pieces blocking) ✓
    │   ├─> If pawn to rank 8: check promotion type (Q/R/B/N) ✓
    │   ├─> CRUCIAL: check move doesn't leave/put own King in check
    │   │   └─> CheckDetector.isKingInCheckAfterMove(board, move) ✗ → reject
    │   └─> Return: { legal: true, capturedPiece: null }
    │
    ├─> Board.applyMove(move, promotionType)
    │   └─> Update board[e4] = piece, board[e2] = null
    │
    ├─> CheckDetector.isInCheck(board, BLACK)
    │   └─> Returns: true (White moved Pawn to e4, no direct check)
    │
    ├─> GameService.applyMove(g123, move)
    │   └─> Redis SET game:g123 { board: updated, moves: appended, whiteToMove: false }
    │
    ├─> TimeService.addIncrementAndSwitch(p1, +3sec)
    │   └─> Redis INCR game:g123:blackTime by 3000ms
    │
    ├─> CheckDetector.isCheckmate(board, BLACK)
    │   ├─> Is BLACK in check? No
    │   └─> Returns: false
    │
    ├─> Publish event: game:g123:updates
    │   └─> { type: "MOVE", from: "e2", to: "e4", check: false }
    │
    └─> WebSocket push to both players
        └─> { type: "MOVE", from: "e2", to: "e4", board: [...], blackToMove: true }

Response: 200 { board: [...], status: "ACTIVE", check: false, blackToMove: true }
```

### Example: Checkmate Detection

```
Black tries: King h8 to h7 (only legal move)
GameService applies move
    │
    ├─> CheckDetector.isInCheck(board, WHITE) ✓
    │
    ├─> CheckDetector.getAllLegalMoves(board, WHITE)
    │   └─> Returns: []  (empty — no legal moves)
    │
    └─> status = CHECKMATE
        └─> Broadcast: { result: "BLACK_WIN", reason: "CHECKMATE" }
        └─> Archive game, update ELO ratings, store in PostgreSQL
```

---

## �📐 Scalability & HLD Thinking

**Scalability:**
- Chess is a 2-player session — stateless between moves. Store game state in **Redis** (serialized board + move history). Route all moves for a `gameId` to the same instance via **consistent hashing** — or make it fully stateless by loading from Redis on every move.
- For a chess platform (e.g., Chess.com scale — 10M concurrent games): Redis Cluster with sharding by `gameId`. Each shard handles ~1M games. Read/write per move is a single Redis hash operation — O(1).

**Consistency:**
- Move validation requires **strong consistency** — both players must see the same board state. Use a **Redis transaction** (`WATCH gameId MULTI EXEC`) to atomically validate and apply a move. If another move was applied concurrently (shouldn't happen in chess, but defensive coding), the transaction fails and the client retries.
- **CP choice** — a move failing is acceptable; an illegal board state is not.

**Latency:**
- Move validation: O(64) worst case (check detection scans all opponent pieces). For a standard board with ~16 pieces, this is ~16 × 28 = ~448 position checks — microseconds.
- **Latency budget:** move received → validate → persist → broadcast to opponent < 100ms. Breakdown: validation 1ms, Redis write 5ms, WebSocket push 2ms, network 20ms. Total: ~30ms.
- For real-time feel: use **WebSockets** (persistent connection) instead of HTTP polling. Push opponent's move immediately on receipt.

**Availability:**
- Game state in Redis with **AOF persistence** (append-only file) — survives restarts without data loss.
- If a player disconnects mid-game: game state persists in Redis with a 24-hour TTL. Player reconnects, loads state, resumes.
- **Graceful degradation:** if Redis is unavailable, reject new games but allow in-progress games to continue using in-memory state (accept potential data loss on crash).

**Observability:**
- Metrics: active games, moves/sec, average game duration, checkmate rate, disconnect rate
- Logs: `{ gameId, playerId, move: "e2-e4", isCheck, isCheckmate, validationMs, persistMs }`
- Distributed trace: client → WebSocket server → validation service → Redis → opponent push
- Alert: move validation p99 > 50ms, Redis write error rate > 0.1%

---

## 🗣️ How to Explain in the Interview

> "Each `Piece` subclass owns its movement logic — the `Board` is just a data structure. The `Command` pattern gives me move history and undo for free. For a real platform, I'd store game state in Redis and use WebSockets for real-time move delivery. Move validation requires strong consistency — I'd use a Redis transaction to atomically validate and apply each move. This is a CP choice: a move failing is better than an illegal board state."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | `Piece` moves, `CheckDetector` validates check, `GameHistory` tracks history |
| **O** | New piece type = new class, no changes to `Board` |
| **L** | Any `Piece` subclass works wherever `Piece` is expected |
| **D** | `GameEngine` depends on `CheckDetector` interface, not concrete impl |
