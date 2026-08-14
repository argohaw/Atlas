---
tags: [lld, advanced, system-design, zoom, video-conferencing]
---
# LLD: Design Video Conferencing (Zoom-like)

## 🎯 Why This Problem is Asked
Video conferencing tests:
- Real-time media pipelines
- Bandwidth adaptation
- Group participant fan-out
- low-latency signaling
- scaling to millions of participants

Common interview themes: SFU vs MCU, adaptive bitrate, signaling, recording, and latency optimization.

---

## 📋 Requirements Clarification

### Functional
- Join and leave calls
- audio/video streaming
- screen sharing
- chat, reactions, host controls
- recording and playback
- breakout rooms or multicast group calls

### Non-Functional
- Sub-second startup latency
- low packet loss under network variation
- support large meetings with many participants
- graceful degradation under poor network

---

## 🧩 Core Entities

```java
public enum MediaKind { AUDIO, VIDEO, SCREEN_SHARE }
public enum ParticipantRole { HOST, PARTICIPANT }
public enum CallState { CREATED, ACTIVE, ENDED }

public class Meeting {
    private String meetingId;
    private String hostUserId;
    private Map<String, Participant> participants;
    private long startedAtMs;
    private CallState state;
}

public class Participant {
    private String userId;
    private String clientId;
    private ParticipantRole role;
    private String selectedRoute; // SFU/MCU route
    private Map<String, Stream> streams;
}

public class Stream {
    private String streamId;
    private MediaKind kind;
    private int bitrateKbps;
    private String codec;
    private long createdAtMs;
}
```

---

## 🏗️ LLD Patterns

### 1. Selective Forwarding Unit (SFU)
Instead of relaying each stream through a central MCU, the server forwards selected streams to each participant.

```java
public class SFUManager {
    private final Map<String, Meeting> meetings;

    public List<String> getForwardTargets(String meetingId, String senderId) {
        Meeting meeting = meetings.get(meetingId);
        return meeting.getParticipants().keySet().stream()
            .filter(id -> !id.equals(senderId))
            .toList();
    }
}
```

### 2. Adaptive Bitrate
Each client reports available bandwidth and packet loss; the server or client downshifts bitrate accordingly.

```java
public class AdaptiveBitrateController {
    public int chooseBitrate(int networkBandwidthKbps, int packetLossPct) {
        if (packetLossPct > 15) return 200;
        if (networkBandwidthKbps < 700) return 400;
        if (networkBandwidthKbps < 1500) return 800;
        return 1600;
    }
}
```

### 3. Media Session / Signaling
A signaling layer handles join, ICE, SDP exchange, and control messages.

```java
public class SignalingService {
    public void negotiate(String userId, String meetingId, String offerSdp) {
        // exchange SDP/ICE candidates using WebSocket or long-polling
    }
}
```

---

## 🗄️ Database Design

```sql
CREATE TABLE meetings (
  meeting_id UUID PRIMARY KEY,
  host_user_id UUID NOT NULL,
  state VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);

CREATE TABLE meeting_participants (
  meeting_id UUID REFERENCES meetings(meeting_id),
  user_id UUID NOT NULL,
  role VARCHAR(20),
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  PRIMARY KEY (meeting_id, user_id)
);

CREATE TABLE media_sessions (
  session_id UUID PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(meeting_id),
  user_id UUID NOT NULL,
  kind VARCHAR(20),
  codec VARCHAR(50),
  bitrate_kbps INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE meeting_events (
  event_id UUID PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(meeting_id),
  user_id UUID,
  event_type VARCHAR(40),
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Redis caches:
- active meeting participants
- ICE connection state
- presence / online status
- RTCP feedback summaries

---

## 🔌 API Routes & Contracts

```
POST /v1/meetings
Request: { "title": "Sprint Demo", "hostUserId": "u-1" }
Response: { "meetingId": "m-21" }

POST /v1/meetings/{meetingId}/join
Request: { "userId": "u-2", "clientId": "c-45" }
Response: { "token": "jwt-abc", "role": "PARTICIPANT" }

POST /v1/meetings/{meetingId}/stream
Request: { "userId": "u-2", "kind": "VIDEO", "bitrateKbps": 1200 }

GET /v1/meetings/{meetingId}/participants
Response: { "participants": ["u-1", "u-2", "u-3"] }
```

WebSocket / signaling transports:
- join/leave events
- ICE candidate exchange
- mute/unmute, screen-share toggles
- reaction events

---

## 🏗️ Service Architecture

```text
Client Apps
   |
   v
API Gateway
   |
   +--> Meeting Service
   +--> Signaling Service
   +--> Media Relay Service
   |
   +--> Redis / Presence
   +--> PostgreSQL (meeting metadata)
   +--> Object Storage (recordings)
```

### Call flow
1. Host creates meeting
2. User joins through signaling service
3. Media server allocates stream routes
4. SFU forwards selected video/audio to each participant
5. Bandwidth controller reduces quality when needed
6. Recording service stores conference sessions to object storage

---

## 📐 HLD Concepts & Scalability

### SFU vs MCU
- SFU: lower CPU, better for large meetings, cleaner scaling
- MCU: easier for centralized processing, higher compute cost

### Latency controls
- Use UDP where possible for media packets
- Prefer p2p/direct media when network conditions allow
- keep signaling separate from media path

### Backup / failover
- meeting state in DB, media routing in memory
- if relay node fails, reassign streams to another relay

---

## 🗣️ How to Explain in the Interview

> "I would split this into signaling, media relay, and recording. Signaling manages session setup and control messages; media relay handles actual audio/video streams using an SFU for efficient fan-out. This allows a large meeting to scale without sending every stream to every participant through a single bottleneck."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | MeetingService, SignalingService, RelayService separate concerns |
| O | New media kind or control action can be added without rewriting the core |
| D | Services depend on interfaces for storage, relay, and signaling |
| I | Roles and capabilities are separated between meeting controls and media handling |

---

## ⚠️ Follow-up Questions
- How do you handle large meetings with 1,000+ participants?
- How do you route media around network congestion?
- How do you record and replay sessions later?
- How do you reduce latency under packet loss?

---

## 🔥 Deep Dive: Production Realities for Video Conferencing

### 1. Media Plane vs Control Plane
A conferencing system separates:
- control plane: join/leave, host controls, reactions, signaling
- media plane: actual audio/video RTP/RTCP streams

This is essential because the media plane can be optimized separately from connection metadata and session management.

### 2. SFU vs MCU Trade-offs
- SFU is usually better for large meetings because it streams one inbound feed to many outbound endpoints with less CPU pressure.
- MCU is simpler for centralized mixing but expensive at scale.
- Many production systems blend both: p2p for small meetings, SFU for large meetings.

### 3. Adaptive Bitrate and Congestion Control
For real-time media, bandwidth estimation is critical:
- if packet loss rises, reduce video bitrate
- if RTT increases, prioritize audio over video
- use a fallback to lower resolution or lower frame rate before dropping users

Network quality is dynamic, so a static bitrate is never enough.

### 4. Recording and Replay
Recording is often done by a separate recorder service that taps incoming streams and writes them to object storage in real time. This service must handle:
- multiple tracks from many users
- synchronization across streams
- encoding to HLS or MP4 after the call ends

### 5. Failure Modes
A relay can fail, a client can drop, or network conditions can degrade. System resilience needs:
- stream re-routing to a new media relay
- reconnection with ICE candidate updates
- call state recovery from the meeting DB if a relay crashes

### 6. Capacity Planning
At 10k+ users in one large call:
- relay bandwidth becomes the bottleneck
- CPU per stream and fan-out per participant are major costs
- large meetings often require regional routing and partitioning by geography

### 7. Interview Answer Template
> "I’d split the system into signaling, media relay, and recording. Signaling handles session setup and control events; the media relay routes RTP streams via SFU to keep fan-out efficient; and recording is an asynchronous service that writes mixed or separate streams to object storage. Adaptive bitrate and packet-loss control are essential for stable quality, and regional relay placement helps reduce latency in large meetings."
