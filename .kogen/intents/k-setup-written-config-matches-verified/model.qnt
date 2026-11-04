module model {
 var committed: bool
 var equal: bool
 var present: bool
 action init = all { committed' = false, equal' = false, present' = false }
 action step = any {
   all { committed' = false, equal' = true, present' = true },
   all { committed' = false, equal' = false, present' = false },
   all { equal, committed' = true, equal' = equal, present' = present }
 }
 val Safe = committed implies (equal and present)
}
