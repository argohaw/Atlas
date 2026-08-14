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

### Stack (quick-hit — 45 min, from LeetCode Top Interview 150)
**Pattern clues:** "valid parentheses," "next greater element," "evaluate expression," need to track most-recent-unmatched item.
**Typical complexity:** O(n) time, O(n) space.

1. Valid Parentheses (E — fast warm-up)
2. Min Stack (M)
3. Evaluate Reverse Polish Notation (M)
4. Daily Temperatures (M)

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
**Pattern clues:** "min/max cost," "number of ways," "can you reach/partition," overlapping subproblems + optimal substructure. Ask: *if I brute-force this with recursion, am I recomputing the same state?*
**Typical complexity:** O(n) to O(n×m) time, O(n) to O(n×m) space (often reducible to O(n) or O(1)).

1. House Robber (M)
2. Coin Change (M)
3. Longest Increasing Subsequence (M)
4. Unique Paths II (M)
5. Longest Common Subsequence (M)
6. Edit Distance (H)

### Backtracking
**Pattern clues:** "generate all combinations/permutations/subsets," "find all valid arrangements," decision tree with pruning.
**Typical complexity:** O(2^n) or O(n!) time (exponential, pruned in practice), O(n) space for recursion stack.

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

### Matrix, Linked List, Intervals, Binary Search (quick-hits — ~1 hr total, from Top Interview 150)
These are fast to pattern-match and show up often at Amazon — don't skip, but don't over-invest either.

**Matrix** (clue: "in-place grid transform" → O(rows×cols)):
1. Rotate Image (M)
2. Spiral Matrix (M)

**Linked List** (clue: "reverse/reorder/detect cycle" → pointer manipulation, O(n)):
1. Reverse Linked List (E — fast warm-up)
2. Linked List Cycle (M)
3. Reorder List (M)

**Intervals** (clue: "overlapping ranges, merge/insert" → sort + sweep, O(n log n)):
1. Merge Intervals (M) *(already on Day 3 — skip duplicate)*
2. Insert Interval (M)

**Binary Search** (clue: "sorted array/rotated sorted array, find boundary" → O(log n)):
1. Search in Rotated Sorted Array (M)
2. Find First and Last Position of Element in Sorted Array (M)

### Union-Find / Topological Sort
**Pattern clues:** "connected components," "detect cycle in undirected graph" → Union-Find. "Ordering with dependencies," "can this be scheduled" → Topological sort.
**Typical complexity:** ~O(n·α(n)) for Union-Find, O(V+E) for topological sort.

1. Number of Connected Components in an Undirected Graph (M)
2. Course Schedule II (M)
3. Redundant Connection (M)
4. Accounts Merge (M)
5. Graph Valid Tree (M)
6. Alien Dictionary (H)

---

## DAY 3 — Timed Mock Set (mix of the above, Amazon high-frequency)

Do these fully timed (25-30 min each), out loud, no new topics — this is pure simulation:

1. LRU Cache (M)
2. Merge Intervals (M)
3. Copy List with Random Pointer (M)
4. Meeting Rooms II (M)
5. Word Break (M)
6. Rotting Oranges (M)
7. Kth Largest Element in a Stream (M)
8. Two Sum II — Input Array Is Sorted (M)

---

## Where LeetCode's Top Interview 150 Fits In

LeetCode's Top Interview 150 is a real, well-regarded curated list — but LeetCode itself notes it's designed for **3+ months** of prep, covering ~23 categories. In 3 days, doing all 150 isn't realistic and would dilute your focus on Amazon's actual highest-frequency topics.

**What's been pulled in from it (added above as quick-hits):** Stack, Linked List, Matrix, Intervals, Binary Search — these are fast to learn and genuinely show up in Amazon interviews.

**What's deliberately skipped, and why:**
- **Trie** — shows up more at companies with heavy autocomplete/search product surfaces; lower yield for Amazon backend/SDE2 rounds.
- **Bit Manipulation** — occasionally asked but rarely the crux of a round; low return on 3-day budget.
- **Divide & Conquer** (beyond what's covered via trees/DP) — usually shows up disguised inside a tree or array problem you'll already be practicing.
- **Math-heavy problems** — situational per-problem knowledge, not a transferable pattern like the others.

If round 1 goes well and you get more prep time before LLD/HLD rounds, revisiting the full Top Interview 150 at a slower pace is genuinely worth it — it's a strong list for the *next* stage of prep, just not this week.

---

## Pattern Cheat Sheet — Clue → Likely Pattern

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

Constraints are also a huge hint: n ≤ 20 → likely exponential/backtracking is fine. n ≤ 10^5 or 10^6 → needs O(n) or O(n log n). n ≤ 1000 with two nested loops mentioned → O(n²) DP is probably expected.

---

## If You're Bad at Finding Patterns — What To Actually Do

1. **Cover the tag, guess first.** When practicing from any list, hide the topic tag, read only the problem statement, and write down which pattern you *think* applies and why — before looking at the tag. This is the single highest-leverage drill for pattern recognition; reading tagged problems trains recall, not recognition.
2. **Write a one-line "why" after every solve.** Not the solution — just: *"Sliding window because we need a contiguous max-length substring with a shrink/grow condition."* This builds the explicit reasoning most people skip because it feels obvious in the moment and isn't stored anywhere.
3. **Practice in blocks first, mix later.** Right now, do 5-6 sliding window problems back to back rather than jumping between patterns. Once a pattern feels automatic, *then* mix it in with others (Day 3's job).
4. **Use constraints as your first read.** Before thinking about the story of the problem, read the input size and constraints. They frequently rule out 2-3 wrong patterns immediately.
5. **Always state the brute force first, out loud, even if you know it's not optimal.** Then ask explicitly: *"What work am I repeating?"* (→ hints at DP/memoization or hashmap) or *"Can I avoid the nested loop?"* (→ hints at two pointers/sliding window). This turns pattern-finding into a checklist instead of a flash of insight you're waiting on.
6. **If you genuinely can't find the pattern in an interview after 3-4 minutes**, say so out loud: *"I don't immediately see an optimized approach — let me start with brute force and think about where the repeated work is."* This is completely normal and interviewers respond far better to transparent thinking than silence.

---

## Time/Space Complexity Quick Reference

- **O(1) / O(log n):** binary search, heap peek, hashmap lookup
- **O(n):** single pass, sliding window, two pointers, most hashmap-based solutions
- **O(n log n):** sorting-based solutions, heap-based top-k, merge intervals
- **O(n²):** brute-force pair checking, unoptimized DP without space reduction
- **O(V + E):** BFS/DFS, topological sort
- **O(2^n) / O(n!):** backtracking (subsets, permutations) — expected and fine when n is small
- **Space:** always separately account for recursion stack depth (backtracking, DFS) — interviewers ask about this specifically at SDE2 level