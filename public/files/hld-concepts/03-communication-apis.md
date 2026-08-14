---
tags: [hld, networking, communication, amazon-interview]
---
# HLD: Communication & APIs — DNS, HTTP, REST vs gRPC, Gateways, Proxies

## 🎯 Why This Section Matters
Every request in your system travels through DNS → HTTP → API Gateway → Service. Understanding each hop lets you answer: *"Where does latency come from?"*, *"Where do I add auth?"*, and *"Why did I choose REST over gRPC?"* — all common Amazon follow-up questions.

---

## 🌐 DNS (Domain Name System)

**Definition:** Translates human-readable hostnames (`api.amazon.com`) into IP addresses (`54.239.28.85`).

### How a DNS Lookup Works

```
Browser                Recursive Resolver       Root NS      TLD NS      Auth NS
   │                         │                     │            │            │
   │── "api.amazon.com?" ───►│                     │            │            │
   │                         │── "amazon.com?" ───►│            │            │
   │                         │◄── ".com NS" ────────│            │            │
   │                         │── "amazon.com?" ──────────────►  │            │
   │                         │◄── "amazon.com NS" ──────────────│            │
   │                         │── "api.amazon.com?" ──────────────────────►   │
   │                         │◄── "54.239.28.85" ────────────────────────────│
   │◄── "54.239.28.85" ──────│
```

### TTL (Time to Live)
DNS records have a TTL — how long resolvers cache the answer.
- Short TTL (30s): fast failover, but more DNS queries (higher latency)
- Long TTL (300s): fewer queries, but slow to update during incidents

### DNS for Load Distribution

**Round-Robin DNS:** Return multiple IPs; clients pick one.
```
api.amazon.com → [54.1.1.1, 54.1.1.2, 54.1.1.3]
```

**Geo DNS:** Return different IPs based on client location.
```
US client  → us-east-1 load balancer
EU client  → eu-west-1 load balancer
```

**Health-check-based DNS (Route 53):** Automatically remove unhealthy IPs from DNS responses.

> *"I'll use Route 53 with latency-based routing. US users resolve to us-east-1, EU users to eu-west-1. If us-east-1 goes down, Route 53 health checks detect it within 30 seconds and route all traffic to eu-west-1."*

---

## 🔒 HTTP / HTTPS

### HTTP Request Lifecycle
```
Client                          Server
  │── TCP SYN ──────────────────►│
  │◄── TCP SYN-ACK ──────────────│
  │── TCP ACK ──────────────────►│   (TCP handshake: ~1 RTT)
  │── TLS ClientHello ──────────►│
  │◄── TLS ServerHello + Cert ───│
  │── TLS Finished ─────────────►│   (TLS handshake: ~1-2 RTT)
  │── GET /api/products HTTP/1.1►│
  │◄── 200 OK + body ────────────│
```

### HTTP Versions

| Version | Key Feature | Use Case |
|---|---|---|
| HTTP/1.1 | Persistent connections, pipelining | Legacy, still common |
| HTTP/2 | Multiplexing (multiple requests on one connection), header compression | REST APIs, web |
| HTTP/3 | QUIC (UDP-based), 0-RTT reconnect | Mobile, high-latency networks |

### HTTPS & TLS
- TLS encrypts data in transit — prevents eavesdropping and MITM attacks
- TLS 1.3 reduces handshake to 1 RTT (vs 2 RTT for TLS 1.2)
- **Certificate pinning:** Client validates server cert against a known fingerprint — prevents cert substitution attacks

### Status Codes to Know

| Code | Meaning | When to Use |
|---|---|---|
| 200 | OK | Successful GET/PUT |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input from client |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, optimistic lock failure |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server failure |
| 503 | Service Unavailable | Overloaded or down |

---

## 🔌 REST vs gRPC

### REST (Representational State Transfer)

```
GET    /users/{id}           → fetch user
POST   /users                → create user
PUT    /users/{id}           → update user
DELETE /users/{id}           → delete user
```

**Characteristics:**
- HTTP/1.1 or HTTP/2, JSON payload
- Human-readable, easy to debug with curl/Postman
- Stateless — each request is self-contained
- Widely supported by every language and framework

**Weaknesses:**
- JSON parsing overhead (text-based)
- No built-in streaming
- No contract enforcement (OpenAPI helps but isn't enforced at runtime)

### gRPC (Google Remote Procedure Call)

```protobuf
service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc StreamUsers(Empty) returns (stream User);  // server streaming
}

message GetUserRequest { string user_id = 1; }
message User { string id = 1; string name = 2; int32 age = 3; }
```

**Characteristics:**
- HTTP/2 (multiplexing, binary framing)
- Protocol Buffers (binary serialization — 3–10x smaller than JSON)
- Strongly typed contract (`.proto` file is the source of truth)
- Supports 4 communication patterns: unary, server streaming, client streaming, bidirectional streaming
- Code generation for client/server in any language

**Weaknesses:**
- Not human-readable (binary)
- Browser support requires gRPC-Web proxy
- Harder to debug without tooling

### Decision Matrix

| Scenario | Choose |
|---|---|
| Public API consumed by third parties | REST — universally supported, easy to document |
| Internal microservice-to-microservice | gRPC — performance, type safety, streaming |
| Mobile app with limited bandwidth | gRPC — smaller payloads |
| Real-time bidirectional streaming | gRPC — native streaming support |
| Simple CRUD with a web frontend | REST — browser-native |

> *"For the public-facing product API, I'll use REST — it's easy for third-party developers to integrate. For internal service communication between the order service and inventory service, I'll use gRPC — the binary protocol reduces payload size by 5x and the `.proto` contract prevents breaking changes."*

---

## 🚪 API Gateway

**Definition:** A single ingress point for all API traffic that handles cross-cutting concerns.

```
                    ┌─────────────────────────────────────┐
Clients ──────────► │           API Gateway               │
                    │  • Authentication (JWT/OAuth)        │
                    │  • Rate Limiting (per user/IP)       │
                    │  • Request Routing                   │
                    │  • SSL Termination                   │
                    │  • Request/Response transformation   │
                    │  • Logging & Metrics                 │
                    └──────────┬──────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       Order Service    User Service    Payment Service
```

### What API Gateway Does

| Concern | Without Gateway | With Gateway |
|---|---|---|
| Auth | Every service implements auth | Gateway validates JWT once |
| Rate limiting | Every service implements limits | Gateway enforces centrally |
| SSL | Every service handles TLS | Gateway terminates TLS |
| Routing | Client knows all service URLs | Client knows one URL |
| Versioning | Complex per-service | `/v1/`, `/v2/` routing at gateway |

### Examples
- **AWS API Gateway** — managed, serverless-friendly
- **Kong** — open-source, plugin-based
- **Nginx** — lightweight, high-performance
- **Envoy** — service mesh sidecar, used in Istio

> *"I'll put an API Gateway in front of all services. It handles JWT validation, rate limiting (100 req/sec per user), and routes `/orders/*` to the order service and `/users/*` to the user service. This keeps each microservice focused on business logic — no auth boilerplate."*

---

## 🔄 Proxies

### Forward Proxy
Sits between clients and the internet. Clients know about it.
- Use cases: corporate firewalls, anonymization, content filtering
- Example: Squid proxy

### Reverse Proxy
Sits in front of servers. Clients don't know about it — they think they're talking to the server.
- Use cases: load balancing, SSL termination, caching, DDoS protection
- Examples: Nginx, HAProxy, Cloudflare

```
Client ──► Reverse Proxy (Nginx) ──► Server 1
                                 ──► Server 2
                                 ──► Server 3
```

### Service Mesh (Sidecar Proxy)
Each service gets a sidecar proxy (Envoy) that handles all network communication.
- Mutual TLS between services (mTLS)
- Distributed tracing
- Circuit breaking
- Traffic shaping (canary deployments)

```
Service A ──► Envoy Sidecar ──► Envoy Sidecar ──► Service B
                    │                   │
                    └──── Control Plane (Istio) ────┘
```

> *"For service-to-service communication, I'll use a service mesh with Envoy sidecars. This gives me mTLS between services (zero-trust networking), automatic distributed tracing, and circuit breaking — all without any code changes to the services themselves."*

---

## ⚖️ Load Balancing

**Definition:** Distributing incoming traffic across multiple server instances to improve throughput and availability.

### Load Balancing Algorithms

| Algorithm | How It Works | Best For |
|---|---|---|
| **Round Robin** | Requests go to servers in rotation | Stateless services, equal capacity |
| **Least Connections** | Route to server with fewest active connections | Long-lived connections (WebSockets) |
| **IP Hash** | Hash client IP → always same server | Session affinity (sticky sessions) |
| **Weighted Round Robin** | Servers get traffic proportional to weight | Mixed capacity servers |
| **Random** | Pick a random server | Simple, works well at scale |

### Layer 4 vs Layer 7 Load Balancing

**Layer 4 (Transport):** Routes based on IP + TCP port. Fast, no content inspection.
```
Client → LB (sees: IP=1.2.3.4, port=443) → Server
```

**Layer 7 (Application):** Routes based on HTTP headers, URL, cookies. Slower but smarter.
```
Client → LB (sees: GET /api/orders, Host: api.amazon.com) → Order Service
Client → LB (sees: GET /api/users, Host: api.amazon.com)  → User Service
```

### Health Checks
Load balancers continuously probe servers:
```
Every 10s: GET /health → expect 200 OK within 2s
If 3 consecutive failures → remove from rotation
If 2 consecutive successes → add back
```
