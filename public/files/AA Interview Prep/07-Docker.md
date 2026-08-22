# 9. Docker

# 9.1 Image vs Container

Image:

> Immutable packaged filesystem/instructions used to create containers.

Container:

> Running instance created from an image with runtime state.

Simplified:

```text
Dockerfile
   ↓ build
Image
   ↓ run
Container
```

---

# 9.2 Dockerfile Instructions

Important:

- `FROM`
- `WORKDIR`
- `COPY`
- `RUN`
- `ENV`
- `EXPOSE`
- `CMD`
- `ENTRYPOINT`

---

# 9.3 CMD vs ENTRYPOINT

`ENTRYPOINT` defines the executable.

`CMD` commonly supplies default arguments.

Example concept:

```dockerfile
ENTRYPOINT ["java", "-jar", "app.jar"]
CMD ["--server.port=8080"]
```

Runtime arguments can replace/extend behavior depending on invocation/configuration.

Know the conceptual distinction rather than memorizing every edge case.

---

# 9.4 Multi-Stage Build

Avoid shipping build tools and unnecessary artifacts in the runtime image.

Conceptually:

```text
Stage 1:
JDK + Maven
→ compile/package

Stage 2:
Smaller runtime image
→ copy application artifact
→ run
```

Benefits:

- Smaller image
- Reduced attack surface
- Faster distribution
- Cleaner runtime

---

# 9.5 Docker Layer Caching

Docker build steps create layers.

Order instructions so rarely changing dependencies can be cached where practical.

For Java applications, dependency-resolution strategy can affect build performance.

Do not copy the entire changing source tree before steps that could otherwise be cached.

---

# 9.6 Container Networking

Containers communicate over networks.

Important distinction:

```text
localhost inside a container
```

usually refers to that container's own network namespace, not another container or the host.

This causes many local development problems.

---

# 9.7 Containers vs Virtual Machines

VM:

```text
Hardware
↓
Hypervisor
↓
Guest OS
↓
Application
```

Container:

```text
Host OS kernel
↓
Container runtime
↓
Isolated processes
```

Containers generally share the host kernel and are lighter than full VMs.