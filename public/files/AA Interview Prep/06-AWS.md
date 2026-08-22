# 8. AWS

# 8.1 IAM

IAM controls identity and access.

Key concepts:

- Users
- Roles
- Policies
- Permissions
- Temporary credentials
- Least privilege

For applications running on AWS, prefer appropriate roles rather than embedding long-lived access keys.

Example:

```text
EKS workload
   ↓ IAM role / workload identity approach
   ↓
S3
```

instead of:

```text
AWS_ACCESS_KEY in source code
```

---

# 8.2 VPC

A Virtual Private Cloud is a logically isolated network environment.

Important concepts:

- VPC
- Subnet
- Route table
- Internet Gateway
- NAT Gateway
- Security Group

Typical architecture:

```text
Internet
   ↓
Internet Gateway
   ↓
Public Subnet
   ↓
Load Balancer
   ↓
Private Subnet
   ↓
Application workloads
   ↓
Private database
```

---

# 8.3 Public vs Private Subnet

A public subnet generally has routing that enables direct internet connectivity through an Internet Gateway for applicable resources.

A private subnet is not directly reachable from the public internet in the same way.

Typical:

- Load balancers may be public-facing.
- Application workloads may be private.
- Databases should generally not be publicly exposed unless there is a specific justified design.

---

# 8.4 Security Groups

Security groups act as stateful virtual firewall rules around resources.

Define allowed inbound/outbound traffic.

Principle:

> Allow only required traffic.

Example:

```text
Internet
→ Load Balancer : HTTPS

Load Balancer
→ Application : application port

Application
→ Database : database port
```

Do not expose database ports broadly to the internet.

---

# 8.5 EC2

Virtual compute instances.

Know:

- Instance types
- Security groups
- IAM roles
- Auto Scaling
- Load balancing

---

# 8.6 S3

Object storage.

Common uses:

- Files
- Logs
- Artifacts
- Backups
- Static assets

Know basic concepts:

- Bucket
- Object
- Versioning
- Encryption
- Lifecycle policies
- IAM/bucket access controls

Do not treat S3 as a normal POSIX filesystem.

---

# 8.7 RDS

Managed relational database service.

Important concepts:

- Automated backups
- High availability options
- Read replicas
- Monitoring
- Connection management

Application concern:

Do not create an unlimited number of database connections from horizontally scaled services.

Use appropriate connection pooling.

---

# 8.8 DynamoDB

Managed NoSQL database.

Prepare at a basic level:

- Partition key
- Sort key
- Access-pattern-driven design
- Capacity/scaling concepts
- Secondary indexes

Do not assume relational modeling principles transfer directly.

---

# 8.9 Load Balancers

Conceptually distribute traffic across targets.

Know common ideas:

- Health checks
- Target registration
- Layer 7 vs Layer 4 distinctions at a high level
- TLS termination depending on architecture

---

# 8.10 CloudWatch

Used for monitoring/logging/metrics capabilities.

Think in terms of:

- Application logs
- Infrastructure metrics
- Alarms
- Dashboards

A good production system should alert on symptoms that matter.

Example:

```text
p99 latency > target
Error rate > threshold
Consumer lag growing
Pod restarts increasing
```

---

# 8.11 ECR

Container registry for storing images.

Typical flow:

```text
Build image
   ↓
Run tests/security checks
   ↓
Push to ECR
   ↓
Deployment references image
   ↓
EKS pulls image
```

---

# 8.12 EKS

Managed Kubernetes control-plane service.

Your application still requires understanding of Kubernetes objects.

AWS manages parts of the Kubernetes infrastructure, but application teams still deal with:

- Deployments
- Services
- Pods
- Ingress/load balancing integration
- IAM integration
- Autoscaling
- Monitoring

---

# 8.13 AWS Architecture Interview Scenario

Question:

> How would you deploy a highly available Spring Boot application?

Possible answer:

```text
Users
  ↓
DNS
  ↓
Load Balancer
  ↓
Kubernetes/EKS
  ├── App Pod 1
  ├── App Pod 2
  └── App Pod 3
        ↓
       RDS

Kafka/MSK
  ↕
Application consumers

Cloud monitoring/logging
```

Then discuss:

- Multiple replicas
- Health probes
- Autoscaling
- IAM least privilege
- Private networking
- Database availability/backups
- Observability
- Rolling deployments