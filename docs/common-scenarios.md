# Scoring Scenarios — Master Reference

> **Purpose:** This document is the source of truth for how the Dugout app handles every common play scenario. Engine code, auto-advance defaults, and tests all derive from this document. If a scenario is missing or wrong here, the app will be wrong too.
>
> **How to read the tables:**
> - **Deterministic** = always happens, no user choice needed
> - **Default** = what the app pre-fills (high likelihood), user CAN override
> - **User decides** = no pre-fill, user must choose
> - Runner notation: `1B→2B` means runner on first advances to second; `Stay` means runner remains
> - Outs column refers to outs _before_ the play
>
> **Sport/ruleset annotations:**
> - ⚾ **Baseball only** — does not apply to softball
> - 🥎 **Softball only** — does not apply to baseball
> - 📋 **Ruleset-dependent** — behavior varies by league/level; check `GameRules` config

---

## 0. Sport & Ruleset Applicability

Most scoring scenarios in this document apply identically to both baseball and softball. The core mechanics — hits, outs, force plays, sacrifice flies, walks, HBP, errors, double plays, undo — are the same across both sports and all rulesets.

**Sections with sport-specific or ruleset-specific differences:**

| Section | Difference | Annotation |
|---------|-----------|------------|
| §8 Stolen Base / Caught Stealing | No-leadoff rules in Little League and most softball | 📋 Ruleset-dependent |
| §9 Balk / Illegal Pitch | Balk is baseball-only. Softball uses "illegal pitch" with different mechanics | ⚾ / 🥎 Split section |
| §13 Inning Transitions | Extra-inning auto-runner on 2B varies by ruleset | 📋 Ruleset-dependent |
| §15 Dropped Third Strike | Disabled in some youth softball leagues | 📋 Ruleset-dependent |
| §17 Softball-Specific Scenarios | Look-back rule, illegal pitch, DP/FLEX lineup | 🥎 Softball only |

**Ruleset matrix — features that affect scoring logic:**

| Feature | MLB | NCAA BB | HS BB | LL BB | NCAA SB | HS SB | LL SB |
|---------|-----|---------|-------|-------|---------|-------|-------|
| Balk | Yes | Yes | Yes | Yes | No | No | No |
| Illegal pitch | No | No | No | No | Yes | Yes | Yes |
| Dropped 3rd strike | Yes | Yes | Yes | Varies | Yes | Yes | Varies |
| Runner leadoffs | Yes | Yes | Yes | No | No* | No* | No |
| Extra-inning auto-runner (2B) | Yes | Yes | No | No | Yes | No | No |
| DP/FLEX (10 batters) | No | No | No | No | Yes | Yes | No |
| Courtesy runners | No | No | Some states | No | No | Some states | No |
| Look-back rule | No | No | No | No | Yes | Yes | Yes |

\* NCAA/HS softball: runners may leave on release (not on pitch crossing plate like LL).

**For the engine:** The `GameRules` config on each game controls these toggles. The auto-advance module and scoring engine should check `game.sport` and `game.rules` to determine which rules apply. Sections below annotate where behavior branches.

---

## 1. Hits

### 1.1 Singles

| ID | Outs | Runners | Batter (deterministic) | Runner Defaults | User Can Override |
|----|------|---------|----------------------|-----------------|-------------------|
| H-S1 | Any | None | → 1B | — | — |
| H-S2 | Any | 1B | → 1B | 1B→2B (forced) | 1B: out, 3B |
| H-S3 | Any | 2B | → 1B | 2B→3B | 2B: stay, score, out |
| H-S4 | Any | 3B | → 1B | 3B→Home | 3B: stay, out |
| H-S5 | Any | 1B+2B | → 1B | 1B→2B (forced), 2B→3B | 2B: stay (if not forced*), score, out |
| H-S6 | Any | 1B+3B | → 1B | 1B→2B (forced), 3B→Home | 3B: stay, out |
| H-S7 | Any | 2B+3B | → 1B | 2B→3B, 3B→Home | Each: stay, advance, out |
| H-S8 | Any | Loaded | → 1B | 1B→2B (forced), 2B→3B (forced), 3B→Home (forced) | Override: runner out at any base |

*Note on H-S5: 2B is NOT force-advanced on a single with 1B+2B. The batter forces 1B→2B, but 2B→3B is discretionary. The runner on 2B can stay if the ball is fielded quickly. However, the _likely_ outcome is 2B→3B, so it's the default.

**Force advancement rule on singles:** Only runners directly behind the batter in a continuous chain from 1B are forced. Batter forces 1B. If 1B was occupied, 1B→2B is forced. If 2B was ALSO occupied (bases loaded or 1B+2B), then 2B→3B is forced. But if only 2B is occupied (no 1B), 2B is NOT forced on a single.

### 1.2 Doubles

| ID | Outs | Runners | Batter (deterministic) | Runner Defaults | User Can Override |
|----|------|---------|----------------------|-----------------|-------------------|
| H-D1 | Any | None | → 2B | — | — |
| H-D2 | Any | 1B | → 2B | 1B→3B | 1B: score, out |
| H-D3 | Any | 2B | → 2B | 2B→Home | 2B: 3B, out |
| H-D4 | Any | 3B | → 2B | 3B→Home | — (virtually always scores) |
| H-D5 | Any | 1B+2B | → 2B | 1B→3B, 2B→Home | 1B: score, out. 2B: 3B, out |
| H-D6 | Any | 1B+3B | → 2B | 1B→3B, 3B→Home | 1B: score, out |
| H-D7 | Any | 2B+3B | → 2B | 2B→Home, 3B→Home | Each: 3B (for 2B runner), out |
| H-D8 | Any | Loaded | → 2B | 1B→3B, 2B→Home, 3B→Home | 1B: score, out |

### 1.3 Triples

| ID | Outs | Runners | Batter (deterministic) | Runner Defaults | User Can Override |
|----|------|---------|----------------------|-----------------|-------------------|
| H-T1 | Any | None | → 3B | — | — |
| H-T2 | Any | 1B | → 3B | 1B→Home | 1B: out |
| H-T3 | Any | 2B | → 3B | 2B→Home | 2B: out |
| H-T4 | Any | 3B | → 3B | 3B→Home | — |
| H-T5 | Any | Any combo | → 3B | All runners→Home | Each: out |

### 1.4 Home Runs

| ID | Outs | Runners | Result (all deterministic) |
|----|------|---------|--------------------------|
| H-HR1 | Any | None | Batter scores |
| H-HR2 | Any | 1B | Batter scores, 1B scores |
| H-HR3 | Any | 2B | Batter scores, 2B scores |
| H-HR4 | Any | 3B | Batter scores, 3B scores |
| H-HR5 | Any | Any combo | ALL runners score + batter scores |

> Home runs are fully deterministic — no user input needed for runner destinations. App should auto-dispatch without showing runner resolution.

---

## 2. Outs

### 2.1 Ground Outs

| ID | Outs | Runners | Batter | Runner Defaults | Notes |
|----|------|---------|--------|-----------------|-------|
| O-G1 | Any | None | Out | — | Simple ground out |
| O-G2 | 0 | 1B | Out | 1B→2B (likely advance) | Could also be FC or DP — see §6 |
| O-G3 | 1 | 1B | Out | 1B→2B (likely advance) | Could be DP ending inning — see §6 |
| O-G4 | 2 | 1B | Out (3rd out) | 1B stranded | Inning over — no runner destinations needed |
| O-G5 | 2 | Any | Out (3rd out) | All stranded | Inning over |
| O-G6 | Any | 2B | Out | 2B→3B | 2B: stay, out |
| O-G7 | Any | 3B | Out | 3B: stay | 3B rarely advances on ground out (no sac fly) |
| O-G8 | Any | 2B+3B | Out | 2B: stay, 3B: stay | Ground outs rarely advance non-forced runners |

**Key rule — 3rd out:** When the batter's out makes 3 outs (e.g., O-G4, O-G5), no runner destinations are needed. The app should auto-strand all runners and end the half-inning. The "Record Play" button should be enabled as soon as the batter is marked out.

### 2.2 Fly Outs

| ID | Outs | Runners | Batter | Runner Defaults | Notes |
|----|------|---------|--------|-----------------|-------|
| O-F1 | Any | None | Out | — | Simple fly out |
| O-F2 | 0-1 | 3B | Out | 3B→Home (tag up, sac fly) | See §3 for sac fly details |
| O-F3 | 0-1 | 2B | Out | 2B: stay | 2B rarely tags on fly out (can advance to 3B) |
| O-F4 | 0-1 | 1B | Out | 1B: stay | 1B rarely tags on fly out |
| O-F5 | 0-1 | 2B+3B | Out | 3B→Home (tag up), 2B: stay | 2B can tag to 3B |
| O-F6 | 0-1 | 1B+3B | Out | 3B→Home (tag up), 1B: stay | |
| O-F7 | 2 | Any | Out (3rd out) | All stranded | Inning over |

**Tag-up rule:** On a fly out, runners can advance AFTER the catch. They must "tag up" (touch their current base after the catch) before advancing. Runner on 3B tagging and scoring is the most common (sac fly). Runners on 1B or 2B can also tag, but it's less common.

### 2.3 Line Outs & Popups

| ID | Outs | Runners | Batter | Runner Defaults | Notes |
|----|------|---------|--------|-----------------|-------|
| O-L1 | Any | None | Out | — | |
| O-L2 | 0-1 | Any runners | Out | All runners: stay | Runners rarely advance on line outs (caught quickly) |
| O-L3 | 2 | Any | Out (3rd out) | All stranded | Inning over |

> Line outs and popups are almost always simple outs where runners hold. Exception: a deep line drive could allow a tag-up from 3B, but this is rare enough to not be a default.

---

## 3. Sacrifice Fly

A sacrifice fly requires:
1. Batter is out on a fly ball (fly_out type, not ground, line, or popup)
2. Fewer than 2 outs BEFORE the play
3. At least one runner scores

| ID | Outs | Runners | Batter (deterministic) | Runner Defaults | User Can Override |
|----|------|---------|----------------------|-----------------|-------------------|
| SF1 | 0 | 3B | Out | 3B→Home | — |
| SF2 | 1 | 3B | Out | 3B→Home | — |
| SF3 | 0 | 2B+3B | Out | 3B→Home, 2B: stay | 2B: can advance to 3B |
| SF4 | 1 | 2B+3B | Out | 3B→Home, 2B: stay | 2B: can advance to 3B |
| SF5 | 0 | 1B+3B | Out | 3B→Home, 1B: stay | 1B: can advance to 2B |
| SF6 | 0 | Loaded | Out | 3B→Home, 2B: stay, 1B: stay | Each can tag up |
| SF7 | 1 | Loaded | Out | 3B→Home, 2B: stay, 1B: stay | Each can tag up |

**App behavior for sac fly:**
- Batter `to` = `out` is **deterministic and locked** (cannot be changed). Sac fly = batter is out by definition.
- Lead runner (3B) defaults to Home (scored). User can override to `stay` in rare cases (e.g., shallow fly, runner doesn't tag).
- Other runners default to `stay`. User can advance them (tag up).
- If user marks sac fly but no runner scores, the app should warn or remove the sac fly designation (it's just a regular fly out without a scoring runner).

**Sac fly is NOT possible with 2 outs** — the batter's out makes 3 outs, inning is over, no run scores.

---

## 4. Sacrifice Bunt

> **Official rule: MLB 9.08(a)–(c).** A sacrifice bunt has strict requirements. The batter MUST be out for it to be a sacrifice. If the batter reaches safely, the play is either a fielder's choice or a bunt single — never a sac bunt.

A sacrifice bunt requires ALL of:
1. Batter bunts and **is put out** at first base (or would have been except for an error)
2. At least one runner advances
3. Fewer than 2 outs BEFORE the play
4. In the scorer's judgment, the batter was sacrificing (not bunting for a hit)

| ID | Outs | Runners | Batter (deterministic) | Runner Defaults | User Can Override |
|----|------|---------|----------------------|-----------------|-------------------|
| SB1 | 0 | 1B | Out | 1B→2B | 1B: 3B (rare), out |
| SB2 | 1 | 1B | Out | 1B→2B | 1B: 3B, out |
| SB3 | 0 | 2B | Out | 2B→3B | 2B: stay, out |
| SB4 | 0 | 1B+2B | Out | 1B→2B, 2B→3B | Each can advance further, out |
| SB5 | 0 | Loaded | Out | 1B→2B, 2B→3B, 3B→Home | Each can be out |

**App behavior for sac bunt:**
- Batter `to` = `out` is **deterministic and locked**.
- Runners default to advancing one base.

### 4.1 When a Bunt is NOT a Sacrifice (MLB 9.08(b)–(c))

These scenarios look like sacrifice bunts but are scored differently:

| ID | Situation | What Happens | Scored As | Why |
|----|-----------|-------------|-----------|-----|
| BNT-FC1 | 0 out, 1B. Bunt, defense throws to 2B, gets runner. Batter safe at 1B. | Runner out at 2B, batter reaches 1B | **Fielder's Choice** | 9.08(c): a runner was put out attempting to advance → no sacrifice credit. Batter charged with AB. |
| BNT-FC2 | 0 out, 1B+2B. Bunt, defense throws to 3B, gets 2B runner. Batter safe at 1B, 1B→2B. | Lead runner out at 3B, trailing runners advance | **Fielder's Choice** | Same — runner put out on the bunt. |
| BNT-FC3 | 0 out, 1B+3B. Bunt, defense throws to 2B, gets 1B runner. Batter safe, 3B scores. | Runner from 1B out at 2B, 3B scores, batter at 1B | **Fielder's Choice** | Runner put out; batter reached because defense chose other runner. |
| BNT-H1 | 0 out, 1B. Bunt, defense tries to get runner at 2B but fails. Batter safe at 1B. Runner safe at 2B. | Both safe. No outs. | **Bunt Single** (if ordinary effort wouldn't have gotten batter) | 9.08(b): unsuccessful attempt to get runner + batter wouldn't have been out → hit, not sacrifice. |
| BNT-H2 | 0 out, 1B. Batter bunts for a hit (drag bunt). Safe at 1B. Runner advances. | Both safe. | **Bunt Single** | 9.08(a): scorer judges batter was bunting for a hit, not sacrificing. |

**App guidance:**
- If user selects an **out** outcome + "Sac Bunt": batter is auto-locked to out → this is correct sac bunt flow.
- If the batter is safe and a runner is out: user should select **FC** (fielder's choice), not sac bunt.
- If the batter is safe and nobody is out: user should select **1B** (single / bunt hit), not sac bunt.
- The "Sac Bunt" toggle only appears on out outcomes, so the app naturally prevents misuse — the batter cannot be marked safe when sac bunt is selected.

---

## 5. Fielder's Choice

Fielder's choice: the batter reaches base safely, but only because the defense chose to retire a different runner.

### 5.1 Ground Ball Fielder's Choice

| ID | Outs | Runners | Batter Default | Runner Defaults | Notes |
|----|------|---------|---------------|-----------------|-------|
| FC1 | 0 | 1B | → 1B | 1B→Out (at 2B) | Classic FC: SS fields, throws to 2B for force |
| FC2 | 0 | 2B | → 1B | 2B→Out (at 3B) | Less common |
| FC3 | 0 | 1B+2B | → 1B | Lead runner out, trailing advances | User picks which runner is out |
| FC4 | 0 | 1B+3B | → 1B | 1B→Out, 3B: stay or score | |
| FC5 | 0 | Loaded | → 1B | One runner out, others advance | User picks |

### 5.2 Bunt Fielder's Choice

When a batter bunts and reaches safely because the defense threw out a runner instead. See §4.1 (BNT-FC1–FC3) for the scoring rule (MLB 9.08(c)). These are handled identically to ground ball FC in the app:

| ID | Outs | Runners | Batter Default | Runner Defaults | Notes |
|----|------|---------|---------------|-----------------|-------|
| FC-B1 | 0 | 1B | → 1B | 1B→Out (at 2B) | Bunt FC: defense chose runner over batter |
| FC-B2 | 0 | 1B+2B | → 1B | Lead runner out, trailing advances | User picks which runner is out |
| FC-B3 | 0 | 1B+3B | → 1B | 1B→Out, 3B: stay or score | 3B may score on the play |

**App behavior:**
- Batter defaults to `1B` (reached safely).
- One runner defaults to `out`. User selects which runner and at which base.
- Notation: user taps fielding positions (e.g., `6-4` for SS to 2B).
- No sacrifice credit. At-bat charged. No hit credit.

---

## 6. Double Play / Triple Play

### 6.1 Force Double Play

| ID | Outs Before | Runners | Play | Result |
|----|------------|---------|------|--------|
| DP1 | 0 | 1B | Ground ball, 6-4-3 | 1B→Out (at 2B), Batter→Out (at 1B). 2 outs recorded. |
| DP2 | 0 | 1B+2B | Ground ball, 5-4-3 | 2B→Out (at 3B or 2B), Batter→Out (at 1B). 2B→stays/3B→out varies. |
| DP3 | 0 | Loaded | Ground ball, 1-2-3 | 3B→Out (at home), Batter→Out (at 1B). 2B→3B, 1B→2B or varies. |
| DP4 | 1 | 1B | Ground ball, 6-4-3 | 1B→Out, Batter→Out. **Inning over** (3 outs). All remaining runners stranded. |
| DP5 | 1 | 1B+3B | Ground ball, 6-4-3 | 1B→Out, Batter→Out. **Inning over**. 3B stranded. **Run does NOT score** (3rd out is a force out). |

**Critical rule — force out on 3rd out:** If the 3rd out of an inning is a FORCE out, **no runs score on that play**, even if a runner crossed home plate before the out was recorded. This applies to DP5 and similar scenarios.

### 6.2 Tag Double Play

| ID | Outs Before | Runners | Play | Result |
|----|------------|---------|------|--------|
| DP-T1 | 0 | 1B | Line drive caught (1 out), 1B doubled off (thrown back to 1B) | Batter out (line out), 1B→Out. 2 outs. |
| DP-T2 | 1 | 1B+3B | Line drive caught, 1B doubled off | Batter out, 1B out. **Inning over.** 3B: timing play — see §13. |

### 6.3 Triple Play

| ID | Outs Before | Runners | Play | Result |
|----|------------|---------|------|--------|
| TP1 | 0 | 1B+2B | Line drive caught, both runners doubled off | 3 outs. Inning over. |

**App behavior for multi-out plays:**
- When the user marks 2+ runners as `out`, the app auto-detects double/triple play.
- `outsRecorded` on the OutEvent is set to the count of runners marked out.
- If `state.outs + outsRecorded >= 3`, inning is over — remaining runners are stranded (no destinations needed).

---

## 7. Wild Pitch / Passed Ball

**Key distinction:**
- **Wild pitch (WP):** Pitch is so erratic the catcher cannot reasonably catch it. Charged to the pitcher. Runs scored on WP are **earned**.
- **Passed ball (PB):** Pitch is catchable but the catcher fails to handle it. Charged to the catcher. Runs scored on PB are **unearned**.

Both have the same effect on baserunners: runners MAY advance at their own risk.

### 7.1 Runner Advancement on WP/PB

| ID | Runners | Default | User Can Override | Notes |
|----|---------|---------|-------------------|-------|
| WP1 | 1B | 1B→2B | Stay, 3B, out | Most common WP scenario |
| WP2 | 2B | 2B→3B | Stay, Home, out | |
| WP3 | 3B | 3B→Home | Stay, out | Runner may not break for home |
| WP4 | 1B+2B | 1B→2B, 2B→3B | Each independent | |
| WP5 | 1B+3B | 1B→2B, 3B→Home | Each independent | 3B may stay, 1B almost always goes |
| WP6 | 2B+3B | 2B→3B, 3B→Home | Each independent | |
| WP7 | Loaded | 1B→2B, 2B→3B, 3B→Home | Each independent | |

**Important:** Runners advance INDEPENDENTLY on WP/PB. The app must NOT force all-or-none. Each runner gets their own destination choice, with the default being +1 base.

### 7.2 WP/PB During an At-Bat (Pitch Association)

A wild pitch or passed ball occurs ON a pitch. The pitch itself has a result (ball, strike, etc.) that affects the count.

| ID | Count Before | Pitch Result | WP/PB Effect | Combined Result |
|----|-------------|-------------|--------------|-----------------|
| WP-P1 | 2-1 | Ball (WP) | Runner advances | Count: 3-1. Runner moved. |
| WP-P2 | 3-1 | Ball (WP) | Runner advances + Walk | Walk issued. Runners advance from WP + walk force. |
| WP-P3 | 1-2 | Strike (PB) | Runner advances | Count: 1-2 (strike stands). Runner moved due to PB. |
| WP-P4 | 0-2 | Strike (WP) | Runner advances + K? | If strike 3: strikeout + WP. Dropped 3rd strike possible. |
| WP-P5 | Any | Ball (PB) | Runner stays? advances? | Count advances. Runner at catcher's mercy. |

**App flow for WP/PB during at-bat:**
1. User is in pitch phase, something goes wrong on the pitch.
2. User taps "Wild Pitch" or "Passed Ball" button (added to pitch phase).
3. App asks: "What was the pitch?" → Ball / Strike Swinging / Strike Looking.
4. Pitch result is applied to the count (may trigger walk or strikeout).
5. Runner resolution UI appears for each baserunner (default: +1 base).
6. If the pitch result triggers a walk: batter goes to 1B (forced), runners chain-advance first, then WP advancement applies on top.
7. If the pitch result triggers strikeout with WP: dropped 3rd strike rules may apply.

### 7.3 WP/PB Between At-Bats

Less common, but possible (e.g., catcher drops ball returning to pitcher). Handle as a standalone event with no pitch association.

---

## 8. Stolen Base / Caught Stealing

> 📋 **Ruleset-dependent:** Steal timing varies by league. In MLB/NCAA/HS baseball, runners may lead off at any time. In Little League baseball, runners may not leave the base until the pitch reaches the batter. In most softball, runners may not leave until the pitcher releases the ball (NCAA/HS) or until the pitch reaches the batter (LL). These timing differences do not change how steals are _recorded_ in the app — the event is the same — but they affect how often WP/PB-related steals occur and whether "delayed steals" are possible.

### 8.1 Stolen Base

| ID | Runners | Base Stolen | Runner Movement |
|----|---------|------------|-----------------|
| SB1 | 1B | 2B | 1B→2B |
| SB2 | 2B | 3B | 2B→3B |
| SB3 | 3B | Home | 3B→Home (steal of home — rare) |
| SB4 | 1B+3B | 2B (single steal) | 1B→2B, 3B stays |
| SB5 | 1B+2B | 2B+3B (double steal) | 1B→2B, 2B→3B |
| SB6 | 1B+3B | 2B+Home (double steal) | 1B→2B, 3B→Home |

**App behavior:** User selects runner + destination. Stolen base is a between-AB event (does not end the plate appearance). Current batter's count is preserved.

### 8.2 Caught Stealing

| ID | Runners | Attempted Base | Result |
|----|---------|---------------|--------|
| CS1 | 1B | 2B | 1B→Out. 1 out recorded. |
| CS2 | 2B | 3B | 2B→Out. |
| CS3 | 3B | Home | 3B→Out. |

**Special case — CS ending the inning (3rd out):** If CS is the 3rd out, the half-inning advances. The current batter's count is interrupted. On inning change, count resets to 0-0. On undo, the count for the interrupted at-bat must be restored (see §14).

---

## 9. Balk ⚾ / Illegal Pitch 🥎

### 9a. Balk ⚾ Baseball Only

A balk occurs when the pitcher makes an illegal motion on the mound with runners on base. Balks do not exist in softball.

| ID | Runners | Result (all deterministic) |
|----|---------|--------------------------|
| BK1 | 1B | 1B→2B |
| BK2 | 2B | 2B→3B |
| BK3 | 3B | 3B→Home |
| BK4 | 1B+2B | 1B→2B, 2B→3B |
| BK5 | 1B+3B | 1B→2B, 3B→Home |
| BK6 | 2B+3B | 2B→3B, 3B→Home |
| BK7 | Loaded | 1B→2B, 2B→3B, 3B→Home |

> Balk: ALL runners advance exactly one base. Fully deterministic. No outs. No user input needed for runner movement. Auto-dispatch.

### 9b. Illegal Pitch 🥎 Softball Only

In softball, the equivalent of a balk is an **illegal pitch** — the pitcher violates a delivery rule (e.g., crow-hop, stepping outside the pitching lane, not coming to a full stop). The mechanics differ from a baseball balk:

| ID | Runners | Ball Added? | Runner Movement | Notes |
|----|---------|------------|-----------------|-------|
| IP1 | None | Yes (+1 ball to count) | — | No runners to advance; batter gets a ball |
| IP2 | 1B | Yes | 1B→2B | Ball added to count AND runners advance |
| IP3 | 2B | Yes | 2B→3B | |
| IP4 | 3B | Yes | 3B→Home | |
| IP5 | Any combo | Yes | All runners +1 base | |
| IP6 | Any | Yes (ball 4) | Runners advance + walk | If the added ball is ball 4, batter walks AND runners advance |

**Key differences from baseball balk:**
- **Illegal pitch adds a ball to the batter's count.** A balk does not affect the count.
- If the illegal pitch is put in play, the offensive team can choose to accept the result of the play instead of the penalty. (The app should default to the penalty unless the user records an in-play result.)
- Illegal pitch can be called with NO runners on base (adds a ball). A balk requires runners on base.

**App behavior:**
- When `game.sport === 'softball'`: the "Balk" button in BetweenABPanel should be labeled "Illegal Pitch" and should also add a ball to the current batter's count.
- When `game.sport === 'baseball'`: existing balk behavior (runners advance, no count change).

---

## 10. Hit By Pitch

| ID | Runners | Batter (deterministic) | Runner Defaults | Notes |
|----|---------|----------------------|-----------------|-------|
| HBP1 | None | → 1B | — | |
| HBP2 | 1B | → 1B | 1B→2B (forced) | |
| HBP3 | 2B | → 1B | 2B: stay | Not forced |
| HBP4 | 3B | → 1B | 3B: stay | Not forced |
| HBP5 | 1B+2B | → 1B | 1B→2B (forced), 2B→3B (forced) | |
| HBP6 | 1B+3B | → 1B | 1B→2B (forced), 3B: stay | 3B not forced |
| HBP7 | Loaded | → 1B | 1B→2B, 2B→3B, 3B→Home (all forced) | RBI credited |

> HBP follows the same force-advancement chain as a walk: only runners directly in the force chain (continuous from 1B) are forced to advance. Non-forced runners stay.

---

## 11. Walks (BB, IBB)

| ID | Runners | Batter (deterministic) | Runner Movement (deterministic) | RBI |
|----|---------|----------------------|---------------------------------|-----|
| BB1 | None | → 1B | — | 0 |
| BB2 | 1B | → 1B | 1B→2B (forced) | 0 |
| BB3 | 2B | → 1B | 2B stays (not forced) | 0 |
| BB4 | 3B | → 1B | 3B stays (not forced) | 0 |
| BB5 | 1B+2B | → 1B | 1B→2B (forced), 2B→3B (forced) | 0 |
| BB6 | 1B+3B | → 1B | 1B→2B (forced), 3B stays | 0 |
| BB7 | 2B+3B | → 1B | 2B stays, 3B stays | 0 |
| BB8 | Loaded | → 1B | 1B→2B, 2B→3B, 3B→Home (all forced) | 1 |

> Walks are fully deterministic — force chain from 1B. No user input needed. Auto-dispatch.

**Force chain rule:** Batter goes to 1B. If 1B was occupied, 1B→2B. If 2B was ALSO occupied (in the chain), 2B→3B. If 3B was ALSO occupied (in the chain), 3B→Home. The chain stops at the first empty base.

---

## 12. Errors

### 12.1 Reached on Error (Batter)

| ID | Runners | Batter | Runner Defaults | Notes |
|----|---------|--------|-----------------|-------|
| E1 | None | → 1B (default) | — | Batter reaches, user picks base. No hit. |
| E2 | 1B | → 1B | 1B→2B | User decides runner destinations |
| E3 | Any | → User picks | User decides all | Base reached and runner movement is highly variable |

**Stats:** No hit credited. At-bat charged. Run scored on error = unearned.

### 12.2 Error on Hit Play

| ID | Play | Effect | Notes |
|----|------|--------|-------|
| E-H1 | Single + E9 | Batter gets single. Runner from 1B scores instead of stopping at 3B. | Hit credited. Error charged to RF. Extra advancement runs = unearned. |
| E-H2 | Double + E8 | Batter gets double. Runner from 1B scores on the error. | |

**App behavior:** After choosing a hit type, user can toggle "Error on play?" and select the fielder. Runner destinations are adjusted by the user to reflect the error's effect.

---

## 13. Inning Transitions — Force Play vs. Timing Play

This is one of the most critical rules for scoring accuracy.

> 📋 **Ruleset-dependent — Extra-inning auto-runner:** In MLB, NCAA baseball, and NCAA softball, extra innings begin with a runner automatically placed on 2B (the player who made the last out of the previous inning). This auto-runner is relevant for earned/unearned run tracking: **runs driven in by the auto-runner are unearned for the pitcher** (the pitcher didn't put that runner on base). The app should check `game.rules.extraInningAutoRunner` and flag runs scored by the auto-placed runner accordingly.

### 13.1 The Rule

- **3 outs end the half-inning.** Bases are cleared. Count resets to 0-0.
- **No run scores if the 3rd out is a FORCE out** — even if a runner crossed home plate before the force out was recorded.
- **A run CAN score if the 3rd out is a TAG out (not a force)** — but ONLY if the runner crossed home plate BEFORE the tag was applied. This is called a **timing play**.

### 13.2 Scenarios

| ID | Outs Before | Situation | Play | Does Run Score? | Why |
|----|------------|-----------|------|----------------|-----|
| IE1 | 2 | Runner 3B | Batter grounds out (force at 1B) | **NO** | 3rd out is a force out on the batter |
| IE2 | 2 | Runner 3B | Batter flies out | **NO** | 3rd out by batter. Inning over before runner can tag. |
| IE3 | 2 | Runners 1B+3B | Ground ball, force out at 2B on 1B runner | **NO** | 3rd out is a force out |
| IE4 | 1 | Runner 1B | DP: force at 2B (out #2), relay to 1B (out #3) | **NO** | 3rd out is force out on batter at 1B |
| IE5 | 1 | Runners 1B+3B | DP: 6-4-3 | **NO** | 3B crosses plate, but 3rd out (at 1B) is a force. Run wiped. |
| IE6 | 2 | Runners 1B+3B | Tag play: 1B runner caught in rundown, tagged out | **Timing play** — ask user | If 3B crossed plate before tag: YES. If after: NO. |
| IE7 | 2 | Runner 3B, batter reaches on error | Batter thrown out trying for 2B (tag, not force) | **Timing play** — ask user | Did 3B cross plate before the tag at 2B? |

**App behavior:**
- When `state.outs + outsRecorded >= 3`: inning is over.
- If ALL outs on the play are force outs: no runs score. Auto-zero any runners marked `Home` that haven't already been scored (or warn the user).
- If any out is a TAG play (non-force): **ask the user** if the run scored (timing play).
- For v0.1.2: Simplify by asking "Did the run score before the out?" when the 3rd out is not a clear force out.

### 13.3 What the App Should Do

1. **2 outs, batter makes 3rd out (any type):** Record batter out. All runners stranded. No runner destinations needed. Enable "Record Play" immediately.
2. **1 out, double play makes outs 2+3:** Record both outs. All remaining runners stranded. If any runner was marked Home AND 3rd out is a force → wipe that run (it doesn't count).
3. **0 outs, triple play:** Same as above but 3 outs recorded.

---

## 14. Undo Behavior

### 14.1 Count Preservation

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| U1 | Undo a single hit on a 2-1 count | At-bat returns to 2-1 count with the same pitch sequence |
| U2 | Undo a strikeout | At-bat returns to the pitch-phase with the count before the final strike |
| U3 | Undo a walk | At-bat returns to a 3-x count (before ball 4 was thrown) |
| U4 | Undo a CS that ended the inning | Return to previous half-inning. Restore interrupted batter's count. |
| U5 | Undo a WP/PB | Runners return to previous bases. If WP had a pitch association, that pitch is removed from the sequence. |
| U6 | Undo a substitution | Previous player restored to lineup slot. |

**Implementation:** The app uses event sourcing. `undoLastEvent()` removes the last event and re-derives state via `deriveGameState()`. The derived state includes the correct count, bases, outs, etc. The `AtBatPanel` must initialize from the derived state (not a hardcoded 0-0).

### 14.2 What Must Be Preserved

- Current batter's count (balls, strikes)
- Current batter's pitch sequence (for display)
- Pitcher's pitch count
- Base state
- Out count
- Score
- Batter index in lineup

---

## 15. Dropped Third Strike

> 📋 **Ruleset-dependent:** The dropped third strike rule exists in MLB, NCAA (both sports), and HS (both sports). However, it is **disabled in some youth/Little League divisions** — particularly younger age groups in both baseball and softball. When disabled, a dropped third strike is simply a strikeout; the batter cannot attempt to reach first. The app should check a `droppedThirdStrike` rules toggle (to be added to `GameRules`) to determine whether to offer the batter-runs-to-first option.

| ID | Situation | Batter Result | Notes |
|----|-----------|--------------|-------|
| DK1 | 1B empty, < 2 outs | Batter can run to 1B | If safe: reached on dropped K. If out: strikeout. |
| DK2 | 1B occupied, < 2 outs | Batter is OUT (cannot run) | Automatic strikeout. |
| DK3 | 2 outs, 1B occupied | Batter CAN run | With 2 outs, batter can run regardless of 1B. |
| DK4 | 2 outs, 1B empty | Batter can run | |

**Rules:**
- Batter can attempt to reach 1B on a dropped third strike when: (a) 1B is unoccupied, OR (b) there are 2 outs.
- If batter cannot run (DK2), it's recorded as a standard strikeout.
- Catcher can throw the batter out at 1B (or tag them). If batter is safe, no strikeout is charged.

---

## 16. App Auto-Advance Summary

This section consolidates what the app should pre-fill by play type. See `src/engine/autoAdvance.ts`.

### 16.1 Deterministic (no user override)

| Play Type | Batter | Runners |
|-----------|--------|---------|
| Home run | → Home | All → Home |
| Walk / IBB | → 1B | Force chain only |
| HBP | → 1B | Force chain only |
| Balk ⚾ | N/A (between-AB) | All +1 base |
| Illegal pitch 🥎 | N/A (between-AB) | All +1 base + ball added to count |
| Sac fly (batter) | → Out | — (runners are defaults, not deterministic) |
| Sac bunt (batter) | → Out | — |

### 16.2 Defaults (user can override)

| Play Type | Runner Defaults |
|-----------|----------------|
| Single | Forced runners advance. Non-forced: +1 base. |
| Double | All runners: +2 bases (or Home if that's fewer). |
| Triple | All runners: Home. |
| Fly out (0-1 outs) | 3B→Home (tag up). Others: stay. |
| Ground out | Forced runners: advance. Non-forced: stay. |
| WP/PB | Each runner: +1 base. |
| Sac fly (runners) | Lead runner (3B) → Home. Others: stay. |
| Sac bunt (runners) | All runners: +1 base. |
| FC | One runner out, others advance. Batter → 1B. |

### 16.3 No Default (user decides)

| Play Type | What User Decides |
|-----------|-------------------|
| Error (batter) | Which base batter reaches |
| Error (runner destinations) | Where runners end up |
| Timing play | Did the run score before the tag? |
| DP/TP (which runners) | Which runners are out, which advance |

---

## 17. Softball-Specific Scenarios 🥎

These scenarios apply only when `game.sport === 'softball'`. They cover rules that do not exist in baseball.

### 17.1 Look-Back Rule

The look-back rule applies in **NCAA softball, HS softball, and most youth softball**. It does NOT exist in baseball.

**Rule:** Once the pitcher has the ball in the pitching circle after a play, each runner must immediately either:
1. Advance to the next base, OR
2. Return to the base they occupy

If a runner **stops** (hesitates between bases, fakes advancing, or stands still off-base), they are **out**. The runner cannot reverse direction once they commit.

| ID | Situation | Play | Result |
|----|-----------|------|--------|
| LB1 | Runner on 2B, ball back to pitcher | Runner takes a few steps toward 3B, then stops | Runner is OUT (look-back violation) |
| LB2 | Runner on 1B, ball back to pitcher | Runner stays on 1B (not off base) | Legal — runner is on the base |
| LB3 | Runner on 2B, ball back to pitcher | Runner immediately runs to 3B | Legal — runner committed and advanced |
| LB4 | Runner on 3B, ball back to pitcher | Runner fakes toward home, stops | Runner is OUT |

**App behavior:**
- Look-back violations are recorded as outs (the runner is out at their current position).
- A new event type `look_back_violation` could be added, or it can be recorded as a generic out with a notation like "LBR" (look-back rule).
- For v0.1.2: note this rule in docs; implementation can be deferred to a future version. The user can manually record it as a caught-stealing or runner-out event.

### 17.2 DP/FLEX Lineup (10-Player Batting Order)

In **NCAA softball and HS softball**, teams may use a **DP/FLEX** system:
- **DP (Designated Player):** Bats in the lineup but does not play defense. Similar to the DH in baseball.
- **FLEX:** Plays defense but does not bat. The FLEX occupies the DP's defensive position.
- Together, 10 players are in the game: 9 defensive players + 1 DP who only bats (or equivalently, 9 batters + 1 FLEX who only plays defense).

**Scoring impact:**
- The batting order has 10 slots instead of 9 when DP/FLEX is active.
- The DP can enter the game defensively (replacing the FLEX), in which case only 9 players remain.
- The FLEX can enter the batting order (taking the DP's spot), in which case only 9 players remain.
- The DP and FLEX can re-enter for each other freely without it counting as a substitution.

| ID | Situation | Effect on Scoring |
|----|-----------|-------------------|
| DP1 | DP bats, FLEX plays defense | Normal — DP's at-bat is recorded. FLEX has no plate appearances. |
| DP2 | DP enters defensively (replaces FLEX) | 10→9 players. DP now bats AND plays defense. |
| DP3 | FLEX enters batting order (replaces DP) | 10→9 players. FLEX now bats AND plays defense. |
| DP4 | DP and FLEX swap mid-game | Substitution tracking must handle this without counting as a "normal" sub. |

**App behavior:**
- The `GameRules.dpFlex` flag already exists in the rules config.
- When `dpFlex === true`, lineup builder should allow a 10th batting slot.
- Substitution logic needs a DP/FLEX swap option that doesn't count toward re-entry limits.
- For v0.1.2: ensure lineup supports 10 slots when `dpFlex` is enabled. Full swap logic can be a future enhancement.

### 17.3 Courtesy Runners

> 📋 **Ruleset-dependent:** Available in some HS baseball and HS softball leagues (state-by-state).

**Rule:** A courtesy runner may replace the pitcher or catcher on the bases at any time, without it counting as a substitution. The original pitcher/catcher can return to base-running later.

| ID | Situation | Effect |
|----|-----------|--------|
| CR1 | Pitcher reaches 1B, courtesy runner enters | Courtesy runner takes 1B. Pitcher returns to mound. No sub recorded. |
| CR2 | Courtesy runner scores | Run is credited to the original batter (pitcher). Courtesy runner's ID is tracked for movement but the PA belongs to the pitcher. |
| CR3 | Courtesy runner is out | Out is recorded. Pitcher is not charged with the out for batting-stats purposes (they reached base). |

**App behavior:**
- Courtesy runners are a substitution-adjacent feature — they need lineup tracking but don't consume a substitution slot.
- For v0.1.2: document the rule. Implementation deferred. The user can manually substitute and note it.

### 17.4 No-Leadoff Stealing Rules

> 📋 **Ruleset-dependent:** Affects Little League (both sports) and most softball leagues.

**Rule variations:**

| League | When Runner Can Leave Base |
|--------|--------------------------|
| MLB / NCAA BB / HS BB | Any time (leadoffs allowed) |
| Little League BB | After pitch reaches the batter |
| NCAA Softball | On pitcher's release of the ball |
| HS Softball | On pitcher's release of the ball |
| Little League SB | After pitch reaches the batter |

**Scoring impact:** The timing of when a runner leaves doesn't change how stolen bases are _recorded_ — an SB is an SB. However:
- Runners are less likely to steal in no-leadoff leagues (shorter jump).
- WP/PB advancement is more constrained (runner starts closer to the base).
- "Delayed steals" (where the runner breaks late on purpose) are a strategy in no-leadoff leagues.

**App behavior:** No engine changes needed. The steal event is the same regardless of timing rules. This is primarily a documentation note for coaches using the app.

---

## 18. Future Engine Enhancements (Noted)

Rules and scenarios documented here but not yet implemented in the engine:

| Feature | Section | Status |
|---------|---------|--------|
| Illegal pitch event type | §9b | Documented. Engine uses balk event only. Softball illegal pitch needs a new event type or a `sport`-aware balk. |
| Look-back rule | §17.1 | Documented. Can be recorded as manual out. Dedicated event type deferred. |
| DP/FLEX 10-player lineup | §17.2 | `dpFlex` flag exists in rules. Lineup builder needs 10-slot support. |
| Courtesy runners | §17.3 | Documented. Implementation deferred. |
| `droppedThirdStrike` rules toggle | §15 | Documented. Toggle needs to be added to `GameRules`. |
| `allowLeadoffs` rules toggle | §17.4 | Documented. Informational only — no engine impact. |
| Extra-inning auto-runner earned/unearned | §13 | Documented. Earned-run tracking not yet implemented. |
