---
tags: [lld, intermediate, system-design, amazon-interview]
---
# LLD: Design Internet Download Manager (IDM)

## 🎯 Why This Problem is Asked
IDM tests **concurrent programming**, the **Observer pattern** (progress tracking), and **resume capability** (partial downloads). Amazon asks this for roles involving data pipelines or S3-like systems — it directly maps to multi-part upload/download patterns.

---

## 📋 Requirements Clarification

**Functional:**
- Download files from URLs (HTTP/HTTPS)
- Split large files into N chunks, download in parallel
- Pause, resume, cancel downloads
- Show real-time progress per download
- Queue management: max concurrent downloads, priority queue

**Non-Functional:**
- Thread-safe chunk management
- Retry failed chunks with exponential backoff
- Persist download state for crash recovery

---

## 🧩 Core Entities & Enums

```java
public enum DownloadStatus { QUEUED, DOWNLOADING, PAUSED, COMPLETED, FAILED, CANCELLED }

public class DownloadChunk {
    private final int chunkId;
    private final long startByte, endByte;
    private DownloadStatus status;
    private int retryCount;
    private long downloadedBytes;
}

public class DownloadTask {
    private final String id;
    private final String url;
    private final String destinationPath;
    private final List<DownloadChunk> chunks;
    private DownloadStatus status;
    private final int totalChunks;
    private final AtomicInteger completedChunks = new AtomicInteger(0);
}

public interface DownloadListener {
    void onProgress(String taskId, double percentage);
    void onComplete(String taskId);
    void onError(String taskId, String error);
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Observer (Progress Tracking)

```java
public class DownloadTask {
    private final List<DownloadListener> listeners = new CopyOnWriteArrayList<>();

    public void addListener(DownloadListener listener) { listeners.add(listener); }

    private void notifyProgress() {
        double pct = (completedChunks.get() * 100.0) / totalChunks;
        listeners.forEach(l -> l.onProgress(id, pct));
    }
}
```

**Why Observer?** The UI, the progress bar, and the notification system all need progress updates — but the download engine shouldn't know about any of them. Observers register themselves; the engine just fires events.

### Chunked Download with Thread Pool

```java
public class DownloadEngine {
    private final ExecutorService threadPool;
    private final int maxConcurrentDownloads;

    public DownloadEngine(int threads) {
        this.threadPool = Executors.newFixedThreadPool(threads);
    }

    public void startDownload(DownloadTask task) {
        task.setStatus(DownloadStatus.DOWNLOADING);
        for (DownloadChunk chunk : task.getChunks()) {
            threadPool.submit(() -> downloadChunk(task, chunk));
        }
    }

    private void downloadChunk(DownloadTask task, DownloadChunk chunk) {
        int retries = 0;
        while (retries < 3) {
            try {
                HttpURLConnection conn = openRangeRequest(task.getUrl(),
                    chunk.getStartByte(), chunk.getEndByte());
                writeChunkToFile(conn.getInputStream(), task, chunk);
                chunk.setStatus(DownloadStatus.COMPLETED);
                int done = task.getCompletedChunks().incrementAndGet();
                task.notifyProgress();
                if (done == task.getTotalChunks()) task.setStatus(DownloadStatus.COMPLETED);
                return;
            } catch (IOException e) {
                retries++;
                sleepExponential(retries); // 1s, 2s, 4s
            }
        }
        chunk.setStatus(DownloadStatus.FAILED);
        task.setStatus(DownloadStatus.FAILED);
    }

    private HttpURLConnection openRangeRequest(String url, long start, long end) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestProperty("Range", "bytes=" + start + "-" + end);
        return conn;
    }
}
```

**Why HTTP Range requests?** The `Range: bytes=X-Y` header lets you download a specific byte range. IDM splits a 100MB file into 8 chunks of 12.5MB each, downloads them in parallel, then merges. This is the same mechanism S3 uses for multipart downloads.

### Pause & Resume

```java
public class DownloadManager {
    private final Map<String, DownloadTask> tasks = new ConcurrentHashMap<>();
    private final Map<String, Future<?>> futures = new ConcurrentHashMap<>();

    public void pause(String taskId) {
        DownloadTask task = tasks.get(taskId);
        task.setStatus(DownloadStatus.PAUSED);
        // Persist chunk state to disk — only incomplete chunks need re-downloading
        persistState(task);
    }

    public void resume(String taskId) {
        DownloadTask task = loadState(taskId); // restore from disk
        List<DownloadChunk> incomplete = task.getChunks().stream()
            .filter(c -> c.getStatus() != DownloadStatus.COMPLETED)
            .collect(Collectors.toList());
        engine.startChunks(task, incomplete); // only re-download incomplete chunks
    }
}
```

### Priority Queue for Download Scheduling

```java
public class DownloadScheduler {
    // Higher priority = downloaded first
    private final PriorityBlockingQueue<DownloadTask> queue =
        new PriorityBlockingQueue<>(100, Comparator.comparingInt(DownloadTask::getPriority).reversed());

    public void enqueue(DownloadTask task) { queue.offer(task); }

    public DownloadTask next() throws InterruptedException { return queue.take(); }
}
```

---

## ⚠️ Edge Cases to Mention

| Edge Case | Handling |
|---|---|
| Server doesn't support Range | Fall back to single-threaded download |
| Chunk download fails 3 times | Mark task FAILED, notify listener |
| Disk full mid-download | Catch `IOException`, pause task, notify user |
| Same URL downloaded twice | Dedup by URL hash in `DownloadManager` |
| App crash mid-download | Persist chunk state to JSON file; resume on restart |

---

## 🗣️ How to Explain in the Interview

> "The core insight is HTTP Range requests — they let me download byte ranges in parallel. I split the file into N chunks, submit each to a thread pool, and use an `AtomicInteger` to track completion without locks. The Observer pattern decouples the download engine from the UI — the engine fires progress events, and any number of listeners (progress bar, notification, analytics) can subscribe. For pause/resume, I persist the chunk state to disk — on resume, I only re-download incomplete chunks."
