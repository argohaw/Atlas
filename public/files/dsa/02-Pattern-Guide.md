---
tags: [dsa, patterns, reference]
---
# DSA Pattern Recognition Guide

A quick reference for identifying which algorithm pattern to apply based on problem clues.

---

## Sliding Window

**When to use:** Contiguous subarray or substring problems with a condition that grows/shrinks.

```python
def max_sum_subarray(arr, k):
    window_sum = sum(arr[:k])
    max_sum = window_sum
    for i in range(k, len(arr)):
        window_sum += arr[i] - arr[i - k]
        max_sum = max(max_sum, window_sum)
    return max_sum
```

**Key problems:** Longest Substring Without Repeating Characters, Minimum Window Substring

---

## Two Pointers

**When to use:** Sorted array, pair/triplet sum, palindrome check, partition.

```python
def two_sum_sorted(arr, target):
    left, right = 0, len(arr) - 1
    while left < right:
        s = arr[left] + arr[right]
        if s == target: return [left, right]
        elif s < target: left += 1
        else: right -= 1
    return []
```

**Key problems:** 3Sum, Container With Most Water, Trapping Rain Water

---

## Binary Search

**When to use:** Sorted array, find boundary, minimize/maximize a value.

```python
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target: return mid
        elif arr[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1
```

**Key problems:** Search in Rotated Sorted Array, Find First and Last Position

---

## BFS / DFS

**When to use:**
- BFS → shortest path, level-order traversal, unweighted graph
- DFS → all paths, connectivity, flood fill, cycle detection

```python
from collections import deque

def bfs(graph, start):
    visited = set([start])
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
```

**Key problems:** Number of Islands, Word Ladder, Course Schedule

---

## Dynamic Programming

**When to use:** Overlapping subproblems + optimal substructure. Ask: *am I recomputing the same state?*

```python
# Bottom-up DP — Coin Change
def coin_change(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for coin in coins:
        for x in range(coin, amount + 1):
            dp[x] = min(dp[x], dp[x - coin] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1
```

**Key problems:** House Robber, Longest Common Subsequence, Edit Distance

---

## Heap / Priority Queue

**When to use:** Kth largest/smallest, top-k elements, running median.

```python
import heapq

def top_k_frequent(nums, k):
    count = {}
    for n in nums:
        count[n] = count.get(n, 0) + 1
    return heapq.nlargest(k, count.keys(), key=count.get)
```

**Key problems:** Merge K Sorted Lists, Find Median from Data Stream

---

## Backtracking

**When to use:** Generate all combinations, permutations, subsets. Decision tree with pruning.

```python
def subsets(nums):
    result = []
    def backtrack(start, path):
        result.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()
    backtrack(0, [])
    return result
```

**Key problems:** Combination Sum, Word Search, N-Queens
