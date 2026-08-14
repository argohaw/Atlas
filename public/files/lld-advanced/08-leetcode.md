---
tags: [lld, advanced, system-design, leetcode, code-judge]
---
# LLD: Design Leetcode / Coding Platform

## 🎯 Why This Problem is Asked
Leetcode tests:
- sandboxed code execution
- concurrency and resource isolation
- queueing and scheduling for submissions
- moderation and plagiarism controls
- leaderboards and contest scheduling

This is a great advanced design to explore distributed job execution and fairness.

---

## 📋 Requirements Clarification

### Functional
- submit code for problems
- compile and run tests in a secure sandbox
- store results and judge output
- support leaderboards and user profiles
- handle contests and daily challenges

### Non-Functional
- low latency for small submissions
- secure execution with resource limits
- support bursty traffic during contests
- fair scheduling across users and queues

---

## 🧩 Core Entities

```java
public enum SubmissionStatus { QUEUED, RUNNING, PASSED, FAILED, TIME_LIMIT_EXCEEDED }

public class Problem {
    private String problemId;
    private String title;
    private String difficulty;
    private String statement; 
    private List<TestCase> testCases;
}

public class Submission {
    private String submissionId;
    private String userId;
    private String problemId;
    private String language;
    private String sourceCode;
    private SubmissionStatus status;
    private long createdAtMs;
}

public class JudgeResult {
    private String submissionId;
    private boolean passed;
    private String outputSummary;
    private long runtimeMs;
    private int memoryBytes;
}
```

---

## 🏗️ LLD Patterns

### 1. Worker Pool for Judging
A queue ensures submissions are processed by isolated workers.

```java
public class JudgeWorkerPool {
    private final BlockingQueue<Submission> queue;

    public void submit(Submission submission) {
        queue.offer(submission);
    }
}
```

### 2. Sandboxed Execution
Each job runs in a secure container with CPU/memory limits and timeout enforcement.

```java
public class SandboxRunner {
    public JudgeResult run(Submission submission, List<TestCase> cases) {
        // run in isolated container with process and file restrictions
        return new JudgeResult();
    }
}
```

### 3. Fair Scheduling
High-volume contests need queue fairness and priority-based execution.

```java
public class Scheduler {
    public Submission nextSubmission() {
        return queue.peek();
    }
}
```

---

## 🗄️ Database Design

```sql
CREATE TABLE problems (
  problem_id UUID PRIMARY KEY,
  title VARCHAR(255),
  difficulty VARCHAR(20),
  statement TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE submissions (
  submission_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  problem_id UUID REFERENCES problems(problem_id),
  language VARCHAR(20),
  source_code TEXT,
  status VARCHAR(25),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE test_cases (
  test_case_id UUID PRIMARY KEY,
  problem_id UUID REFERENCES problems(problem_id),
  input_text TEXT,
  expected_output TEXT,
  hidden BOOLEAN DEFAULT FALSE
);
```

Redis uses:
- queued submissions
- current judge worker health
- leaderboard caches
- rate limiting for user requests

---

## 🔌 API Routes & Contracts

```
POST /v1/submissions
Request: {
  "userId": "u-1",
  "problemId": "p-7",
  "language": "python",
  "sourceCode": "print(2+2)"
}
Response: { "submissionId": "s-11", "status": "QUEUED" }

GET /v1/submissions/{submissionId}
Response: { "status": "PASSED", "runtimeMs": 20, "memoryBytes": 128000 }

GET /v1/problems/{problemId}/testcases
Response: { "cases": [ ... ] }
```

---

## 🏗️ Service Architecture

```text
Clients
   |
   v
API Gateway
   |
   +--> Submission Service
   +--> Problem Service
   +--> Judge Service
   +--> Leaderboard Service
   |
   +--> PostgreSQL
   +--> Redis Queue
   +--> Worker Nodes (sandboxed execution)
```

### Flow
1. user submits code
2. submission service saves metadata
3. judge service enqueues compilation and execution task
4. worker sandbox runs code and tests it
5. result is stored and returned to user
6. leaderboard updates and caching occur asynchronously

---

## 📐 HLD Concepts & Scalability

### Bursty traffic
- contest mode can cause 10x normal submission volume
- queue workers scale horizontally
- submission throttling prevents abuse

### Security
- no direct host access to runtime
- use containerization, seccomp, cgroups, network restrictions

### Performance
- small tasks use fast, lightweight containers
- large/long-running tasks can be time-limited and deduplicated

---

## 🗣️ How to Explain in the Interview

> "The key design challenge is balancing submission throughput with isolation and fairness. I would keep a durable submission queue, run judges in sandboxed worker nodes, and maintain a separate metadata service for problems and results. This allows us to handle spikes during contests without giving users access to the underlying host environment."

---

## ✅ SOLID / Design Checklist

| Principle | Application |
|---|---|
| S | SubmissionService, JudgeService, LeaderboardService separate concerns |
| O | New languages or sandbox policies can be added without altering existing logic |
| D | Worker execution is abstracted behind a runner interface |
| I | Queue management and judge logic remain distinct |

---

## ⚠️ Follow-up Questions
- How do you isolate untrusted code safely?
- How do you handle extremely long-running submissions?
- How do you limit abuse and repeated attempts?
- How do you support multiple languages with different runtimes?

---

## 🔥 Deep Dive: Production Realities for Leetcode-like Judges

### 1. Sandbox Design
The safety of the judge is the highest priority. Each submission should run in:
- a container or VM with no host access
- resource quotas for CPU, memory, and process count
- network restrictions to block external calls
- timeout limits and kill after execution completes

This requires close coordination between the orchestrator and worker runtime.

### 2. Execution Model
A judge can be implemented with:
- compile step for code-based languages
- run step with input and time limits
- capture runtime statistics and exit code
- compare outputs to expected values

A submission can fail either due to compile issues, runtime errors, timeouts, or wrong output.

### 3. Bursts During Contests
Contest traffic is bursty. The system must handle:
- a spike in submissions at the start and end of contest windows
- queue prioritization by time or user tier
- worker autoscaling in batches based on backlog size
- eventual fairness with delayed but safe execution

### 4. abuse Mitigation
The platform must protect against:
- repeated resubmissions by a single user
- infinite loops and memory exhaustion
- exploiting the environment for side-channel or external calls
- duplicate test case replay during a contest

### 5. Interview Answer Template
> "I would treat the judge as a queue-driven execution platform. User submissions go to a durable queue, worker nodes compile and run them in sandboxed containers with strict resource limits, and the result is compared against expected test cases. To handle contest surges, I’d auto-scale worker pools and use a fair scheduler to prevent starvation."
