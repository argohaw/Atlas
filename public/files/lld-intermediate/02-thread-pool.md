---
tags: [lld, intermediate, concurrency, amazon-interview, google-interview, system-design]
---
# LLD: Design a Thread Pool

## 🎯 Why This Problem is Asked
Thread pools are **fundamental to every production system**. Asked at Amazon, Google, Microsoft to test:
- **Concurrency & synchronization** (locks, queues, atomic operations)
- **Resource management** (preventing runaway threads)
- **Work queue patterns** (FIFO vs priority queues)
- **Graceful shutdown** (draining in-flight work)
- **Performance tuning** (queue backpressure, thread starvation)

Understanding thread pools directly applies to Java's `ExecutorService`, Rust's thread pools, Python's `ThreadPoolExecutor`, and every language's async runtime.

---

## 📋 Requirements Clarification

**Functional:**
- Accept work (tasks/jobs) from multiple threads
- Execute tasks using a fixed pool of worker threads
- Support task priorities (normal, high, low)
- Return results via callbacks or futures
- Support graceful shutdown (wait for pending tasks)
- Reject tasks when queue is full (backpressure)

**Non-Functional:**
- No thread starvation (all threads make progress)
- Sub-millisecond task enqueue latency
- Configurable pool size (10-1000 threads)
- Support millions of tasks
- Memory efficient (no task copying, references only)

---

## 🧩 Core Entities & Enums

```java
public enum TaskPriority { LOW(0), NORMAL(1), HIGH(2) }

public class Task {
    private final String id;
    private final Runnable work;
    private final TaskPriority priority;
    private final long createdAtMs = System.currentTimeMillis();
    private volatile TaskState state = TaskState.QUEUED;
}

public enum TaskState {
    QUEUED,      // waiting in queue
    RUNNING,     // currently executing
    COMPLETED,   // finished successfully
    FAILED,      // exception thrown
    CANCELLED    // cancelled before execution
}

public interface Future<T> {
    T get() throws InterruptedException;
    T get(long timeout, TimeUnit unit) throws TimeoutException;
    boolean isDone();
    boolean isCancelled();
}

public class ThreadPool {
    private final int poolSize;
    private final BlockingQueue<Task> taskQueue;
    private final List<WorkerThread> workers;
    private volatile boolean shutdown = false;
}

public class WorkerThread extends Thread {
    private final BlockingQueue<Task> taskQueue;
    
    public void run() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                Task task = taskQueue.take();  // block if queue empty
                if (task == null) break;  // shutdown signal
                executeTask(task);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Producer-Consumer with Bounded Queue

```java
public class ThreadPool {
    private final int poolSize;
    private final int queueCapacity;
    private final BlockingQueue<Task> taskQueue;
    private final List<WorkerThread> workers;
    private volatile boolean shutdown = false;
    private final ReadWriteLock stateLock = new ReentrantReadWriteLock();

    public ThreadPool(int poolSize, int queueCapacity) {
        this.poolSize = poolSize;
        this.queueCapacity = queueCapacity;
        
        // PriorityBlockingQueue for priority support
        this.taskQueue = new PriorityBlockingQueue<>(queueCapacity, 
            (t1, t2) -> t2.getPriority().compareTo(t1.getPriority()));  // max-heap
        
        this.workers = new ArrayList<>(poolSize);
        
        // Start worker threads
        for (int i = 0; i < poolSize; i++) {
            WorkerThread worker = new WorkerThread(taskQueue, i);
            worker.start();
            workers.add(worker);
        }
    }

    public void submit(Task task) throws RejectedExecutionException {
        stateLock.readLock().lock();
        try {
            if (shutdown) throw new RejectedExecutionException("Thread pool is shut down");
            
            // Offer with timeout to prevent hanging
            boolean enqueued = taskQueue.offer(task, 10, TimeUnit.SECONDS);
            if (!enqueued) {
                throw new RejectedExecutionException("Task queue full");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RejectedExecutionException("Thread interrupted");
        } finally {
            stateLock.readLock().unlock();
        }
    }

    public void shutdown() {
        stateLock.writeLock().lock();
        try {
            shutdown = true;
            
            // Send shutdown signal (null task)
            for (int i = 0; i < poolSize; i++) {
                taskQueue.offer(null);  // no timeout — must succeed
            }
            
            // Wait for workers to finish
            for (WorkerThread worker : workers) {
                worker.join();  // block until worker finishes
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            stateLock.writeLock().unlock();
        }
    }

    public void shutdownNow() {
        // Interrupt all workers immediately
        for (WorkerThread worker : workers) {
            worker.interrupt();
        }
    }
}
```

**Why PriorityBlockingQueue?**
- ✅ Tasks executed in priority order (high-priority first)
- ✅ Thread-safe (internal locking)
- ✅ Unbounded by default, but can configure capacity
- ❌ O(log N) insert vs O(1) for regular queue

### WorkerThread Implementation

```java
public class WorkerThread extends Thread {
    private final BlockingQueue<Task> taskQueue;
    private final int workerId;
    private volatile int tasksCompleted = 0;

    public WorkerThread(BlockingQueue<Task> taskQueue, int workerId) {
        this.taskQueue = taskQueue;
        this.workerId = workerId;
        setName("Worker-" + workerId);
    }

    @Override
    public void run() {
        while (!Thread.currentThread().isInterrupted()) {
            Task task = null;
            try {
                task = taskQueue.take();  // block if empty
                
                if (task == null) break;  // shutdown signal
                
                task.setState(TaskState.RUNNING);
                long startMs = System.currentTimeMillis();
                
                try {
                    task.getWork().run();
                    task.setState(TaskState.COMPLETED);
                } catch (Exception e) {
                    task.setState(TaskState.FAILED);
                    task.setException(e);
                    e.printStackTrace();
                }
                
                long durationMs = System.currentTimeMillis() - startMs;
                tasksCompleted++;
                
                if (tasksCompleted % 1000 == 0) {
                    System.out.println("Worker-" + workerId + ": " + tasksCompleted + " completed");
                }
                
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        System.out.println("Worker-" + workerId + " shutting down");
    }

    public int getTasksCompleted() { return tasksCompleted; }
}
```

### Future Implementation

```java
public class TaskFuture<T> implements Future<T> {
    private final Task task;
    private volatile T result;
    private volatile Exception exception;
    private final CountDownLatch completionLatch = new CountDownLatch(1);

    public TaskFuture(Task task) {
        this.task = task;
    }

    @Override
    public T get() throws InterruptedException, ExecutionException {
        completionLatch.await();  // block until task done
        if (exception != null) throw new ExecutionException(exception);
        return result;
    }

    @Override
    public T get(long timeout, TimeUnit unit) 
            throws InterruptedException, TimeoutException, ExecutionException {
        if (!completionLatch.await(timeout, unit)) {
            throw new TimeoutException("Task did not complete within " + timeout + " " + unit);
        }
        if (exception != null) throw new ExecutionException(exception);
        return result;
    }

    @Override
    public boolean isDone() {
        return task.getState() == TaskState.COMPLETED || 
               task.getState() == TaskState.FAILED;
    }

    @Override
    public boolean isCancelled() {
        return task.getState() == TaskState.CANCELLED;
    }

    public void setResult(T result) {
        this.result = result;
        completionLatch.countDown();
    }

    public void setException(Exception e) {
        this.exception = e;
        completionLatch.countDown();
    }
}
```

### Rejection Policies

```java
public interface RejectionPolicy {
    void onRejection(ThreadPool pool, Task task);
}

public class AbortPolicy implements RejectionPolicy {
    @Override
    public void onRejection(ThreadPool pool, Task task) {
        throw new RejectedExecutionException("Task rejected");
    }
}

public class DiscardPolicy implements RejectionPolicy {
    @Override
    public void onRejection(ThreadPool pool, Task task) {
        // silently discard
    }
}

public class CallerRunsPolicy implements RejectionPolicy {
    @Override
    public void onRejection(ThreadPool pool, Task task) {
        task.getWork().run();  // execute in calling thread
    }
}

public class WaitPolicy implements RejectionPolicy {
    @Override
    public void onRejection(ThreadPool pool, Task task) {
        try {
            pool.getTaskQueue().put(task);  // block until space available
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

---

## 🗄️ Database Design

### Task Persistence (Optional)

```sql
CREATE TABLE task_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id VARCHAR(50) UNIQUE NOT NULL,
  payload LONGBLOB,  -- serialized Task
  priority INT DEFAULT 1,  -- HIGH=2, NORMAL=1, LOW=0
  state VARCHAR(20),  -- QUEUED, RUNNING, COMPLETED, FAILED
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  INDEX idx_state (state),
  INDEX idx_priority (priority DESC),
  INDEX idx_created_at (created_at DESC)
);

CREATE TABLE task_results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id VARCHAR(50) UNIQUE NOT NULL,
  result LONGBLOB,  -- serialized result
  exception_stack LONGTEXT,
  completed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_statistics (
  worker_id INT,
  tasks_completed INT,
  total_duration_ms BIGINT,
  avg_duration_ms INT,
  last_updated TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (worker_id),
  INDEX idx_completed (tasks_completed DESC)
);
```

### Why Separate Persistence?
- **Resilience:** Tasks survive thread pool crashes
- **Replay:** Failed tasks can be retried
- **Analytics:** track which tasks take longest
- **Optional:** for non-critical systems, in-memory only is fine

---

## 🔌 API Routes & Contracts

### Thread Pool as a Service

```
POST   /api/v1/tasks
├─ Request:  {
│     "taskId": "task-123",
│     "work": "function_name",
│     "args": [arg1, arg2],
│     "priority": "HIGH"
│   }
├─ Response: { "taskId": "task-123", "status": "QUEUED", "queuePosition": 5 }
├─ Error:    503 Rejected (queue full) → apply rejection policy
└─ Latency:  < 1ms

GET    /api/v1/tasks/{taskId}
├─ Response: {
│     "taskId": "task-123",
│     "status": "RUNNING",
│     "startedAt": 1692374425000,
│     "priority": "HIGH"
│   }
└─ States: QUEUED, RUNNING, COMPLETED, FAILED

GET    /api/v1/tasks/{taskId}/result
├─ Response: { "result": {...}, "completedAt": 1692374435000 }
├─ Error:    404 Not Found (task still running or doesn't exist)
└─ Blocks: if task not done

POST   /api/v1/tasks/{taskId}/cancel
├─ Response: { "cancelled": true }
├─ Error:    409 Conflict (task already running)
└─ Effect:   Remove from queue or interrupt if running

GET    /api/v1/stats
├─ Response: {
│     "poolSize": 10,
│     "activeThreads": 8,
│     "queuedTasks": 245,
│     "completedTasks": 125000,
│     "failedTasks": 42,
│     "avgTaskDurationMs": 150
│   }
└─ For: monitoring, load balancing decisions

POST   /api/v1/shutdown
├─ Query:    ?wait=true (wait for pending tasks)
├─ Response: { "status": "shutdown", "tasksCompleted": 125000 }
└─ Graceful: allows in-flight work to complete
```

---

## 🏗️ Service Architecture

### Distributed Thread Pool System

```
┌──────────────────────────────────┐
│   Task Submission (N clients)    │
└──────────────┬───────────────────┘
               │
    ┌──────────▼──────────┐
    │ Thread Pool Manager │
    │                     │
    │ • Allocate to pool  │
    │ • Monitor health    │
    │ • Handle backpressure
    └──────────┬──────────┘
               │
    ┌──────────▼──────────────────┐
    │ Task Queue (Priority Queue) │
    │                             │
    │ [HIGH: 50 tasks]            │
    │ [NORMAL: 200 tasks]         │
    │ [LOW: 1000 tasks]           │
    └──────────┬──────────────────┘
               │
    ┌──────────┴────────────────────────────────────┐
    │                                               │
┌───▼──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────▼──┐
│Worker-1  │ │Worker│ │Worker│ │Worker│ │Worker-N   │
│(running) │ │-2    │ │-3    │ │-4    │ │(idle)     │
└──────────┘ └──────┘ └──────┘ └──────┘ └───────────┘
    │          │         │         │         │
    └──────────┴─────────┴─────────┴─────────┘
               │
    ┌──────────▼──────────────────┐
    │ Result Handler / Callback   │
    │                             │
    │ • Store results             │
    │ • Notify waiters (Future)   │
    │ • Trigger callbacks         │
    └─────────────────────────────┘
```

### Components

| Component | Role | Responsibility |
|---|---|---|
| **Task Submitter** | Client | Create tasks, submit to pool |
| **Thread Pool Manager** | Orchestrator | Allocate tasks to workers, monitor health |
| **Task Queue** | Scheduler | Hold tasks (with priority), FIFO/priority order |
| **Worker Threads** | Executors | Grab tasks from queue, execute, handle exceptions |
| **Result Handler** | Callback | Notify waiters via Future, store results |
| **Monitor** | Observer | Track pool health, latency, queue depth |

### Complete Task Submission Flow

```
Client: pool.submit(task)
    │
    ├─> ThreadPool.submit(task)
    │
    ├─> Acquire READ lock (check not shutdown)
    │
    ├─> taskQueue.offer(task, 10sec timeout)
    │   └─> If queue full for > 10sec: RejectedExecutionException
    │       └─> Apply rejection policy (AbortPolicy, CallerRunsPolicy, etc.)
    │
    ├─> If enqueued: return Future immediately (non-blocking)
    │
    └─> WorkerThread:
        ├─> taskQueue.take() (block if queue empty)
        ├─> task.setState(RUNNING)
        ├─> Execute: task.getWork().run()
        ├─> On complete: task.setState(COMPLETED) + future.setResult()
        ├─> On exception: task.setState(FAILED) + future.setException()
        └─> Return to waiting clients via CountDownLatch.countDown()
```

### Graceful Shutdown Flow

```
Client: pool.shutdown()
    │
    ├─> Acquire WRITE lock
    ├─> Set shutdown flag = true
    │
    ├─> Reject new submissions (throw RejectedExecutionException)
    │
    ├─> Send shutdown signals (N null tasks)
    │   └─> Each worker receives null, exits gracefully
    │
    ├─> Wait for all workers: worker.join() for each
    │   └─> Block until all threads finish executing in-flight tasks
    │
    └─> pool.shutdown() returns (all tasks done)
```

---

## ⚠️ Edge Cases & Challenges

| Challenge | Solution |
|---|---|
| **Deadlock (task waits on result of another task)** | Use separate thread pools for dependent tasks, or allow re-entrant queuing |
| **Queue full under load spikes** | Use rejection policy (CallerRunsPolicy to execute in caller's thread) |
| **Thread starvation** | Don't submit tasks that wait on other tasks (blocking inside work) |
| **Memory leak (completed tasks retained)** | Set result = null after Future.get(), use weak references |
| **Exception in worker thread** | Catch in run(), log, mark task FAILED, continue to next task |
| **Uneven load (some workers idle, others overloaded)** | Use work-stealing queue (each worker has its own queue, can steal from others) |

---

## 📐 Scalability & HLD Thinking

**Throughput:**
- Single pool (10 workers, 1K queue): ~100K tasks/sec
- Multiple pools: add more instances (independent queues)
- With work-stealing: ~200K tasks/sec (less contention on single queue)

**Latency:**
- Enqueue: O(1) for regular queue, O(log N) for priority queue (< 1μs)
- Dequeue: O(1) for regular, O(log N) for priority queue (< 1μs)
- Execute: depends on task (microseconds to seconds)

**Optimal Pool Size:**
- **CPU-bound tasks:** pool size = num_cores (no context switching waste)
- **I/O-bound tasks:** pool size = num_cores × (1 + wait_time / service_time) = 2-10× num_cores
- **Rule of thumb:** start with num_cores, monitor and tune

**Memory:**
- Each thread: ~1-2 MB (thread stack + local vars)
- Task object: ~200 bytes (id, priority, state, callbacks)
- 1000 threads: ~1-2 GB just for stacks
- Careful: don't create unlimited threads

---

## 🗣️ How to Explain in the Interview

> "For a thread pool, I'd use a BlockingQueue to decouple task submission from execution. Workers block on queue.take() when empty — no busy waiting, efficient CPU usage.

For priority tasks, I'd use PriorityBlockingQueue so high-priority tasks execute first. It's thread-safe and O(log N) insertion.

For graceful shutdown, I'd send null-task shutdown signals (one per worker) — this ensures all workers wake up and exit cleanly, allowing in-flight tasks to complete. I'd block on Thread.join() to ensure all workers finish.

For backpressure (queue full), I'd use rejection policies — AbortPolicy throws exception, CallerRunsPolicy executes in the caller's thread (useful for critical tasks). This prevents unbounded queue growth.

For CPU-bound tasks, pool size = cores. For I/O-bound tasks, 2-10× cores (workers can sleep during I/O). Monitoring thread utilization tells you if you're tuned right.

I'd use a CountDownLatch in Future.get() to block the caller until task completes. This avoids busy-waiting.

For monitoring, I'd track queue depth (warn if > 80% full), worker utilization, task completion rate, and max queue size reached. If queue fills repeatedly, you need more threads or faster task processing."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | `WorkerThread` runs tasks, `ThreadPool` manages lifecycle, separate concerns |
| **O** | New task type = new Runnable impl, no ThreadPool changes |
| **D** | ThreadPool depends on Runnable interface, not concrete classes |
