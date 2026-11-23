import type {
  PublicRoomState,
  MatchState,
  MatchEvent,
  RoomParticipant,
  CellValue,
  WinReason
} from "@pageshooter/shared";
import { assertRollCommitmentValid } from "./clientVerification.js";

export interface ChatMessage {
  id?: string;
  senderUserId: string;
  senderUsername: string;
  role?: string;
  message: string;
  timestamp: number;
}

export interface VerifiedRollInfo {
  turnNumber: number;
  outcome: CellValue;
  pageNumber: number;
}

export interface SyncStoreState {
  room: PublicRoomState | null;
  match: MatchState | null;
  serverInstanceId: string | null;
  activeCommitment: { turnNumber: number; commitmentHash: string } | null;
  lastVerifiedRoll: VerifiedRollInfo | null;
  chatMessages: ChatMessage[];
  events: MatchEvent[];
  verificationErrors: string[];
  matchTerminatedReason: string | null;
}

export class SyncStore {
  private state: SyncStoreState = {
    room: null,
    match: null,
    serverInstanceId: null,
    activeCommitment: null,
    lastVerifiedRoll: null,
    chatMessages: [],
    events: [],
    verificationErrors: [],
    matchTerminatedReason: null
  };

  private listeners = new Set<() => void>();

  getState(): Readonly<SyncStoreState> {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    // Produce a fresh top-level snapshot reference so useSyncExternalStore detects updates
    this.state = { ...this.state };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  applyRoomSnapshot(snapshot: PublicRoomState, serverInstanceId: string): void {
    this.state.room = snapshot;
    this.state.serverInstanceId = serverInstanceId;
    if (snapshot.match) {
      this.state.match = snapshot.match;
    }
    if (snapshot.currentCommitment) {
      this.state.activeCommitment = snapshot.currentCommitment;
    }
    if (snapshot.recentChats && snapshot.recentChats.length > 0) {
      const merged = [...this.state.chatMessages];
      for (const chat of snapshot.recentChats) {
        const exists = merged.some((m) =>
          chat.id && m.id
            ? m.id === chat.id
            : m.senderUserId === chat.senderUserId &&
              m.timestamp === chat.timestamp &&
              m.message === chat.message
        );
        if (!exists) {
          merged.push(chat);
        }
      }
      this.state.chatMessages = merged.slice(-50);
    }
    this.notify();
  }

  applyPlayerJoined(player: RoomParticipant): void {
    if (!this.state.room) return;
    const exists = this.state.room.players.some((p) => p.userId === player.userId);
    if (!exists) {
      this.state.room = {
        ...this.state.room,
        players: [...this.state.room.players, player],
        playerCount: this.state.room.playerCount + 1
      };
    }
    this.notify();
  }

  applyPlayerLeft(userId: string): void {
    if (!this.state.room) return;
    this.state.room = {
      ...this.state.room,
      players: this.state.room.players.filter((p) => p.userId !== userId),
      playerCount: Math.max(0, this.state.room.playerCount - 1)
    };
    this.notify();
  }

  applyPlayerKicked(targetUserId: string): void {
    if (!this.state.room) return;
    const filteredPlayers = this.state.room.players.filter((p) => p.userId !== targetUserId);
    const filteredSpectators = this.state.room.spectators.filter((s) => s.userId !== targetUserId);
    this.state.room = {
      ...this.state.room,
      players: filteredPlayers,
      spectators: filteredSpectators,
      playerCount: filteredPlayers.length,
      spectatorCount: filteredSpectators.length
    };
    this.notify();
  }

  applySpectatorJoined(spectator: RoomParticipant): void {
    if (!this.state.room) return;
    const exists = this.state.room.spectators.some((s) => s.userId === spectator.userId);
    if (!exists) {
      this.state.room = {
        ...this.state.room,
        spectators: [...this.state.room.spectators, spectator],
        spectatorCount: this.state.room.spectatorCount + 1
      };
    }
    this.notify();
  }

  applySpectatorLeft(userId: string): void {
    if (!this.state.room) return;
    this.state.room = {
      ...this.state.room,
      spectators: this.state.room.spectators.filter((s) => s.userId !== userId),
      spectatorCount: Math.max(0, this.state.room.spectatorCount - 1)
    };
    this.notify();
  }

  applyHostMigrated(newHostUserId: string, reason?: string): void {
    void reason;
    if (!this.state.room) return;
    const updatedPlayers = this.state.room.players.map((p) => ({
      ...p,
      role: (p.userId === newHostUserId ? "HOST" : p.role === "HOST" ? "PLAYER" : p.role) as
        | "HOST"
        | "PLAYER"
        | "SPECTATOR"
    }));

    this.state.room = {
      ...this.state.room,
      hostUserId: newHostUserId,
      players: updatedPlayers
    };
    this.notify();
  }

  applyMatchStarted(matchState: MatchState): void {
    if (this.state.room) {
      this.state.room = {
        ...this.state.room,
        phase: "ACTIVE",
        match: matchState
      };
    }
    this.state.match = matchState;
    this.notify();
  }

  applyCommitment(turnNumber: number, commitmentHash: string): void {
    this.state.activeCommitment = { turnNumber, commitmentHash };
    this.notify();
  }

  async applyRollRevealed(
    turnNumber: number,
    outcome: CellValue,
    pageNumber: number,
    seed: string
  ): Promise<void> {
    if (!this.state.match) {
      throw new Error("Cannot apply roll revealed: no active match.");
    }

    if (
      !this.state.activeCommitment ||
      this.state.activeCommitment.turnNumber !== turnNumber
    ) {
      const err = `Missing or mismatched active commitment for turn ${turnNumber}`;
      this.state.verificationErrors = [...this.state.verificationErrors, err];
      this.notify();
      throw new Error(err);
    }

    // Cryptographic verification against initial commitment
    try {
      await assertRollCommitmentValid(
        seed,
        this.state.match.matchId,
        turnNumber,
        this.state.activeCommitment.commitmentHash,
        outcome,
        pageNumber
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.state.verificationErrors = [...this.state.verificationErrors, msg];
      this.notify();
      throw error;
    }

    this.state.lastVerifiedRoll = { turnNumber, outcome, pageNumber };
    this.notify();
  }

  applyPolledRoll(turnNumber: number, outcome: CellValue, pageNumber: number): void {
    this.state.lastVerifiedRoll = { turnNumber, outcome, pageNumber };
    this.notify();
  }

  applyMatchStateSync(matchState: MatchState, events?: MatchEvent[]): void {
    this.state.match = matchState;
    if (this.state.room) {
      this.state.room = {
        ...this.state.room,
        match: matchState,
        phase: matchState.phase as "WAITING" | "ACTIVE" | "PAUSED" | "COMPLETED"
      };
    }
    if (events && events.length > 0) {
      this.state.events = [...this.state.events, ...events];
    }
    this.notify();
  }

  applyMatchPaused(disconnectedPlayerId: string, deadline: number): void {
    if (this.state.match) {
      this.state.match = {
        ...this.state.match,
        phase: "PAUSED",
        disconnectDeadline: deadline,
        players: this.state.match.players.map((p) =>
          p.playerId === disconnectedPlayerId ? { ...p, connected: false } : p
        )
      };
    }
    if (this.state.room) {
      this.state.room = {
        ...this.state.room,
        phase: "PAUSED"
      };
    }
    this.notify();
  }

  applyMatchResumed(reconnectedPlayerId: string): void {
    if (this.state.match) {
      this.state.match = {
        ...this.state.match,
        phase: "ACTIVE",
        disconnectDeadline: null,
        players: this.state.match.players.map((p) =>
          p.playerId === reconnectedPlayerId ? { ...p, connected: true } : p
        )
      };
    }
    if (this.state.room) {
      this.state.room = {
        ...this.state.room,
        phase: "ACTIVE"
      };
    }
    this.notify();
  }

  applyPlayerEliminated(targetPlayerId: string): void {
    if (this.state.match) {
      this.state.match = {
        ...this.state.match,
        players: this.state.match.players.map((p) =>
          p.playerId === targetPlayerId ? { ...p, status: "ELIMINATED" } : p
        )
      };
    }
    this.notify();
  }

  applyMatchCompleted(
    matchState: MatchState,
    winnerPlayerId: string,
    winReason: WinReason
  ): void {
    this.state.match = {
      ...matchState,
      phase: "COMPLETED",
      winnerPlayerId,
      winReason
    };
    if (this.state.room) {
      this.state.room = {
        ...this.state.room,
        phase: "COMPLETED",
        match: this.state.match
      };
    }
    this.notify();
  }

  applyMatchTerminated(reason: string): void {
    this.state.match = null;
    this.state.room = null;
    this.state.activeCommitment = null;
    this.state.matchTerminatedReason = reason;
    this.notify();
  }

  applyChatBroadcast(chat: ChatMessage): void {
    const exists = this.state.chatMessages.some((m) =>
      chat.id && m.id
        ? m.id === chat.id
        : m.senderUserId === chat.senderUserId &&
          m.timestamp === chat.timestamp &&
          m.message === chat.message
    );
    if (exists) return;
    this.state.chatMessages = [...this.state.chatMessages, chat].slice(-50);
    this.notify();
  }

  reset(): void {
    this.state = {
      room: null,
      match: null,
      serverInstanceId: null,
      activeCommitment: null,
      lastVerifiedRoll: null,
      chatMessages: [],
      events: [],
      verificationErrors: [],
      matchTerminatedReason: null
    };
    this.notify();
  }
}
