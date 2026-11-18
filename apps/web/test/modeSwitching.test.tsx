// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { App } from "../src/App.js";
import { saveOfflineMatch, loadOfflineMatch, clearOfflineMatch, resetDbInstance } from "../src/storage/db.js";
import { createInitialMatchState } from "@pageshooter/game-engine";

describe("Mode Switching & Offline Mode Isolation Tests", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetDbInstance();
    await clearOfflineMatch();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("defaults to Local Pass & Play (Offline) mode on initial render", async () => {
    render(<App />);

    // Top Mode Switcher buttons appear after initial IndexedDB loading
    const localBtn = await screen.findByRole("button", { name: "Local Pass & Play" });
    const onlineBtn = screen.getByRole("button", { name: "Online Multiplayer" });
    expect(localBtn).toBeTruthy();
    expect(onlineBtn).toBeTruthy();

    // In Offline mode with no saved match, SetupScreen is rendered
    expect(screen.getByText(/Hand-Drawn Illustrated Folio Game/i)).toBeTruthy();
    expect(screen.getByPlaceholderText("Player 1")).toBeTruthy();
  });

  it("switches to Online Multiplayer mode and renders multiplayer lobby without requiring login", async () => {
    render(<App />);

    const onlineBtn = await screen.findByRole("button", { name: "Online Multiplayer" });
    await act(async () => {
      fireEvent.click(onlineBtn);
    });

    // In Online mode, MultiplayerLobbyScreen is rendered with immediate access to Create/Join Room
    expect(screen.getByText("Multiplayer Folio Arena")).toBeTruthy();
    expect(screen.getByText(/Create Private Room/i)).toBeTruthy();
    expect(screen.getByText(/Enter Room Code/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign In/i })).toBeNull();
    const createRoomBtn = screen.getByRole("button", { name: /Inscribe New Room/i }) as HTMLButtonElement;
    expect(createRoomBtn.disabled).toBe(false);
  });

  it("preserves offline match state in memory and IndexedDB when switching between modes", async () => {
    // 1. Create an active offline match state
    const inputs = [
      { playerId: "p1", username: "Barnaby", avatarId: "barnaby" },
      { playerId: "p2", username: "Clover", avatarId: "clover" },
      { playerId: "p3", username: "Pip", avatarId: "pip" },
      { playerId: "p4", username: "Hazel", avatarId: "hazel" },
      { playerId: "p5", username: "Oliver", avatarId: "oliver" }
    ];
    const { state: initialMatch } = createInitialMatchState("offline-test-match", "storybook-arena", inputs);
    initialMatch.players[0].cells[0].progress = 3;
    await saveOfflineMatch(initialMatch);

    // 2. Render App (which loads the saved match from IndexedDB)
    render(<App />);

    // Wait for offline match to load and render TurnHUD
    const rollBtn = await screen.findByRole("button", { name: /Open Storybook/i });
    expect(rollBtn).toBeTruthy();

    // 3. Switch to Online Multiplayer mode
    const onlineBtn = screen.getByRole("button", { name: "Online Multiplayer" });
    await act(async () => {
      fireEvent.click(onlineBtn);
    });

    // Verify online lobby is visible
    expect(screen.getByText("Multiplayer Folio Arena")).toBeTruthy();

    // 4. Verify that the offline match saved in IndexedDB was NOT touched or cleared
    const savedInDb = await loadOfflineMatch(true);
    expect(savedInDb).not.toBeNull();
    expect(savedInDb?.matchId).toBe("offline-test-match");
    expect(savedInDb?.players[0].cells[0].progress).toBe(3);

    // 5. Switch back to Local Pass & Play mode
    const localBtn = screen.getByRole("button", { name: "Local Pass & Play" });
    await act(async () => {
      fireEvent.click(localBtn);
    });

    // TurnHUD must immediately be visible again without losing any progress
    expect(screen.getByRole("button", { name: /Open Storybook/i })).toBeTruthy();
  });

  it("opens AudioSettingsModal when clicking Audio Settings from the top navigation bar", async () => {
    render(<App />);

    const audioNavBtn = await screen.findByTestId("open-audio-settings");
    expect(audioNavBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(audioNavBtn);
    });

    // AudioSettingsModal dialog should appear
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/5-Channel Audio Mixer/i)).toBeTruthy();

    // Close button dismisses the dialog
    const closeBtn = screen.getByRole("button", { name: /Close audio settings/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
