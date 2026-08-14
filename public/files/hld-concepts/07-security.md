---
tags: [hld, security, authentication, amazon-interview]
---
# HLD: Security Basics

## 🎯 Why Security is Asked
Amazon's bar for security is extremely high — it's a Leadership Principle ("Earn Trust"). In HLD interviews, you're expected to proactively mention security at each layer without being prompted. This section gives you the vocabulary and patterns to do that.

---

## 🔐 Authentication vs Authorization

| | Authentication (AuthN) | Authorization (AuthZ) |
|---|---|---|
| **Question** | Who are you? | What can you do? |
| **Verifies** | Identity | Permissions |
| **Example** | Login with password | Can this user delete this order? |
| **Protocols** | OAuth 2.0, SAML, mTLS | RBAC, ABAC, IAM policies |

---

## 🎫 JWT (JSON Web Token)

**Structure:** `header.payload.signature` (Base64-encoded, dot-separated)

```json
// Header
{ "alg": "RS256", "typ": "JWT" }

// Payload
{
  "sub": "user-123",
  "email": "user@amazon.com",
  "roles": ["buyer", "seller"],
  "iat": 1700000000,
  "exp": 1700003600  // expires in 1 hour
}

// Signature: RS256(base64(header) + "." + base64(payload), privateKey)
```

### JWT Flow

```
1. User logs in → Auth Service validates credentials
2. Auth Service issues JWT (signed with private key)
3. Client stores JWT (localStorage or httpOnly cookie)
4. Client sends JWT in every request: Authorization: Bearer <token>
5. API Gateway validates JWT signature (using public key) — no DB lookup needed
6. Gateway extracts claims (user ID, roles) and passes to service
```

**Why JWT?** Stateless — the API Gateway can validate the token without calling the Auth Service. This scales horizontally with zero shared state.

**Risks:**
- Token theft → use short expiry (15 min) + refresh tokens
- Algorithm confusion attack → always specify `alg` explicitly, reject `none`
- Sensitive data in payload → JWT is Base64, not encrypted; don't put PII in payload

### Access Token + Refresh Token Pattern

```
Access Token:  short-lived (15 min), used for API calls
Refresh Token: long-lived (30 days), stored in httpOnly cookie, used only to get new access token

Flow:
  1. Login → get access_token (15min) + refresh_token (30 days)
  2. API calls use access_token
  3. access_token expires → client sends refresh_token to /auth/refresh
  4. Server validates refresh_token → issues new access_token
  5. If refresh_token is stolen → revoke it in DB (token blacklist)
```

---

## 🔑 OAuth 2.0

**Use case:** "Login with Google/Amazon" — delegated authorization.

```
User ──► "Login with Google" ──► Google Auth Server
                                        │
                                        │ Authorization Code
                                        ▼
Your App ──► Exchange code for tokens ──► Google Auth Server
                                                │
                                                │ access_token + id_token
                                                ▼
Your App ──► Call Google API with access_token ──► Google API
```

**Grant Types:**
- **Authorization Code** (+ PKCE for mobile/SPA) — most secure, for user-facing apps
- **Client Credentials** — service-to-service (no user involved)
- **Device Code** — TV/IoT devices with no keyboard

---

## 🔒 Encryption

### In-Transit (TLS)
All traffic between clients and servers must use TLS 1.2+.
- TLS 1.3: 1-RTT handshake, forward secrecy by default
- **HSTS:** Force browsers to always use HTTPS: `Strict-Transport-Security: max-age=31536000`
- **Certificate pinning:** Mobile apps pin the server's cert fingerprint — prevents MITM even with a compromised CA

### At-Rest
Data stored on disk must be encrypted.

```
Application Layer:  Encrypt sensitive fields before storing (AES-256-GCM)
  → credit card numbers, SSNs, passwords (bcrypt/argon2, not AES)

Storage Layer:      AWS S3 SSE-S3 or SSE-KMS (transparent encryption)
DB Layer:           Aurora encryption at rest (AES-256, managed by KMS)
```

### Key Management (KMS)
Never hardcode encryption keys. Use a Key Management Service.

```
Application ──► KMS.encrypt(plaintext, keyId) ──► ciphertext
Application ──► KMS.decrypt(ciphertext, keyId) ──► plaintext

Key rotation: KMS rotates keys annually (or on demand)
Key access: IAM policies control which services can use which keys
```

---

## 🚦 Rate Limiting & Throttling

**Why:** Prevent abuse, protect downstream services, enforce fair usage.

### Rate Limiting Algorithms

**Token Bucket:**
```
Bucket capacity: 100 tokens
Refill rate: 10 tokens/second

Request arrives:
  If tokens > 0: consume 1 token, allow request
  If tokens = 0: reject with 429 Too Many Requests

Burst allowed: up to 100 requests instantly (full bucket)
Sustained rate: 10 requests/second
```

**Sliding Window Counter:**
```
Window: 60 seconds
Limit: 100 requests per window

At time T:
  Count requests in [T-60s, T]
  If count >= 100: reject
  Else: allow and increment counter
```

**Fixed Window Counter:** Simpler but has boundary burst problem (100 req at 11:59:59 + 100 req at 12:00:01 = 200 req in 2 seconds).

### Where to Implement

```
Layer 1: API Gateway (per user/IP, coarse-grained)
Layer 2: Service level (per endpoint, fine-grained)
Layer 3: DB connection pool (prevent DB overload)
```

### Redis-based Rate Limiter

```lua
-- Atomic Lua script (runs as single Redis command)
local key = KEYS[1]           -- "ratelimit:user:123"
local limit = tonumber(ARGV[1]) -- 100
local window = tonumber(ARGV[2]) -- 60 seconds

local current = redis.call('INCR', key)
if current == 1 then
    redis.call('EXPIRE', key, window)
end
if current > limit then
    return 0  -- rejected
end
return 1  -- allowed
```

---

## 🔐 Secrets Management

**Never** store secrets in:
- Source code / Git
- Environment variables in plain text
- Application config files

**Use instead:**

| Tool | Use Case |
|---|---|
| **AWS Secrets Manager** | DB passwords, API keys — auto-rotation |
| **AWS Parameter Store** | Config values, feature flags |
| **HashiCorp Vault** | Multi-cloud, dynamic secrets |
| **Kubernetes Secrets** | In-cluster secrets (encrypt etcd at rest) |

```java
// Fetch secret at startup, not hardcoded
SecretsManagerClient client = SecretsManagerClient.create();
GetSecretValueResponse response = client.getSecretValue(
    GetSecretValueRequest.builder().secretId("prod/db/password").build()
);
String dbPassword = response.secretString();
```

---

## 🌐 Network Security

### VPC (Virtual Private Cloud)
```
Internet
    │
    ▼
Internet Gateway
    │
    ▼
Public Subnet (Load Balancer, NAT Gateway)
    │
    ▼
Private Subnet (App Servers, DB)  ← no direct internet access
    │
    ▼
DB Subnet (RDS, ElastiCache)  ← only accessible from App Subnet
```

**Security Groups (stateful firewall):**
```
App Server Security Group:
  Inbound:  port 8080 from Load Balancer SG only
  Outbound: port 5432 to DB SG only

DB Security Group:
  Inbound:  port 5432 from App Server SG only
  Outbound: none
```

### Zero-Trust Networking
Don't trust any request just because it's inside the VPC.
- mTLS between all services (both sides present certificates)
- Service mesh (Istio/Envoy) enforces mTLS automatically
- Every service call is authenticated and authorized

> *"I'll put the DB in a private subnet with a security group that only allows connections from the app server security group on port 5432. The app servers are in a private subnet too — only the load balancer is in the public subnet. All service-to-service calls use mTLS via the service mesh."*

---

## 🗣️ How to Proactively Mention Security in an Interview

After designing each component, add a security note:

| Component | Security Note |
|---|---|
| API Gateway | "JWT validation here — services don't need to implement auth" |
| User passwords | "bcrypt with cost factor 12 — never store plaintext or MD5" |
| Payment data | "PCI-DSS scope — tokenize card numbers, never store raw PAN" |
| S3 uploads | "Pre-signed URLs with 15-minute expiry — client uploads directly, server never handles binary" |
| DB | "Encrypted at rest with KMS, credentials in Secrets Manager with auto-rotation" |
| Service mesh | "mTLS between all services — zero-trust, even inside the VPC" |
