---
tags: [lld, intermediate, system-design, amazon-interview, adobe-interview]
---
# LLD: Design an Internet Download Manager (IDM)

## 🎯 Why This Problem is Asked
IDM tests your understanding of:
- **Parallel downloads** (multiple connections)
- **Resume capability** (pause/resume, checksum validation)
- **Bandwidth management** (throttling, queue scheduling)
- **File integrity** (checksums, corruption handling)
- **Distributed storage** (chunk-based persistence)

Relevant for: CDN services, P2P systems, cloud storage sync engines, torrent clients.

---

## 📋 Requirements Clarification

**Functional:**
- Download files from HTTP/HTTPS URLs
- Pause/resume downloads (partial file resume)
- Parallel connections (split file into N chunks, download concurrently)
- Monitor progress (% complete, speed, ETA)
- Queue management (prioritize downloads)
- Checksum validation (MD5/SHA256)
- Schedule downloads (start at specific time)

**Non-Functional:**
- Handle network failures (retry with exponential backoff)
- Respect bandwidth limits (throttle to N Mbps)
- Support files up to 100GB
- Support concurrent downloads (10-100 active)
- Memory efficient (don't load entire file in RAM)

---

## 🧩 Core Entities & Enums

```java
public enum DownloadStatus { 
    QUEUED, STARTING, DOWNLOADING, PAUSED, COMPLETED, FAILED, CANCELLED 
}

public class Download {
    private final String downloadId;
    private final String url;
    private final String filename;
    private final long fileSizeBytes;
    private volatile DownloadStatus status;
    private volatile long downloadedBytes;
    private List<DownloadChunk> chunks;
    private String checksumMD5;
    private boolean checksumValidated;
}

public class DownloadChunk {
    private final int chunkIndex;
    private final long startByte;
    private final long endByte;
    private volatile long downloadedBytes;
    private volatile ChunkStatus status;
    private String tempFilePath;
}

public enum ChunkStatus { PENDING, DOWNLOADING, COMPLETED, FAILED, MERGED }

public class DownloadManager {
    private final int maxConcurrentDownloads;
    private final long maxBandwidthBps;  // bytes per second
    private final Queue<Download> downloadQueue;
    private final Map<String, Download> activeDownloads;
    private final Map<String, BandwidthThrottler> throttlers;
}
```

---

## 🏗️ Class Design & Patterns

### Pattern: Command Queue (Download Queue)

```java
public class DownloadQueue {
    private final PriorityQueue<Download> queue = new PriorityQueue<>(
        (d1, d2) -> Integer.compare(d2.getPriority(), d1.getPriority())  // max-heap
    );

    public void enqueue(Download download) {
        synchronized (this) {
            queue.offer(download);
            download.setStatus(DownloadStatus.QUEUED);
        }
    }

    public Download dequeue() {
        synchronized (this) {
            return queue.poll();
        }
    }

    public void reprioritize(String downloadId, int newPriority) {
        synchronized (this) {
            queue.stream()
                .filter(d -> d.getId().equals(downloadId))
                .findFirst()
                .ifPresent(d -> d.setPriority(newPriority));
        }
    }
}
```

### Parallel Download with Chunks

```java
public class ChunkedDownloader {
    private final Download download;
    private final int numChunks;
    private final BandwidthThrottler throttler;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    public ChunkedDownloader(Download download, BandwidthThrottler throttler) {
        this.download = download;
        this.throttler = throttler;
        this.numChunks = Math.min(4, (int)(download.getFileSizeBytes() / (1024*1024)));  // 1MB per chunk
    }

    public void download() throws IOException {
        // Step 1: Divide file into chunks
        long chunkSize = download.getFileSizeBytes() / numChunks;
        List<DownloadChunk> chunks = new ArrayList<>();
        
        for (int i = 0; i < numChunks; i++) {
            long start = i * chunkSize;
            long end = (i == numChunks - 1) ? download.getFileSizeBytes() - 1 : (i + 1) * chunkSize - 1;
            chunks.add(new DownloadChunk(i, start, end));
        }
        download.setChunks(chunks);

        // Step 2: Download each chunk in parallel
        List<Future<?>> futures = new ArrayList<>();
        for (DownloadChunk chunk : chunks) {
            futures.add(executor.submit(() -> downloadChunk(chunk)));
        }

        // Step 3: Wait for all chunks to complete
        for (Future<?> future : futures) {
            try {
                future.get();  // block until chunk done
            } catch (Exception e) {
                throw new IOException("Chunk download failed", e);
            }
        }

        // Step 4: Merge chunks into final file
        mergeChunks(chunks);
        validateChecksum();
    }

    private void downloadChunk(DownloadChunk chunk) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(download.getUrl()).openConnection();
        
        // Set byte range header
        conn.setRequestProperty("Range", "bytes=" + chunk.getStartByte() + "-" + chunk.getEndByte());
        conn.connect();

        if (conn.getResponseCode() != 206) {  // HTTP 206 = Partial Content
            throw new IOException("Server doesn't support range requests");
        }

        // Download to temp file
        try (InputStream in = conn.getInputStream();
             RandomAccessFile out = new RandomAccessFile(chunk.getTempFilePath(), "rw")) {
            
            out.seek(chunk.getStartByte());
            byte[] buffer = new byte[4096];
            int len;
            long downloaded = 0;
            
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
                downloaded += len;
                chunk.setDownloadedBytes(downloaded);
                download.addDownloadedBytes(len);
                
                // Throttle bandwidth
                throttler.acquire(len);  // sleep if needed to maintain rate
                
                // Check for pause
                while (download.getStatus() == DownloadStatus.PAUSED) {
                    Thread.sleep(100);
                }
            }
            
            chunk.setStatus(ChunkStatus.COMPLETED);
        }
    }

    private void mergeChunks(List<DownloadChunk> chunks) throws IOException {
        try (RandomAccessFile out = new RandomAccessFile(download.getFilename(), "rw")) {
            for (DownloadChunk chunk : chunks) {
                try (RandomAccessFile in = new RandomAccessFile(chunk.getTempFilePath(), "r")) {
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = in.read(buffer)) != -1) {
                        out.write(buffer, 0, len);
                    }
                }
                new File(chunk.getTempFilePath()).delete();  // clean up temp
                chunk.setStatus(ChunkStatus.MERGED);
            }
        }
    }

    private void validateChecksum() throws IOException {
        String computed = computeMD5(download.getFilename());
        if (!computed.equals(download.getChecksumMD5())) {
            throw new IOException("Checksum mismatch: expected " + download.getChecksumMD5() + ", got " + computed);
        }
        download.setChecksumValidated(true);
    }
}
```

### Bandwidth Throttler

```java
public class BandwidthThrottler {
    private final long maxBytesPerSecond;
    private volatile long windowStartMs = System.currentTimeMillis();
    private volatile long bytesDownloadedThisWindow = 0;

    public BandwidthThrottler(long maxBytesPerSecond) {
        this.maxBytesPerSecond = maxBytesPerSecond;
    }

    public void acquire(long bytes) {
        long now = System.currentTimeMillis();
        long windowElapsedMs = now - windowStartMs;

        if (windowElapsedMs >= 1000) {
            // New window
            windowStartMs = now;
            bytesDownloadedThisWindow = 0;
        }

        bytesDownloadedThisWindow += bytes;

        // Check if we've exceeded limit
        if (bytesDownloadedThisWindow > maxBytesPerSecond) {
            long excessBytes = bytesDownloadedThisWindow - maxBytesPerSecond;
            long sleepMs = (excessBytes * 1000) / maxBytesPerSecond;
            try {
                Thread.sleep(sleepMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
```

### Resume from Partial Download

```java
public class ResumableDownload {
    private final Download download;
    private final File tempMetadataFile;

    public void saveProgress() throws IOException {
        // Serialize download state
        try (ObjectOutputStream oos = new ObjectOutputStream(
                new FileOutputStream(tempMetadataFile))) {
            oos.writeObject(download);
        }
    }

    public Download loadProgress(String downloadId) throws IOException, ClassNotFoundException {
        // Deserialize and resume
        try (ObjectInputStream ois = new ObjectInputStream(
                new FileInputStream(tempMetadataFile))) {
            Download download = (Download) ois.readObject();
            download.setStatus(DownloadStatus.PAUSED);
            return download;
        }
    }

    public void resume() throws IOException {
        // Get current file size
        long currentSize = new File(download.getFilename()).length();
        
        // Create Range request for remaining bytes
        HttpURLConnection conn = (HttpURLConnection) new URL(download.getUrl()).openConnection();
        conn.setRequestProperty("Range", "bytes=" + currentSize + "-");
        conn.connect();

        if (conn.getResponseCode() == 206) {
            // Server supports resume
            try (InputStream in = conn.getInputStream();
                 RandomAccessFile out = new RandomAccessFile(download.getFilename(), "rw")) {
                
                out.seek(currentSize);
                byte[] buffer = new byte[4096];
                int len;
                
                while ((len = in.read(buffer)) != -1) {
                    out.write(buffer, 0, len);
                    download.addDownloadedBytes(len);
                }
            }
        } else {
            // Server doesn't support resume — restart from beginning
            new File(download.getFilename()).delete();
            download.reset();
        }
    }
}
```

---

## 🗄️ Database Design

```sql
CREATE TABLE downloads (
  id VARCHAR(50) PRIMARY KEY,
  url VARCHAR(2000) NOT NULL,
  filename VARCHAR(500),
  file_size_bytes BIGINT,
  downloaded_bytes BIGINT DEFAULT 0,
  status VARCHAR(20),  -- QUEUED, DOWNLOADING, PAUSED, COMPLETED, FAILED
  priority INT DEFAULT 1,
  checksum_md5 VARCHAR(32),
  checksum_validated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_created_at (created_at DESC)
);

CREATE TABLE download_chunks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  download_id VARCHAR(50) REFERENCES downloads(id),
  chunk_index INT,
  start_byte BIGINT,
  end_byte BIGINT,
  downloaded_bytes BIGINT,
  status VARCHAR(20),  -- PENDING, DOWNLOADING, COMPLETED
  temp_file_path VARCHAR(500),
  UNIQUE(download_id, chunk_index),
  INDEX idx_download_id (download_id)
);

CREATE TABLE download_sessions (
  id VARCHAR(50) PRIMARY KEY,
  download_id VARCHAR(50) REFERENCES downloads(id),
  started_at TIMESTAMP,
  paused_at TIMESTAMP,
  resumed_at TIMESTAMP,
  bandwidth_limit_bps BIGINT,
  INDEX idx_download_id (download_id)
);
```

---

## 🔌 API Routes & Contracts

```
POST   /api/v1/downloads
├─ Request:  { "url": "http://...", "filename": "file.zip", "priority": 1, "bandwidthLimitBps": 1000000 }
├─ Response: { "downloadId": "uuid", "status": "QUEUED", "estimatedTimeMs": 5000 }
└─ Latency:  < 10ms

GET    /api/v1/downloads/{downloadId}
├─ Response: {
│     "downloadId": "uuid",
│     "url": "http://...",
│     "status": "DOWNLOADING",
│     "downloadedBytes": 512000,
│     "fileSizeBytes": 1048576,
│     "percentComplete": 48.8,
│     "currentSpeedBps": 2097152,
│     "estimatedTimeRemainingMs": 250,
│     "chunks": [
│       { "index": 0, "status": "COMPLETED", "downloadedBytes": 262144 },
│       { "index": 1, "status": "DOWNLOADING", "downloadedBytes": 249856 }
│     ]
│   }
└─ Real-time progress tracking

POST   /api/v1/downloads/{downloadId}/pause
├─ Response: { "status": "PAUSED", "downloadedBytes": 512000 }
└─ Effect:   Save progress metadata, pause all chunks

POST   /api/v1/downloads/{downloadId}/resume
├─ Response: { "status": "DOWNLOADING" }
└─ Effect:   Resume from saved progress

DELETE /api/v1/downloads/{downloadId}
├─ Query:    ?deleteFile=true (delete downloaded file)
├─ Response: 204 No Content
└─ Effect:   Remove from queue, optionally delete temp files

GET    /api/v1/downloads/queue
├─ Response: [
│     { "downloadId": "...", "status": "QUEUED", "position": 0, "priority": 2 },
│     { "downloadId": "...", "status": "QUEUED", "position": 1, "priority": 1 }
│   ]
└─ For: queue management

GET    /api/v1/stats
├─ Response: {
│     "totalActive": 5,
│     "totalQueued": 12,
│     "currentBandwidthUsageBps": 5242880,
│     "maxBandwidthBps": 10485760,
│     "completedDownloads": 342
│   }
```

---

## 🏗️ Service Architecture

```
┌──────────────────────────────┐
│   User Interface (Desktop)   │
│  (Add URL, monitor progress) │
└──────────────┬───────────────┘
               │
        ┌──────▼──────────┐
        │ Download Manager│
        │                │
        │ • Queue mgmt   │
        │ • Resume logic │
        │ • Throttling   │
        └────────┬────────┘
                 │
        ┌────────▼────────────┐
        │ Chunked Downloader  │
        │                     │
        │ • Parallel threads  │
        │ • Range requests    │
        │ • Merge chunks      │
        └────────┬────────────┘
                 │
    ┌────────────┴────────────┬────────────┐
    │                         │            │
┌───▼────┐ ┌────────┐ ┌──────▼─────┐ ┌──▼────────┐
│HTTP    │ │Bandwidth│ │Temp Files  │ │Metadata DB
│Streams │ │Throttler│ │(per chunk) │ │(state)
└────────┘ └────────┘ └────────────┘ └───────────┘
```

### Complete Download Flow

```
User: Add download http://example.com/file.zip
    │
    ├─> DownloadManager.addDownload()
    ├─> Enqueue in downloadQueue (QUEUED status)
    │
    ├─> When dequeued:
    │   ├─> GET HEAD request to get file size
    │   ├─> Check if server supports range requests (206 response)
    │   ├─> Split into chunks (e.g., 4 chunks for 100MB file)
    │   ├─> Save metadata to database
    │   │
    │   ├─> Launch parallel downloads:
    │   │   ├─> Thread 1: Download bytes 0-24MB
    │   │   ├─> Thread 2: Download bytes 25-49MB
    │   │   ├─> Thread 3: Download bytes 50-74MB
    │   │   └─> Thread 4: Download bytes 75-99MB
    │   │
    │   ├─> Each thread:
    │   │   ├─> HTTP Range request
    │   │   ├─> Write to temp file
    │   │   ├─> Update progress (chunk % + total %)
    │   │   ├─> Apply bandwidth throttling
    │   │   ├─> Check for pause signal
    │   │   └─> Mark chunk COMPLETED
    │   │
    │   ├─> All chunks done:
    │   │   ├─> Merge temp files → final file
    │   │   ├─> Compute MD5 checksum
    │   │   ├─> Verify against expected checksum
    │   │   ├─> Mark COMPLETED
    │   │   └─> Notify UI
    │
    └─> User sees: Download completed, 50MB/s, 2min 30sec elapsed
```

---

## 📐 Scalability & HLD Thinking

**Throughput:**
- Single manager: 100 concurrent downloads
- With multiple managers: 10K+ concurrent downloads

**Latency:**
- Queue response: < 10ms
- Progress update: < 100ms
- Chunk download: depends on network (1-100 Mbps)

**Parallel Efficiency:**
- 4 chunks: ~3.5x faster (diminishing returns due to network congestion)
- More chunks: network interference, headers overhead
- Optimal: 2-8 chunks per file

**Resume Resilience:**
- Pause/resume: persistent across app restart
- Partial chunk download: resumable from byte offset
- Bandwidth limiting: prevents network saturation

---

## 🗣️ How to Explain in the Interview

> "I'd split the file into parallel chunks — each downloaded by a separate thread. This improves throughput ~3-4x (limited by network, not individual connection).

I'd use HTTP Range requests (RFC 7233) to download specific byte ranges. Server must return 206 Partial Content — if it doesn't, fall back to single connection.

For pause/resume, I'd save the download state (chunks, progress, checksums) to a metadata file. On resume, I check which chunks are incomplete and resume from the last byte of the incomplete chunk.

For bandwidth throttling, I'd track bytes downloaded in the current 1-second window and sleep if we exceed the limit. This prevents network congestion.

For checksum validation, I'd download the MD5 alongside the file. After download completes, compute MD5 of the downloaded file and compare — if mismatch, delete and retry.

For fault tolerance, I'd retry failed chunk downloads with exponential backoff (1s, 2s, 4s, ...). If a chunk repeatedly fails, mark the whole download as failed.

For queue management, I'd use a priority queue so premium users' downloads start before free users'. Implement priority-aging to prevent starvation of low-priority downloads."

---

## ✅ SOLID Checklist

| Principle | Applied How |
|---|---|
| **S** | `ChunkedDownloader` handles parallel, `BandwidthThrottler` handles rate limiting |
| **O** | New download strategies (different file types) = new classes |
| **D** | DownloadManager depends on interfaces, not concrete implementations |
