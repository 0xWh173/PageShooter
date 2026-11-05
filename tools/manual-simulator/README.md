# Ancient Magical Book — Manual CLI Simulator (Phase 1)

This terminal-based interactive simulator is a manual testing environment for the **Phase 1 pure TypeScript rules engine** (`@pageshooter/game-engine` and `@pageshooter/shared`).

It allows you to play through matches, trigger rolls, test manual overrides, fire shots, inspect the live battlefield, and verify every game rule before building UI components.

---

## 1. Quick Start

### Installation
Dependencies are already configured. If needed, install via:
```powershell
npm install
```

### Launch Simulator
Run the simulator in Windows PowerShell or any terminal:
```powershell
npm run manual-test
```

---

## 2. Battlefield Display

```text
====================================================================
   PAGE SHOOTER — ANCIENT MAGICAL BOOK SIMULATOR (PHASE 1)
====================================================================
Status: ACTIVE | Total Turns: 1 | Players: 5
Current Turn: P1 (Player 1) | Turn #1 | Phase: AWAITING_ROLL
🎲 Awaiting Roll. Use: roll [0|2|4|6|8]
--------------------------------------------------------------------
| Pos | Player   | Status     |  0   |  2   |  4   |  6   |  8   | Kills |
| --- | -------- | ---------- | ---- | ---- | ---- | ---- | ---- | ----- |
| P1* | Player 1 | ACTIVE     |  —  |  —  |  —  |  —  |  —  |    0  |
| P2  | Player 2 | ACTIVE     |  —  |  —  |  —  |  —  |  —  |    0  |
| P3  | Player 3 | ACTIVE     |  —  |  —  |  —  |  —  |  —  |    0  |
| P4  | Player 4 | ACTIVE     |  —  |  —  |  —  |  —  |  —  |    0  |
| P5  | Player 5 | ACTIVE     |  —  |  —  |  —  |  —  |  —  |    0  |
--------------------------------------------------------------------
Legend: — = Empty | X = Destroyed | Face/Body/Legs/Arms/Gun | * = Active Turn
====================================================================
```

---

## 3. Available Commands

| Command | Arguments | Description |
|---|---|---|
| `roll` | None | Rolls the ancient book using uniform cryptographic randomness (`[0,2,4,6,8]`, 20% each) and reveals page number between 1 and 500 ending in that digit. |
| `roll <val>` | `0`, `2`, `4`, `6`, or `8` | **Testing Override:** Manually forces an outcome digit for deterministic testing (e.g., `roll 4`). |
| `shoot` | `<TargetPos> <Cell>` | Fires a mandatory shot when pending (e.g., `shoot P2 0`). Target can be `P1..P10` or player ID. |
| `show` | None | Re-renders the complete battlefield table. |
| `log` | `[count]` | Displays the most recent match events with sequences and timestamps (default: 10). |
| `reset` | `[5-10]` | Starts a new match with 5 to 10 players (default: 5). |
| `help` | None | Displays help message and command syntax. |
| `quit` / `exit` | None | Exits the simulator. |

---

## 4. Step-by-Step Manual Test Walkthrough

Use these commands sequentially in the simulator to test all rules:

### Scenario 1: Progression Through All 6 Stages & First Mandatory Shot
1. `roll 0` — P1 rolls cell 0 $\to$ progresses to **Face**. Turn advances to P2.
2. Advance through other players: `roll 2`, `roll 2`, `roll 2`, `roll 2` until turn returns to P1.
3. `roll 0` — P1 rolls cell 0 $\to$ progresses to **Body**.
4. Cycle turns back to P1, then `roll 0` $\to$ progresses to **Legs**.
5. Cycle turns back to P1, then `roll 0` $\to$ progresses to **Arms**.
6. Cycle turns back to P1, then `roll 0` $\to$ progresses to **Gun** (5th roll).
   - *Observation:* Cell 0 becomes `Gun`. No shot is fired yet! Turn completes and advances to next player.
7. Cycle turns back to P1, then `roll 0` $\to$ **6th matching roll!**
   - *Observation:* 1 bullet is awarded, and `turn.phase` becomes `AWAITING_SHOT`. Mandatory shot required!
8. `shoot P2 0` — P1 shoots P2's cell 0.
   - *Observation:* P2's cell 0 is destroyed (`X`). P1 gets 1 kill. Turn advances.

### Scenario 2: Earning a Subsequent Bullet & Shot (Roll 7+)
1. Cycle turns back to P1.
2. `roll 0` — 7th roll on gun cell.
   - *Observation:* Another bullet awarded and mandatory shot required.
3. `shoot P2 2` — P1 shoots P2's cell 2.

### Scenario 3: Wasted Turn on a Destroyed Cell
1. Let P2's turn arrive (P2's cell 0 was destroyed in Scenario 1).
2. Enter `roll 0` for P2.
   - *Observation:* `[TURN WASTED] Cell 0 is already destroyed! Turn forfeited.` Turn immediately advances with no progression or bullets.

### Scenario 4: Target Validity & Rejection Checks
1. When P1 has a pending shot (`AWAITING_SHOT`):
   - Attempt shooting self: `shoot P1 2` $\to$ Rejection: `[GameRuleError: INVALID_TARGET] Shooter cannot target their own column.` State remains unchanged.
   - Attempt shooting an already destroyed cell: `shoot P2 0` $\to$ Rejection: `[GameRuleError: CELL_DESTROYED] Target cell is already destroyed.` Shot is not consumed.
   - Target an empty opponent cell: `shoot P3 4` $\to$ Destroys empty cell cleanly.
   - Target a partially progressed opponent cell: `shoot P4 2` $\to$ Destroys partially progressed cell.

### Scenario 5: Player Elimination & Turn Skipping
1. Target all 5 cells of player P2 (`0, 2, 4, 6, 8`).
2. When the 5th cell is destroyed:
   - *Observation:* P2 status transitions to `ELIMINATED`. Event `PLAYER_ELIMINATED` is logged.
3. Advance turns:
   - *Observation:* Turn cyclically jumps from P1 directly to P3, completely skipping eliminated P2.

### Scenario 6: Player Counts (5 and 10 Players)
1. `reset 5` — Starts a 5-player match ($P_1 \dots P_5$).
2. `reset 10` — Starts a 10-player match ($P_1 \dots P_{10}$).
3. `reset 4` or `reset 11` $\to$ Rejects with error (player count must be between 5 and 10).

### Scenario 7: Victory Condition
1. Eliminate all players except one.
   - *Observation:* Match phase transitions to `COMPLETED`. Winner declared (`LAST_PLAYER_STANDING`). Total turns and kills recorded.
2. Gameplay commands like `roll` are blocked post-match until `reset`.
