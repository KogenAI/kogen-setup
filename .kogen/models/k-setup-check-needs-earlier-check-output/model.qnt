module model {
 var dirty: bool
 var running: bool
 action init = all { dirty' = false, running' = false }
 action step = if (running) { all { dirty' = false, running' = false } } else { all { dirty' = true, running' = true } }
 val CleanBetweenChecks = running or not(dirty)
}
