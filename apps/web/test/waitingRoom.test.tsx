// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WaitingRoomScreen } from "../src/components/online/WaitingRoomScreen.js";
import { SyncStore } from "../src/network/syncStore.js";
import type { PublicRoomState, PublicUserProfile, RoomParticipant, MatchState } from "@pageshooter/shared";

describe("WaitingRoomScreen Component Tests (Milestone 2: Waiting Room & Host Controls)", () => {
  const hostUser: PublicUserProfile = {
    id: "usr-alice",
    username: "AliceHost",
    email: "alice@example.com",
    avatarId: "barnaby",
    usernameUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const guestUser: PublicUserProfile = {
    id: "usr-bob",
    username: "BobGuest",
    email: "bob@example.com",
    avatarId: "pip",
    usernameUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const spectatorUser: PublicUserProfile = {
    id: "usr-charlie",
    username: "CharlieSpec",
    email: "charlie@example.com",
    avatarId: "clover",
    usernameUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const createMockRoom = (playerCount = 2, spectatorCount = 0): PublicRoomState => {
    const players: RoomParticipant[] = [
      {
        userId: "usr-alice",
        username: "AliceHost",
        avatarId: "barnaby",
        role: "HOST",
        connected: true,
        joinedAt: Date.now() - 10000
      },
      {
        userId: "usr-bob",
        username: "BobGuest",
        avatarId: "pip",
        role: "PLAYER",
        connected: true,
        joinedAt: Date.now() - 5000
      }
    ];

    for (let i = 3; i <= playerCount; i++) {
      players.push({
        userId: `usr-player-${i}`,
        username: `Player${i}`,
        avatarId: "hazel",
        role: "PLAYER",
        connected: true,
        joinedAt: Date.now() - 1000 * (10 - i)
      });
    }

    const spectators: RoomParticipant[] = [];
    for (let i = 1; i <= spectatorCount; i++) {
      spectators.push({
        userId: i === 1 ? spectatorUser.id : `usr-spec-${i}`,
        username: i === 1 ? spectatorUser.username : `Spectator${i}`,
        avatarId: "oliver",
        role: "SPECTATOR",
        connected: true,
        joinedAt: Date.now() - 1000
      });
    }

    return {
      roomId: "room-id-12345",
      roomCode: "WROOM2",
      hostUserId: "usr-alice",
      phase: "WAITING",
      players,
      spectators,
      playerCount: players.length,
      spectatorCount: spectators.length,
      createdAt: Date.now() - 20000,
      expiresAt: Date.now() + 600000,
      match: null,
      currentCommitment: null
    };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 10 player seats with labels Seat 1..Seat 10, distinguishing required vs optional", () => {
    const room = createMockRoom(2, 0);
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={hostUser}
        onLeaveRoom={vi.fn()}
      />
    );

    // Seats 1 through 10 should all be visible
    for (let i = 1; i <= 10; i++) {
      expect(screen.getAllByText(`Seat ${i}`).length).toBeGreaterThanOrEqual(1);
    }

    // Randomization disclaimer should be visible
    expect(screen.getByText(/Battle positions \(P1–Pn\) are randomly assigned when the match begins/i)).toBeTruthy();

    // Seats 1 and 2 are filled
    expect(screen.getAllByText("AliceHost").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("BobGuest")).toBeTruthy();

    // Seats 3, 4, 5 should show 'Required'
    const requiredBadges = screen.getAllByText("Required");
    expect(requiredBadges.length).toBe(3); // Seats 3, 4, 5

    // Seats 6 through 10 should show 'Open'
    const openBadges = screen.getAllByText("Open");
    expect(openBadges.length).toBe(5); // Seats 6, 7, 8, 9, 10
  });

  it("identifies the room host with crown badge and marks (You) on current user", () => {
    const room = createMockRoom(2, 0);
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={hostUser}
        onLeaveRoom={vi.fn()}
      />
    );

    // Host badge exists on Alice
    expect(screen.getByText("Host")).toBeTruthy();
    expect(screen.getByText("You are Host")).toBeTruthy();

    // (You) tag is shown on Alice
    expect(screen.getByText("(You)")).toBeTruthy();
  });

  it("host controls: Start Match button is disabled when player count < 5 with clear helper text", () => {
    const room = createMockRoom(3, 0); // 3 players, below minimum 5
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={hostUser}
        onLeaveRoom={vi.fn()}
      />
    );

    const startButton = screen.getByTestId("start-match-button") as HTMLButtonElement;
    expect(startButton.disabled).toBe(true);
    expect(startButton.textContent).toContain("Awaiting Players (3/5)");
    expect(screen.getByText(/Requires at least 5 scribes to begin ritual/)).toBeTruthy();
  });

  it("host controls: Start Match button is enabled when player count is between 5 and 10", () => {
    const room = createMockRoom(5, 0); // 5 players satisfies minimum
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={hostUser}
        onLeaveRoom={vi.fn()}
      />
    );

    const startButton = screen.getByTestId("start-match-button") as HTMLButtonElement;
    expect(startButton.disabled).toBe(false);
    expect(startButton.textContent).toContain("Start Match (5 Scribes)");
    expect(screen.getByText(/Chamber requirements satisfied/)).toBeTruthy();
  });

  it("host controls: renders Kick Scribe buttons only on guest player seats, never on host self", () => {
    const room = createMockRoom(3, 0);
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={hostUser}
        onLeaveRoom={vi.fn()}
      />
    );

    // Host (Alice) has no kick button on herself
    expect(screen.queryByTestId("kick-button-usr-alice")).toBeNull();

    // Guests Bob and Player3 have kick buttons
    expect(screen.getByTestId("kick-button-usr-bob")).toBeTruthy();
    expect(screen.getByTestId("kick-button-usr-player-3")).toBeTruthy();
  });

  it("guest player view: has zero host controls (no Start Match, no Kick buttons)", () => {
    const room = createMockRoom(3, 0);
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={guestUser}
        onLeaveRoom={vi.fn()}
      />
    );

    // Guest should NOT see Start Match button
    expect(screen.queryByTestId("start-match-button")).toBeNull();

    // Guest should NOT see any Kick buttons
    expect(screen.queryByTestId("kick-button-usr-alice")).toBeNull();
    expect(screen.queryByTestId("kick-button-usr-bob")).toBeNull();
    expect(screen.queryByTestId("kick-button-usr-player-3")).toBeNull();

    // Guest sees awaiting host banner
    expect(screen.getByText(/Awaiting Room Host \(AliceHost\)/)).toBeTruthy();
  });

  it("spectator view: rendered in dedicated Spectator section and never takes a player slot", () => {
    const room = createMockRoom(2, 2); // 2 players, 2 spectators
    render(
      <WaitingRoomScreen
        room={room}
        currentUser={spectatorUser}
        onLeaveRoom={vi.fn()}
      />
    );

    // Spectator mode banner active
    expect(screen.getByText("Spectator Mode")).toBeTruthy();

    // Charlie is listed under spectators with (You)
    const spectatorBadge = screen.getByTestId("spectator-badge-usr-charlie");
    expect(spectatorBadge).toBeTruthy();
    expect(spectatorBadge.textContent).toContain("CharlieSpec");
    expect(spectatorBadge.textContent).toContain("(You)");

    // Spectator never appears in player seats
    expect(screen.queryByTestId("player-seat-3")).toBeNull();
    expect(screen.getByTestId("empty-seat-3")).toBeTruthy();
  });

  it("clicking Leave Chamber triggers onLeaveRoom callback", async () => {
    const room = createMockRoom(2, 0);
    const onLeaveRoom = vi.fn();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ roomDeleted: false })
    } as Response);

    render(
      <WaitingRoomScreen
        room={room}
        currentUser={guestUser}
        onLeaveRoom={onLeaveRoom}
      />
    );

    const leaveButton = screen.getByText("Leave Chamber");
    await act(async () => {
      fireEvent.click(leaveButton);
    });

    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  it("clicking Copy chamber code copies code to clipboard and indicates feedback", async () => {
    const room = createMockRoom(2, 0);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true
    });

    render(
      <WaitingRoomScreen
        room={room}
        currentUser={hostUser}
        onLeaveRoom={vi.fn()}
      />
    );

    const copyButton = screen.getByTitle("Copy chamber code");
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith("WROOM2");
    expect(screen.getByText("✓ Copied!")).toBeTruthy();
  });

  it("real-time synchronization: host migration dynamically promotes guest and grants host controls", async () => {
    const initialRoom = createMockRoom(3, 0);
    const syncStore = new SyncStore();
    syncStore.applyRoomSnapshot(initialRoom, "instance-1");

    // Render as Bob (currently guest)
    render(
      <WaitingRoomScreen
        room={initialRoom}
        currentUser={guestUser}
        syncStore={syncStore}
        onLeaveRoom={vi.fn()}
      />
    );

    // Initial state: Bob is a guest
    expect(screen.queryByTestId("start-match-button")).toBeNull();
    expect(screen.getByText(/Awaiting Room Host \(AliceHost\)/)).toBeTruthy();

    // Simulate Alice leaving and server migrating host to Bob
    act(() => {
      syncStore.applyPlayerLeft("usr-alice");
      syncStore.applyHostMigrated("usr-bob", "Previous host left room");
    });

    // Now Bob is Host! UI updates dynamically to grant Host Command Authority
    expect(screen.getByText("Host Command Authority")).toBeTruthy();
    expect(screen.getByText("You are Host")).toBeTruthy();
    expect(screen.getByTestId("start-match-button")).toBeTruthy();
  });

  it("real-time synchronization: kicked participant receives departure notification", async () => {
    const initialRoom = createMockRoom(3, 0);
    const syncStore = new SyncStore();
    syncStore.applyRoomSnapshot(initialRoom, "instance-1");

    const onLeaveRoom = vi.fn();

    // Render as Bob
    render(
      <WaitingRoomScreen
        room={initialRoom}
        currentUser={guestUser}
        syncStore={syncStore}
        onLeaveRoom={onLeaveRoom}
      />
    );

    expect(screen.queryByText("Chamber Departure")).toBeNull();

    // Alice kicks Bob
    act(() => {
      syncStore.applyPlayerKicked("usr-bob");
    });

    // Bob receives departure modal
    expect(screen.getByText("Chamber Departure")).toBeTruthy();
    expect(screen.getByText(/You were removed from Chamber/)).toBeTruthy();

    // Clicking Return to Lobby calls onLeaveRoom
    fireEvent.click(screen.getByText("Return to Lobby"));
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });

  it("real-time synchronization: match start invokes onMatchStarted", async () => {
    const initialRoom = createMockRoom(5, 0);
    const syncStore = new SyncStore();
    syncStore.applyRoomSnapshot(initialRoom, "instance-1");

    const onMatchStarted = vi.fn();

    render(
      <WaitingRoomScreen
        room={initialRoom}
        currentUser={guestUser}
        syncStore={syncStore}
        onLeaveRoom={vi.fn()}
        onMatchStarted={onMatchStarted}
      />
    );

    const mockMatchState: MatchState = {
      matchId: "match-started-1",
      roomId: "room-id-12345",
      version: 1,
      phase: "ACTIVE",
      roundNumber: 1,
      activePlayerCount: 5,
      eliminatedPlayerCount: 0,
      turn: {
        turnNumber: 1,
        currentPlayerId: "usr-alice",
        phase: "AWAITING_ROLL",
        currentRoll: null,
        revealedPageNumber: null,
        seed: null,
        consequence: null,
        turnStartedAt: Date.now(),
        turnDeadline: Date.now() + 30000,
        actionsCompleted: []
      },
      players: initialRoom.players.map((p) => ({
        playerId: p.userId,
        username: p.username,
        avatarId: p.avatarId,
        status: "ACTIVE",
        cells: [],
        hasGun: false,
        isShielded: false
      })),
      combatLog: [],
      seed: "secret-seed"
    };

    act(() => {
      syncStore.applyMatchStarted(mockMatchState);
    });

    expect(onMatchStarted).toHaveBeenCalledWith(mockMatchState);
  });
});
