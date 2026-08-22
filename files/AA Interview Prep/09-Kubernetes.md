# 10. Kubernetes

# 10.1 Kubernetes Architecture

At a high level:

```text
Control Plane
    ↓
Worker Nodes
    ↓
Pods
    ↓
Containers
```

For interview preparation, focus more on how workloads are deployed and operated than memorizing every control-plane component.

---

# 10.2 Pod

Smallest deployable workload unit in Kubernetes.

A pod can contain one or more containers.

Containers in a pod can share:

- Network namespace
- Certain storage volumes

Typical microservice deployment often uses one primary application container per pod, possibly with sidecars where required.

---

# 10.3 Deployment

A Deployment manages desired state for application pods.

Example:

```yaml
spec:
  replicas: 3
```

Kubernetes works toward maintaining the desired number of replicas.

Concept:

```text
Deployment
    ↓
ReplicaSet
    ↓
Pods
```

---

# 10.4 Service

Pods can be replaced and their IP addresses are not stable application endpoints.

A Service provides stable network access to matching pods.

Common types:

- ClusterIP
- NodePort
- LoadBalancer

For most interview answers, explain the use case rather than listing definitions.

---

# 10.5 Ingress

Ingress provides HTTP/HTTPS routing into services, depending on cluster setup and controller.

Concept:

```text
Client
  ↓
Ingress
  ↓
Service
  ↓
Pods
```

Possible routing:

```text
/api/bookings → booking-service
/api/payments → payment-service
```

---

# 10.6 ConfigMap

Stores non-sensitive configuration.

Examples:

- Feature settings
- URLs
- Configuration values

Do not put passwords/secrets in ConfigMaps.

---

# 10.7 Secret

Used for sensitive configuration, but understand that using a Kubernetes Secret does not automatically solve every security issue.

Consider:

- Access control
- Encryption configuration
- External secret management
- Secret rotation
- Avoiding secrets in logs

---

# 10.8 Liveness vs Readiness Probe

This is a high-priority interview topic.

## Liveness

Answers:

> Should Kubernetes consider restarting this container?

Use for detecting a stuck/broken process.

## Readiness

Answers:

> Should this pod receive traffic?

A pod may be running but temporarily unable to serve requests.

Example:

```text
Application starting
↓
Not ready
↓
Initialization complete
↓
Ready
↓
Service sends traffic
```

Do not configure liveness too aggressively, or healthy-but-slow startup may cause repeated restarts.

---

# 10.9 Startup Probe

Useful for applications requiring significant startup time.

Can prevent liveness/readiness behavior from incorrectly restarting an application before it has had enough time to initialize.

---

# 10.10 Resource Requests and Limits

## Request

Resource amount used for scheduling decisions.

## Limit

Maximum resource boundary enforced according to Kubernetes/runtime behavior.

CPU and memory should be configured based on realistic measurement.

Important:

- Insufficient requests can cause scheduling/contension problems.
- Memory limits can result in termination when exceeded.
- Blindly setting very high limits for every application harms cluster efficiency.

---

# 10.11 OOMKilled

Possible sequence:

```text
Application exceeds memory limit
        ↓
Container terminated
        ↓
Kubernetes restarts according to workload policy
```

Investigate:

- Actual memory usage
- JVM heap settings
- Native/direct memory
- Memory leaks
- Resource limit appropriateness

Do not immediately assume "increase memory limit" is the only solution.

---

# 10.12 CrashLoopBackOff

Means a container repeatedly starts and fails, with backoff between restart attempts.

Debug:

```bash
kubectl get pods
kubectl describe pod <pod>
kubectl logs <pod>
kubectl logs <pod> --previous
kubectl get events
```

Check:

- Application exception
- Missing configuration
- Invalid Secret/ConfigMap
- Dependency startup assumptions
- Incorrect command
- Port/configuration
- Resource issues

---

# 10.13 ImagePullBackOff

Common causes:

- Image does not exist
- Wrong image tag
- Registry permissions
- Network issues
- Image pull secrets/credentials

---

# 10.14 Pending Pod

Potential causes:

- Insufficient CPU/memory
- Node constraints
- Taints/tolerations
- Unsatisfied scheduling requirements
- Persistent volume constraints

Use:

```bash
kubectl describe pod <pod>
```

Events often explain scheduling failures.

---

# 10.15 Horizontal Pod Autoscaler

HPA adjusts replicas based on metrics.

Concept:

```text
High CPU / custom metric
       ↓
HPA
       ↓
Increase replicas
```

But scaling application pods does not automatically solve every bottleneck.

Example:

```text
10 app pods
    ↓
Single overloaded database
```

The database remains the bottleneck.

Always identify the actual limiting resource.

---

# 10.16 Rolling Deployment

Kubernetes can gradually replace old pods with new pods.

Benefits:

- Reduced downtime
- Controlled rollout
- Easier rollback

Readiness probes are important so new pods do not receive traffic before they are actually ready.

---

# 10.17 Debugging Commands

```bash
kubectl get pods
kubectl get deployments
kubectl get services
kubectl describe pod <pod-name>
kubectl logs <pod-name>
kubectl logs <pod-name> --previous
kubectl get events
kubectl exec -it <pod-name> -- sh
```

Know what each command helps investigate.