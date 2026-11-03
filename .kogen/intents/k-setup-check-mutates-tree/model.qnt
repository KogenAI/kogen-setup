module model {
 var tree: int
 var kept: Set[int]
 var cursor: int
 val Clean = tree == 0
 val NoFixer = not(kept.contains(0))
 action init = all { tree' = 0, kept' = Set(), cursor' = 0 }
 action step = all {
  tree' = 0,
  kept' = if (cursor == 0) kept else kept.union(Set(cursor)),
  cursor' = cursor + 1
 }
}
