---
tags: [dsa, interview, amazon]
---
# Amazon SDE2 Coding Round — 3-Day Prep Guide

**Goal:** Build pattern recognition + clean concept-to-code translation on the highest-frequency Amazon topics. Not full mastery — targeted readiness.

**Method for every problem:** (1) Read the problem, identify the pattern using the cheat sheet below. (2) Explain your approach out loud. (3) Write pseudocode. (4) Convert pseudocode to code with zero peeking. (5) State time/space complexity unprompted. (6) If wrong or stuck >10 min, look at the *approach only*, close it, and re-code from scratch.

---

## DAY 1 — Two Pointers/Sliding Window, Hashmaps/Prefix Sum, Trees & Graphs (BFS/DFS)

### Two Pointers / Sliding Window
**Pattern clues:** "contiguous subarray/substring," "longest/shortest window with property X," array/string + a running condition that shrinks/grows.
**Typical complexity:** O(n) time, O(1) or O(k) space.

1. Longest Substring Without Repeating Characters (M)
2. 3Sum (M)
3. Container With Most Water (M)
4. Longest Repeating Character Replacement (M)
5. Minimum Window Substring (H)
6. Trapping Rain Water (H)

### Hashmaps / Prefix Sum
**Pattern clues:** "count pairs/subarrays with sum X," need O(1) lookup, "have I seen this before."
**Typical complexity:** O(n) time, O(n) space.

1. Group Anagrams (M)
2. Product of Array Except Self (M)
3. Subarray Sum Equals K (M)
4. Longest Consecutive Sequence (M)
5. Continuous Subarray Sum (M)
6. Insert Delete GetRandom O(1) (M)

### Trees & Graphs (BFS/DFS)
**Pattern clues:** "shortest path in unweighted graph" → BFS. "Explore all paths / connectivity" → DFS. Grid problems ("islands," "rotting"), tree traversal.
**Typical complexity:** O(V+E) or O(rows×cols) time, O(V) space.

1. Binary Tree Level Order Traversal (M)
2. Number of Islands (M)
3. Clone Graph (M)
4. Course Schedule (M)
5. Serialize and Deserialize Binary Tree (H)
6. Word Ladder (H)

---

## DAY 2 — DP, Backtracking, Heaps, Union-Find/Topological Sort

### Dynamic Programming
**Pattern clues:** "min/max cost," "number of ways," "can you reach/partition," overlapping subproblems + optimal substructure.
**Typical complexity:** O(n) to O(n×m) time, O(n) to O(n×m) space.

1. House Robber (M)
2. Coin Change (M)
3. Longest Increasing Subsequence (M)
4. Unique Paths II (M)
5. Longest Common Subsequence (M)
6. Edit Distance (H)

### Backtracking
**Pattern clues:** "generate all combinations/permutations/subsets," "find all valid arrangements," decision tree with pruning.
**Typical complexity:** O(2^n) or O(n!) time, O(n) space for recursion stack.

1. Subsets (M)
2. Permutations (M)
3. Combination Sum (M)
4. Word Search (M)
5. Palindrome Partitioning (M)
6. N-Queens (H)

### Heaps / Priority Queue
**Pattern clues:** "kth largest/smallest," "top k frequent," "closest k points," need running min/max efficiently.
**Typical complexity:** O(n log k) time, O(k) space.

1. Kth Largest Element in an Array (M)
2. Top K Frequent Elements (M)
3. K Closest Points to Origin (M)
4. Task Scheduler (M)
5. Merge K Sorted Lists (H)
6. Find Median from Data Stream (H)

---

## DAY 3 — Timed Mock Set

Do these fully timed (25-30 min each), out loud, no new topics:

1. LRU Cache (M)
2. Merge Intervals (M)
3. Copy List with Random Pointer (M)
4. Meeting Rooms II (M)
5. Word Break (M)
6. Rotting Oranges (M)
7. Kth Largest Element in a Stream (M)
8. Two Sum II — Input Array Is Sorted (M)

---

## Pattern Cheat Sheet

| If the problem says / implies... | Likely pattern | Typical complexity |
|---|---|---|
| Contiguous subarray/substring, longest/shortest window | Sliding window | O(n) |
| Pair/triplet sum on a **sorted** array | Two pointers | O(n) or O(n log n) |
| Count subarrays/pairs with a sum property | Hashmap + prefix sum | O(n) |
| Search in a sorted array / find a boundary | Binary search | O(log n) |
| Shortest path, unweighted graph, level-by-level | BFS | O(V+E) |
| Explore all paths, connectivity, grid flood-fill | DFS | O(V+E) |
| Generate all combinations/permutations/subsets | Backtracking | O(2^n) / O(n!) |
| Min/max cost, count ways, optimal substructure | Dynamic programming | O(n) – O(n×m) |
| Kth largest/smallest, top-k, running min/max | Heap | O(n log k) |
| Connected components, cycle detection (undirected) | Union-Find | ~O(n·α(n)) |
| Ordering with dependencies ("must happen before") | Topological sort | O(V+E) |
