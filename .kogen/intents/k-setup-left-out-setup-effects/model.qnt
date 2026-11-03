module model {
 var kept: int
 var tree: int
 var active: bool
 val Clean = active or tree == kept
 action init = all { kept' = 0, tree' = 0, active' = false }
 action step = any {
  all { not(active), active' = true, tree' = tree + 1, kept' = kept },
  all { active, active' = false, tree' = kept, kept' = kept },
  all { active, active' = false, kept' = tree, tree' = tree }
 }
}
