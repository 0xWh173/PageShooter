// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createInitialMatchState } from "@pageshooter/game-engine";
import type { PublicRoomState, PublicUserProfile, WSServerMessage } from "@pageshooter/shared";
import {
  SyncStore,
  selectIsCurrentTurn,
  selectCanRoll,
  selectCanShoot,
  selectValidTargets,
  selectIsSpectator,
  type WebSocketClient,
  type ConnectionStatus
} from "../src/network/index.js";
import { MultiplayerArenaScreen } from "../src/components/online/MultiplayerArenaScreen.js";

function createMockMatchRoom(phase: "ACTIVE" | "PAUSED" | "COMPLETED" = "ACTIVE"): PublicRoomState {
  const inputs = [
    { playerId: "usr-1", username: "Alice", avatarId: "barnaby" },
    { playerId: "usr-2", username: "Bob", avatarId: "clover" },
    { playerId: "usr-3", username: "Charlie", avatarId: "pip" },
    { playerId: "usr-4", username: "Dana", avatarId: "hazel" },
    { playerId: "usr-5", username: "Evan", avatarId: "oliver" }
  ];
  const { state } = createInitialMatchState("match-123", "room-123", inputs);
  state.phase = phase;
  if (phase === "PAUSED") {
    state.players[1].connected = false;
    state.disconnectDeadline = Date.now() + 45000;
  }
  if (phase === "COMPLETED") {
    state.winnerPlayerId = state.players[0].playerId;
    state.winReason = "LAST_PLAYER_STANDING";
  }

  return {
    roomId: "room-123",
    roomCode: "ARENA2",
    hostUserId: "usr-1",
    phase,
    players: inputs.map((p, idx) => ({
      userId: p.playerId,
      username: p.username,
      avatarId: p.avatarId,
      role: idx === 0 ? "HOST" : "PLAYER",
      connected: true,
      joinedAt: Date.now() - 10000 + idx * 100
    })),
    spectators: [
      {
        userId: "usr-spec",
        username: "SpectatorSam",
        avatarId: "rowan",
        role: "SPECTATOR",
        connected: true,
        joinedAt: Date.now()
      }
    ],
    playerCount: 5,
    spectatorCount: 1,
    createdAt: Date.now() - 20000,
    expiresAt: null,
    match: state,
    currentCommitment: {
      turnNumber: 1,
      commitmentHash: "a".repeat(64)
    }
  };
}

function createMockWsClient(room: PublicRoomState) {
  const syncStore = new SyncStore();
  syncStore.applyRoomSnapshot(room, "srv-inst-1");
  const msgListeners = new Set<(m: WSServerMessage) => void>();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();

  const client = {
    syncStore,
    isConnected: true,
    connectionStatus: "CONNECTED" as ConnectionStatus,
    roll: vi.fn(),
    shoot: vi.fn(),
    leaveRoom: vi.fn(),
    sendChat: vi.fn(),
    sendEmoji: vi.fn(),
    onMessage: (cb: (m: WSServerMessage) => void) => {
      msgListeners.add(cb);
      return () => msgListeners.delete(cb);
    },
    onStatusChange: (cb: (s: ConnectionStatus) => void) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    emitMessage: (m: WSServerMessage) => {
      for (const cb of msgListeners) cb(m);
    },
    emitStatus: (s: ConnectionStatus) => {
      for (const cb of statusListeners) cb(s);
    }
  };

  return client as unknown as WebSocketClient & {
    emitMessage: (m: WSServerMessage) => void;
    emitStatus: (s: ConnectionStatus) => void;
  };
}

describe("Milestone 3 & 5: SyncStore Selectors & MultiplayerArenaScreen", () => {
  const makeProfile = (id: string, username: string): PublicUserProfile => ({
    id,
    username,
    email: `${id}@example.com`,
    avatarId: "barnaby",
    usernameUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("computes authoritative turn, roll, shoot, and spectator selectors accurately", () => {
    const room = createMockMatchRoom("ACTIVE");
    const store = new SyncStore();
    store.applyRoomSnapshot(room, "srv-1");
    const state = store.getState();
    const activeId = state.match!.turn.currentPlayerId;
    const otherId = state.match!.players.find((p) => p.playerId !== activeId)!.playerId;

    expect(selectIsCurrentTurn(state, activeId)).toBe(true);
    expect(selectCanRoll(state, activeId)).toBe(true);
    expect(selectCanShoot(state, activeId)).toBe(false);

    expect(selectIsCurrentTurn(state, otherId)).toBe(false);
    expect(selectCanRoll(state, otherId)).toBe(false);

    expect(selectIsSpectator(state, "usr-spec")).toBe(true);
    expect(selectIsCurrentTurn(state, "usr-spec")).toBe(false);
    expect(selectCanRoll(state, "usr-spec")).toBe(false);

    // Transition to AWAITING_SHOT
    const nextMatch = {
      ...state.match!,
      turn: { ...state.match!.turn, phase: "AWAITING_SHOT" as const, pendingShot: true, rolledCell: 4 as const }
    };
    store.applyMatchStateSync(nextMatch);
    const shootState = store.getState();
    expect(selectCanShoot(shootState, activeId)).toBe(true);
    expect(selectValidTargets(shootState, activeId).length).toBe(20); // 4 opponents * 5 cells
  });

  it("enables Roll Storybook button strictly for the active turn player", () => {
    const room = createMockMatchRoom("ACTIVE");
    const ws = createMockWsClient(room);
    const activeId = room.match!.turn.currentPlayerId;
    const activeUser = makeProfile(activeId, "ActivePlayer");

    render(
      <MultiplayerArenaScreen
        initialRoom={room}
        currentUser={activeUser}
        webSocketClient={ws}
        onLeaveMatch={vi.fn()}
      />
    );

    const rollBtn = screen.getByTestId("online-roll-button") as HTMLButtonElement;
    expect(rollBtn.disabled).toBe(false);

    fireEvent.click(rollBtn);
    expect(ws.roll).toHaveBeenCalledWith("ARENA2", room.match!.version);
  });

  it("renders Spectator Mode badge and disables Roll button for spectators", () => {
    const room = createMockMatchRoom("ACTIVE");
    const ws = createMockWsClient(room);
    const specUser = makeProfile("usr-spec", "SpectatorSam");

    render(
      <MultiplayerArenaScreen
        initialRoom={room}
        currentUser={specUser}
        webSocketClient={ws}
        onLeaveMatch={vi.fn()}
      />
    );

    expect(screen.getByTestId("hud-spectator-badge")).toBeTruthy();
    expect(screen.queryByTestId("online-roll-button")).toBeNull();
  });

  it("displays DisconnectOverlay 60s countdown when match is PAUSED", () => {
    const room = createMockMatchRoom("PAUSED");
    const ws = createMockWsClient(room);
    const user = makeProfile("usr-1", "Alice");

    render(
      <MultiplayerArenaScreen
        initialRoom={room}
        currentUser={user}
        webSocketClient={ws}
        onLeaveMatch={vi.fn()}
      />
    );

    expect(screen.getByTestId("match-paused-banner")).toBeTruthy();
    expect(screen.getByTestId("pause-countdown-timer")).toBeTruthy();
  });

  it("displays ServerRestartModal when match is terminated due to server restart", () => {
    const room = createMockMatchRoom("ACTIVE");
    const ws = createMockWsClient(room);
    const user = makeProfile("usr-1", "Alice");
    const onLeave = vi.fn();

    render(
      <MultiplayerArenaScreen
        initialRoom={room}
        currentUser={user}
        webSocketClient={ws}
        onLeaveMatch={onLeave}
      />
    );

    act(() => {
      ws.syncStore.applyMatchTerminated("Server restarted cleanly.");
    });

    expect(screen.getByTestId("server-restart-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("server-restart-return-lobby"));
    expect(onLeave).toHaveBeenCalled();
  });

  it("displays cryptographic tampering alert if verification error occurs", () => {
    const room = createMockMatchRoom("ACTIVE");
    const ws = createMockWsClient(room);
    const user = makeProfile("usr-1", "Alice");

    render(
      <MultiplayerArenaScreen
        initialRoom={room}
        currentUser={user}
        webSocketClient={ws}
        onLeaveMatch={vi.fn()}
      />
    );

    act(() => {
      // Simulate commitment mismatch error recorded in SyncStore
      (ws.syncStore as unknown as { state: { verificationErrors: string[] } }).state.verificationErrors.push(
        "Commitment mismatch"
      );
      ws.emitMessage({
        type: "ROLL_REVEALED",
        turnNumber: 1,
        outcome: 4,
        pageNumber: 101,
        seed: "bad-seed"
      });
    });

    expect(screen.getByTestId("arena-error-banner")).toBeTruthy();
  });
});
