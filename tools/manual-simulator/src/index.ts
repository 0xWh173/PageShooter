import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  CELL_VALUES,
  CellValue,
  CELL_PROGRESS_LABELS,
  CellState,
  GameRuleError,
  MatchEvent,
  MatchState,
  MIN_PLAYERS,
  MAX_PLAYERS
} from "@pageshooter/shared";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  generateBookRoll,
  generatePageNumberForOutcome,
  CreatePlayerInput
} from "@pageshooter/game-engine";

export interface SimulatorSession {
  state: MatchState;
  eventsLog: MatchEvent[];
}

const FANTASY_NAMES = [
  "Aethelgard",
  "Balthazar",
  "Celestia",
  "Drakon",
  "Eldrin",
  "Faelan",
  "Gideon",
  "Hadriel",
  "Ignis",
  "Jorun"
];

export function createPlayers(count: number): CreatePlayerInput[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `player-${i + 1}`,
    username: FANTASY_NAMES[i] || `Mage-${i + 1}`,
    avatarId: `avatar-mage-${i + 1}`
  }));
}

let matchCounter = 0;

export function startMatch(playerCount: number = 5): SimulatorSession {
  matchCounter++;
  const result = createInitialMatchState(
    `sim-match-${Date.now()}-${matchCounter}`,
    "SIM-ROOM",
    createPlayers(playerCount)
  );
  return {
    state: result.state,
    eventsLog: [...result.events]
  };
}

export function renderCellStatus(cell: CellState): string {
  if (cell.destroyed) {
    return "  X  ";
  }
  if (cell.progress === 0) {
    return "  —  ";
  }
  const label = CELL_PROGRESS_LABELS[cell.progress];
  return label.padEnd(5, " ");
}

export function renderBattlefield(session: SimulatorSession): void {
  const state = session.state;
  console.log("\n" + "=".repeat(83));
  console.log("   PAGE SHOOTER — ANCIENT MAGICAL BOOK SIMULATOR (PHASE 1)");
  console.log("=".repeat(83));

  const currentTurnPlayer = state.players.find((p) => p.playerId === state.turn.currentPlayerId);
  const currentPos = currentTurnPlayer ? currentTurnPlayer.position : "None";
  const currentName = currentTurnPlayer ? currentTurnPlayer.username : "None";

  console.log(`Status: ${state.phase} | Total Turns: ${state.totalTurns} | Players: ${state.players.length}`);
  if (state.phase === "COMPLETED") {
    const winner = state.players.find((p) => p.playerId === state.winnerPlayerId);
    console.log(`🏆 MATCH COMPLETED! Winner: ${winner?.position} (${winner?.username}) [${state.winReason}]`);
  } else {
    console.log(`Current Turn: ${currentPos} (${currentName}) | Turn #${state.turn.turnNumber} | Phase: ${state.turn.phase}`);
    if (state.turn.phase === "AWAITING_SHOT") {
      console.log(`⚡ [MANDATORY SHOT REQUIRED] Gun cell ${state.turn.rolledCell} fired a bullet! (Bullets: 1)`);
      console.log(`   Use: shoot <TargetPosition> <CellNumber>  (e.g., shoot P2 4)`);
    } else {
      console.log(`🎲 Awaiting Roll. Use: roll [0|2|4|6|8]  (e.g., 'roll' for random, 'roll 4' for testing override)`);
    }
  }

  console.log("-".repeat(83));
  console.log("| Pos  | Player      | Status     | Bullets |  0   |  2   |  4   |  6   |  8   | Kills |");
  console.log("| ---- | ----------- | ---------- | ------- | ---- | ---- | ---- | ---- | ---- | ----- |");

  // Always display sorted strictly by numeric position P1..Pn
  const sortedPlayers = [...state.players].sort((a, b) => {
    const numA = parseInt(a.position.replace("P", ""), 10);
    const numB = parseInt(b.position.replace("P", ""), 10);
    return numA - numB;
  });

  for (const p of sortedPlayers) {
    const isCurrent = p.playerId === state.turn.currentPlayerId && state.phase === "ACTIVE";
    const posMarker = (isCurrent ? `${p.position}*` : p.position).padEnd(4, " ");
    const statusStr = p.status.padEnd(10, " ");
    const nameStr = p.username.padEnd(11, " ");
    const bulletStr = isCurrent && state.turn.pendingShot ? ` 1 (c${state.turn.rolledCell})` : "   0   ";
    const c0 = renderCellStatus(p.cells[0]);
    const c2 = renderCellStatus(p.cells[2]);
    const c4 = renderCellStatus(p.cells[4]);
    const c6 = renderCellStatus(p.cells[6]);
    const c8 = renderCellStatus(p.cells[8]);
    const killsStr = String(p.kills).padStart(3, " ");

    console.log(`| ${posMarker} | ${nameStr} | ${statusStr} | ${bulletStr} |${c0}|${c2}|${c4}|${c6}|${c8}|  ${killsStr}  |`);
  }
  console.log("-".repeat(83));
  console.log("Legend: — = Empty | X = Destroyed | Face/Body/Legs/Arms/Gun | * = Active Turn");
  console.log("=".repeat(83) + "\n");
}

export function resolvePlayerTarget(state: MatchState, inputStr: string): string | null {
  const clean = inputStr.trim().toUpperCase();
  // Match by position: P1..P10 or 1..10
  const posMatch = clean.startsWith("P") ? clean : `P${clean}`;
  const target = state.players.find(
    (p) =>
      p.position.toUpperCase() === posMatch ||
      p.username.toUpperCase() === clean ||
      p.playerId.toUpperCase() === clean
  );
  return target ? target.playerId : null;
}

function printHelp(): void {
  console.log(`
AVAILABLE COMMANDS:
  roll [outcome]          - Roll the ancient magical book.
                            Without argument: picks random uniform outcome [0,2,4,6,8] & page 1..500.
                            With argument (e.g. 'roll 4'): testing-only deterministic override.
  shoot <target> <cell>   - Shoot an opponent's cell when mandatory shot is pending.
                            Target can be position (P2, P3) or username (e.g. Drakon).
                            Cell must be 0, 2, 4, 6, or 8 (e.g. 'shoot P2 0').
  show                    - Re-render the complete battlefield state.
  log [count]             - Display recent match events (default: 10).
  reset [playerCount]     - Start a new match with 5-10 players (default: 5).
  help                    - Display this help message.
  quit / exit             - Exit the interactive simulator.
`);
}

function printLog(session: SimulatorSession, count: number = 10): void {
  const recent = session.eventsLog.slice(-count);
  console.log(`\n--- RECENT GAME EVENTS (last ${recent.length}) ---`);
  for (const evt of recent) {
    const actor = evt.actorPosition ? `[${evt.actorPosition}]` : "";
    const target = evt.targetPosition ? ` -> [${evt.targetPosition}]` : "";
    const detail = evt.cellValue !== undefined ? ` (Cell ${evt.cellValue})` : "";
    const page = evt.pageNumber ? ` Page ${evt.pageNumber}` : "";
    console.log(`  #${evt.sequence} ${evt.type} ${actor}${target}${detail}${page}`);
  }
  console.log("-------------------------------------------\n");
}

export async function runCli(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log("\n=======================================================");
  console.log(" Welcome to Ancient Magical Book CLI Manual Simulator");
  console.log(" Powered by @pageshooter/game-engine (Phase 1 Baseline)");
  console.log("=======================================================\n");

  let session = startMatch(5);
  renderBattlefield(session);
  printHelp();

  while (true) {
    try {
      const promptText = session.state.phase === "COMPLETED"
        ? "Match finished. Enter 'reset [5-10]' or 'quit'> "
        : `${session.state.turn.currentPlayerId ? session.state.players.find(p => p.playerId === session.state.turn.currentPlayerId)?.position : "Game"}> `;

      const rawInput = await rl.question(promptText);
      const trimmed = rawInput.trim();
      if (!trimmed) continue;

      const [command, ...args] = trimmed.split(/\s+/);
      const cmd = command.toLowerCase();

      if (cmd === "quit" || cmd === "exit") {
        console.log("Exiting manual simulator. Farewell, Mage!");
        break;
      }

      if (cmd === "help") {
        printHelp();
        continue;
      }

      if (cmd === "show") {
        renderBattlefield(session);
        continue;
      }

      if (cmd === "log") {
        const count = args[0] ? parseInt(args[0], 10) : 10;
        printLog(session, isNaN(count) ? 10 : count);
        continue;
      }

      if (cmd === "reset") {
        const count = args[0] ? parseInt(args[0], 10) : 5;
        if (isNaN(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
          console.log(`[Error] Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.`);
          continue;
        }
        session = startMatch(count);
        console.log(`\nNew match initialized with ${count} players!`);
        renderBattlefield(session);
        continue;
      }

      if (cmd === "roll") {
        if (session.state.phase === "COMPLETED") {
          console.log("[Notice] Match has already completed. Type 'reset' to play another match.");
          continue;
        }

        const currentP = session.state.players.find((p) => p.playerId === session.state.turn.currentPlayerId);
        if (!currentP) {
          console.log("[Error] No active turn player.");
          continue;
        }

        let outcome: CellValue;
        let pageNumber: number;

        if (args.length > 0) {
          // Manual testing override
          const parsed = parseInt(args[0], 10);
          if (!CELL_VALUES.includes(parsed as CellValue)) {
            console.log(`[Error] Invalid roll override: ${args[0]}. Must be one of: 0, 2, 4, 6, 8.`);
            continue;
          }
          outcome = parsed as CellValue;
          pageNumber = generatePageNumberForOutcome(outcome);
          console.log(`[TEST OVERRIDE] Forcing outcome digit ${outcome} on Page ${pageNumber}.`);
        } else {
          // Random outcome via official book roll
          const roll = generateBookRoll();
          outcome = roll.outcome;
          pageNumber = roll.pageNumber;
          console.log(`[BOOK ROLL] The magical book opens to Page ${pageNumber}... Ending digit: ${outcome}!`);
        }

        const res = applyRoll(session.state, currentP.playerId, outcome, pageNumber);
        session.state = res.state;
        session.eventsLog.push(...res.events);

        for (const evt of res.events) {
          if (evt.type === "TURN_WASTED") {
            console.log(`[TURN WASTED] Cell ${evt.cellValue} is already destroyed! Turn forfeited.`);
          } else if (evt.type === "CELL_PROGRESS_UPDATED") {
            const prog = evt.metadata?.progress;
            const hasGun = evt.metadata?.hasGun;
            const label = CELL_PROGRESS_LABELS[prog as keyof typeof CELL_PROGRESS_LABELS];
            console.log(`[PROGRESSION] Cell ${evt.cellValue} progressed to: ${label} (Progress ${prog}/5)${hasGun ? " — GUN CREATED! (0 bullets, does not fire yet)" : ""}`);
          } else if (evt.type === "SHOT_REQUIRED") {
            console.log(`[BULLET AWARDED] Gun cell ${evt.cellValue} rolled again! 1 bullet awarded. Mandatory shot required.`);
          } else if (evt.type === "MATCH_WON") {
            console.log(`[VICTORY] Winner: ${evt.actorPosition} (${evt.actorUsername}) Reason: ${evt.metadata?.reason}`);
          }
        }

        renderBattlefield(session);
        continue;
      }

      if (cmd === "shoot") {
        if (session.state.phase === "COMPLETED") {
          console.log("[Notice] Match has already completed. Type 'reset' to play another match.");
          continue;
        }

        if (args.length < 2) {
          console.log("[Error] Usage: shoot <TargetPosition> <CellValue>  (e.g., shoot P2 4)");
          continue;
        }

        const targetInput = args[0];
        const cellInput = parseInt(args[1], 10);

        if (!CELL_VALUES.includes(cellInput as CellValue)) {
          console.log(`[Error] Invalid target cell value: ${args[1]}. Must be 0, 2, 4, 6, or 8.`);
          continue;
        }

        const targetPlayerId = resolvePlayerTarget(session.state, targetInput);
        if (!targetPlayerId) {
          console.log(`[Error] Target player '${targetInput}' not found. Use positions like P1, P2, etc.`);
          continue;
        }

        const currentP = session.state.players.find((p) => p.playerId === session.state.turn.currentPlayerId);
        if (!currentP) {
          console.log("[Error] No active turn player.");
          continue;
        }

        const res = applyShot(
          session.state,
          currentP.playerId,
          targetPlayerId,
          cellInput as CellValue
        );

        session.state = res.state;
        session.eventsLog.push(...res.events);

        for (const evt of res.events) {
          if (evt.type === "CELL_DESTROYED") {
            console.log(`💥 [CELL DESTROYED] ${evt.actorPosition} destroyed ${evt.targetPosition}'s cell ${evt.cellValue}!`);
          } else if (evt.type === "PLAYER_ELIMINATED") {
            console.log(`☠️  [PLAYER ELIMINATED] ${evt.targetPosition} (${evt.targetUsername}) lost all 5 cells and has been eliminated!`);
          } else if (evt.type === "MATCH_WON") {
            console.log(`🏆 [VICTORY] ${evt.actorPosition} (${evt.actorUsername}) wins the match! (${evt.metadata?.reason})`);
          }
        }

        renderBattlefield(session);
        continue;
      }

      console.log(`[Error] Unknown command: '${command}'. Type 'help' for command list.`);
    } catch (err: unknown) {
      if (err instanceof GameRuleError) {
        console.log(`\n❌ [GameRuleError: ${err.code}] ${err.message}\n`);
      } else if (err instanceof Error) {
        console.log(`\n❌ [Error] ${err.message}\n`);
      } else {
        console.log(`\n❌ [Error] ${String(err)}\n`);
      }
    }
  }

  rl.close();
}

// Direct execution guard
if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  runCli().catch((err) => {
    console.error("Simulator error:", err);
    process.exit(1);
  });
}
