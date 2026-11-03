module route {
 var saved: bool
 var logins: int
 var chosen: bool
 var asked: bool
 var committed: bool
 action init = {
  nondet n = Set(0, 1, 2).oneOf()
  nondet s = Set(false, true).oneOf()
  all { saved' = s, logins' = n, chosen' = false, asked' = false, committed' = false }
 }
 action step = any {
  all { not(saved), logins > 0, chosen' = true, saved' = saved, logins' = logins, asked' = asked, committed' = committed },
  all { not(saved), logins > 0, (logins == 1 or chosen), asked' = true, saved' = saved, logins' = logins, chosen' = chosen, committed' = committed },
  all { asked, committed' = true, saved' = saved, logins' = logins, chosen' = chosen, asked' = asked },
  all { saved' = saved, logins' = logins, chosen' = chosen, asked' = asked, committed' = committed }
 }
 val Safe = (asked implies (not(saved) and logins > 0 and (logins == 1 or chosen))) and (committed implies asked)
}
