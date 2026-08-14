---
tags: [lld, advanced, system-design, game-engine, real-time]
---
# LLD: Design Game Engine

## 🎯 Why This Problem is Asked
Game engines test real-time simulation, synchronization, prediction, and state authority. They combine networking, physics, and client/server consistency under tight latency constraints.

---

## 📋 Requirements Clarification

### Functional
- move entities, fire actions, collisions, damage, respawn
- multiplayer synchronization across clients
- leaderboard, match state, inventory
- minimize perceived lag

### Non-Functional
- 60 FPS gameplay feel
- low latency under packet loss
- fair server-authoritative rules

---

## 🧩 Core Entities

```java
public enum EntityType { PLAYER, NPC, PROJECTILE }
public enum InputAction { MOVE, JUMP, SHOOT, DASH }

public class Player {
    private String playerId;
    private Vec3 position;
    private Vec3 velocity;
    private int health;
    private Inventory inventory;
}

public class Match {
    private String matchId;
    private Map<String, Player> players;
    private long tick;
    private MatchState state;
}

public class InputFrame {
    private String playerId;
    private long tick;
    private List<InputAction> actions;
    private Vec2 moveVector;
}
```

---

## 🏗️ LLD Patterns

### 1. Client Prediction
The client simulates movement locally before server confirms.

```java
public class ClientPredictor {
    public void predict(Player p, InputFrame frame) {
        p.setPosition(p.getPosition().add(frame.getMoveVector()));
    }
}
```

### 2. Server Authority
The authoritative server validates all state-changing commands and resolves conflicts.

```java
public class ServerPhysicsEngine {
    public void advance(Match match) {
        for (Player p : match.getPlayers().values()) {
            // apply gravity, collisions, damage
        }
    }
}
```

### 3. Reconciliation
If the server state differs, the client corrects after receiving authoritative snapshots.

---

## 🗄️ Database Design

```sql
CREATE TABLE matches (
  match_id UUID PRIMARY KEY,
  state VARCHAR(20),
  tick BIGINT,
  started_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE players (
  player_id UUID PRIMARY KEY,
  match_id UUID REFERENCES matches(match_id),
  health INT,
  x DOUBLE PRECISION,
  y DOUBLE PRECISION,
  z DOUBLE PRECISION,
  inventory_json JSONB
);

CREATE TABLE match_events (
  event_id UUID PRIMARY KEY,
  match_id UUID REFERENCES matches(match_id),
  event_type VARCHAR(30),
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Redis stores ephemeral state: live match snapshots, matchmaking, and leaderboards.

---

## 🔌 API Routes & Contracts

```
POST /v1/matches
Response: { "matchId": "m-1" }

POST /v1/matches/{matchId}/input
Request: { "playerId": "p-2", "tick": 1342, "actions": ["MOVE", "JUMP"] }

GET /v1/matches/{matchId}/state
Response: { "tick": 1350, "players": [ ... ] }
```

---

## 🏗️ Service Architecture

```text
Client + Renderer
   |
   v
Matchmaking + Session Service
   |
   v
Game Simulation Server
   |
   +--> State Store / Redis
   +--> Match DB
   +--> Event Bus for gameplay events
```

---

## 📐 HLD Concepts

- Lockstep or snapshot-based simulation for deterministic rules
- state interpolation to smooth jitter
- authority at server to prevent cheating
- tick-based updates with delta compression

---

## 🗣️ How to Explain in the Interview

> "A game engine is basically a distributed simulation system with strong real-time requirements. I would keep the server authoritative, use client prediction for responsiveness, and then reconcile server state on the next snapshot. This gives fast gameplay without letting clients cheat or create inconsistent world state."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | Matchmaking, simulation, and event services are separate |
| O | New gameplay systems can be added without changing core loop |
| D | Input handlers depend on abstractions, not raw networking |

---

## ⚠️ Follow-up Questions
- How do you handle lag and packet loss?
- How do you prevent cheating?
- How do you shard matches across regions?

---

## 🔥 Deep Dive: Production Realities for Game Engines

### 1. Simulation Tick Model
Game logic often runs in discrete ticks. A typical model is:
- server tick every 20-50 ms
- input buffer per player
- world state updates to all clients
- snapshot interpolation to smooth movement between ticks

This provides deterministic behavior and easier replay for debugging.

### 2. Client Prediction and Server Reconciliation
The best real-time game systems combine:
- client prediction for responsiveness
- server authority to reject invalid states
- reconciliation to correct drift when server state differs

Without this, movement appears laggy or inconsistent, and cheating becomes possible.

### 3. Cheat Prevention
The server must validate all player actions because clients cannot be trusted. That includes:
- checking movement ranges and valid action sequences
- validating attack ranges / hitboxes
- rejecting impossible state transitions

A command log helps investigate suspicious behavior and supports anti-cheat analytics.

### 4. Session Sharding and Matchmaking
Game sessions are usually sharded by region and match id. This ensures:
- low latency for players in the same area
- less cross-region state synchronization
- easier rebalance when a game server becomes overloaded

### 5. Interview Answer Template
> "I’d keep the game server authoritative and use client prediction for responsiveness. The client simulates movement locally, but every action is validated by the server before it changes the world state. The match is run in fixed ticks, and snapshots are sent to players with interpolation so the game feels smooth even under jitter."
