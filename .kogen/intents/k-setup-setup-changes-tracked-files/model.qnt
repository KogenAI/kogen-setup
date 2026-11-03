module setup_tracked {
  var dirty: bool
  var kept: bool
  var repeatable: bool
  action init = all { dirty' = false, kept' = false, repeatable' = true }
  action step = nondet changed = Set(true, false).oneOf()
    nondet repeats = Set(true, false).oneOf()
    all { dirty' = false, kept' = (not(changed) and repeats), repeatable' = repeats }
  val Restored = not(dirty)
  val KeptRepeatable = kept implies repeatable
}
