# 4. Spring and Spring Boot

# 4.1 IoC

Inversion of Control means object creation and dependency wiring are managed by the framework rather than application code manually creating everything.

Without DI:

```java
OrderService service =
    new OrderService(new PaymentClient(...));
```

With Spring:

```java
@Service
public class OrderService {
    private final PaymentClient paymentClient;

    public OrderService(PaymentClient paymentClient) {
        this.paymentClient = paymentClient;
    }
}
```

Spring resolves and injects dependencies.

---

# 4.2 Dependency Injection

Main types:

- Constructor injection
- Setter injection
- Field injection

Prefer constructor injection.

Why?

- Dependencies are explicit.
- Required dependencies can be final.
- Easier unit testing.
- Object cannot be created without required dependencies.

---

# 4.3 Bean Lifecycle

Simplified:

```text
Application starts
      ↓
ApplicationContext created
      ↓
Bean definitions discovered
      ↓
Beans instantiated
      ↓
Dependencies injected
      ↓
Initialization callbacks
      ↓
Application ready
      ↓
Application shutdown
      ↓
Destruction callbacks
```

Know:

- `@PostConstruct`
- `@PreDestroy`

Do not overuse lifecycle callbacks for complicated business initialization.

---

# 4.4 @Component, @Service, @Repository

All are stereotype annotations for Spring-managed components.

Semantic meaning matters:

- `@Component` → generic component
- `@Service` → service/business layer
- `@Repository` → persistence layer, including persistence exception translation behavior
- `@Controller` / `@RestController` → web layer

---

# 4.5 Spring Boot Auto-Configuration

Spring Boot automatically configures components based on:

- Dependencies on the classpath
- Application configuration
- Existing beans

Example concept:

If a web starter is present, Spring Boot can configure web infrastructure.

Auto-configuration is conditional.

The important point:

> Spring Boot does not magically configure everything blindly. Auto-configuration backs off or changes behavior based on conditions and user-provided beans/configuration.

---

# 4.6 application.yml and Externalized Configuration

Do not hardcode environment-specific values.

```yaml
app:
  payment-url: ${PAYMENT_URL}

spring:
  datasource:
    url: ${DB_URL}
```

Know:

- Environment variables
- Profiles
- External configuration
- Configuration properties

Use strongly typed configuration for related settings.

```java
@ConfigurationProperties(prefix = "payment")
public class PaymentProperties {
    private Duration timeout;
}
```

---

# 4.7 Profiles

Examples:

- local
- dev
- test
- staging
- prod

Profiles allow environment-specific configuration.

Avoid putting production secrets in source-controlled YAML files.

---

# 4.8 Spring Boot Actuator

Important for production.

Potential capabilities include:

- Health checks
- Metrics
- Application information
- Readiness/liveness support depending on configuration
- Monitoring integration

Important:

Do not expose sensitive actuator endpoints publicly.