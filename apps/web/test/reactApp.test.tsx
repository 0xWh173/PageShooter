// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SetupScreen } from "../src/components/SetupScreen.js";
import { StickmanCell } from "../src/components/StickmanCell.js";
import { BookCinematic } from "../src/components/BookCinematic.js";
import { Battlefield } from "../src/components/Battlefield.js";
import { VictoryModal } from "../src/components/VictoryModal.js";
import { createInitialMatchState } from "@pageshooter/game-engine";
import type { CellState, CellValue, MatchState } from "@pageshooter/shared";

describe("React Components QA & Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SetupScreen", () => {
    it("renders default 5 players and allows switching to 10 players", () => {
      const onStart = vi.fn();
      render(
        <SetupScreen
          savedMatch={null}
          onResumeSavedMatch={vi.fn()}
          onDiscardSavedMatch={vi.fn()}
          onStartMatch={onStart}
        />
      );

      // Default 5 player inputs
      expect(screen.getByPlaceholderText("Player 1")).toBeTruthy();
      expect(screen.getByPlaceholderText("Player 5")).toBeTruthy();
      expect(screen.queryByPlaceholderText("Player 6")).toBeNull();

      // Switch to 10 players
      const btn10 = screen.getByRole("button", { name: "10" });
      fireEvent.click(btn10);

      expect(screen.getByPlaceholderText("Player 10")).toBeTruthy();

      // Submit setup
      const submitBtn = screen.getByRole("button", { name: /Enter the Storybook Arena/i });
      fireEvent.click(submitBtn);

      expect(onStart).toHaveBeenCalledTimes(1);
      const submittedNames = onStart.mock.calls[0][0];
      expect(submittedNames.length).toBe(10);
    });

    it("does NOT display resume banner when saved match is COMPLETED (Requirement 4)", () => {
      const completedMatch: Partial<MatchState> = {
        matchId: "comp-1",
        phase: "COMPLETED",
        players: [],
        turn: { turnNumber: 15, currentPlayerId: "p1", phase: "TURN_COMPLETE", rolledCell: null, pendingShot: false }
      };

      render(
        <SetupScreen
          savedMatch={completedMatch as MatchState}
          onResumeSavedMatch={vi.fn()}
          onDiscardSavedMatch={vi.fn()}
          onStartMatch={vi.fn()}
        />
      );

      // Banner must NOT be displayed
      expect(screen.queryByText(/Active Adventure Discovered/i)).toBeNull();
      expect(screen.queryByText(/Resume Game/i)).toBeNull();
    });

    it("displays resume banner when saved match is ACTIVE", () => {
      const activeMatch: Partial<MatchState> = {
        matchId: "act-1",
        phase: "ACTIVE",
        players: [
          { playerId: "p1" } as any,
          { playerId: "p2" } as any,
          { playerId: "p3" } as any,
          { playerId: "p4" } as any,
          { playerId: "p5" } as any
        ],
        turn: { turnNumber: 3, currentPlayerId: "p1", phase: "AWAITING_ROLL", rolledCell: null, pendingShot: false }
      };

      const onResume = vi.fn();
      render(
        <SetupScreen
          savedMatch={activeMatch as MatchState}
          onResumeSavedMatch={onResume}
          onDiscardSavedMatch={vi.fn()}
          onStartMatch={vi.fn()}
        />
      );

      expect(screen.getByText(/Active Game Discovered/i)).toBeTruthy();
      const resumeBtn = screen.getByRole("button", { name: /Resume Game/i });
      fireEvent.click(resumeBtn);
      expect(onResume).toHaveBeenCalledTimes(1);
    });
  });

  describe("StickmanCell Rendering & Interactions", () => {
    it("renders all 6 progression stages (Empty -> Face -> Body -> Legs -> Arms -> Gun)", () => {
      const cellValues: CellValue[] = [0, 2, 4, 6, 8];
      const stages: CellState["progress"][] = [0, 1, 2, 3, 4, 5];

      stages.forEach((prog, idx) => {
        const cell: CellState = {
          value: cellValues[idx % 5],
          progress: prog,
          hasGun: prog === 5,
          destroyed: false
        };

        const { unmount } = render(
          <StickmanCell
            cell={cell}
            cellValue={cell.value}
          />
        );

        // Verify label
        const labels = ["Empty", "Face", "Body", "Legs", "Hands/Arms", "Gun"];
        expect(screen.getByText(labels[prog])).toBeTruthy();
        unmount();
      });
    });

    it("renders destroyed cell with POOFED badge and does not trigger click", () => {
      const cell: CellState = {
        value: 4,
        progress: 3,
        hasGun: false,
        destroyed: true
      };
      const onSelect = vi.fn();

      render(
        <StickmanCell
          cell={cell}
          cellValue={4}
          isTargetable={true}
          onTargetSelect={onSelect}
        />
      );

      expect(screen.getByText(/Poofed/i)).toBeTruthy();
      const element = screen.getByLabelText(/Cell 4: Destroyed/i);
      fireEvent.click(element);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("triggers target select on click and touch when targetable", () => {
      const cell: CellState = {
        value: 6,
        progress: 2,
        hasGun: false,
        destroyed: false
      };
      const onSelect = vi.fn();

      render(
        <StickmanCell
          cell={cell}
          cellValue={6}
          isTargetable={true}
          onTargetSelect={onSelect}
        />
      );

      const cellElement = screen.getByRole("button", { name: /Cell 6/i });
      fireEvent.click(cellElement);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(6);
    });
  });

  describe("BookCinematic Duplicate Guard (Requirement 10)", () => {
    it("calls onComplete exactly once even if skip is clicked repeatedly", () => {
      vi.useFakeTimers();
      const onComplete = vi.fn();

      render(
        <BookCinematic
          pageNumber={248}
          outcome={8}
          consequenceText="Arms advanced to Gun!"
          onComplete={onComplete}
        />
      );

      const skipBtn = screen.getByRole("button", { name: /Turn Leaf Fast/i });
      // Click multiple times rapidly
      fireEvent.click(skipBtn);
      fireEvent.click(skipBtn);
      fireEvent.click(skipBtn);

      // Advance timers to trigger the internal setTimeout
      act(() => {
        vi.advanceTimersByTime(6000);
      });

      // Must have been called exactly once
      expect(onComplete).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe("Battlefield Layout (Requirement 5 & 6)", () => {
    it("renders full 10-player roster without crash", () => {
      const tenPlayerInputs = Array.from({ length: 10 }, (_, i) => ({
        playerId: `p_${i + 1}`,
        username: `Hero ${i + 1}`,
        avatarId: `avatar_${i + 1}`
      }));

      const { state } = createInitialMatchState("m10", "r10", tenPlayerInputs);

      render(
        <Battlefield
          matchState={state}
          onSelectTarget={vi.fn()}
        />
      );

      // Check all 10 positions are visible
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByText(`P${i}`)).toBeTruthy();
      }
    });
  });

  describe("VictoryModal Component QA", () => {
    it("renders winner info, all 5 cells, stats, and handles action buttons", () => {
      const inputs = [
        { playerId: "p1", username: "Pip", avatarId: "a1" },
        { playerId: "p2", username: "Hazel", avatarId: "a2" },
        { playerId: "p3", username: "Barnaby", avatarId: "a3" },
        { playerId: "p4", username: "Clover", avatarId: "a4" },
        { playerId: "p5", username: "Oliver", avatarId: "a5" }
      ];
      const { state } = createInitialMatchState("v-test", "r-test", inputs);
      state.phase = "COMPLETED";
      state.winnerPlayerId = "p1";
      state.winReason = "LAST_PLAYER_STANDING";
      state.totalTurns = 24;
      const winnerPlayer = state.players.find((p) => p.playerId === "p1")!;
      winnerPlayer.kills = 3;
      winnerPlayer.cells[2].destroyed = true;

      const onRematch = vi.fn();
      const onNewMatch = vi.fn();

      render(
        <VictoryModal
          matchState={state}
          onPlayAgain={onRematch}
          onNewMatch={onNewMatch}
        />
      );

      // Verify header & winner title
      expect(screen.getByText(/Storybook Grand Champion/i)).toBeTruthy();
      expect(screen.getByText(/Pip Wins!/i)).toBeTruthy();
      expect(screen.getByText(/Seat P\d • Last Player Standing/i)).toBeTruthy();

      // Verify section title & cells
      expect(screen.getByText(/Surviving Warrior Cells/i)).toBeTruthy();

      // Verify stats
      expect(screen.getByText(/Total Turns/i)).toBeTruthy();
      expect(screen.getByText("24")).toBeTruthy();
      expect(screen.getByText(/Winner Kills/i)).toBeTruthy();
      expect(screen.getByText("3 ⭐")).toBeTruthy();
      expect(screen.getByText(/Surviving Cells/i)).toBeTruthy();
      expect(screen.getByText("4 / 5")).toBeTruthy();

      // Verify action buttons
      const rematchBtn = screen.getByRole("button", { name: /Play Again \/ Rematch/i });
      fireEvent.click(rematchBtn);
      expect(onRematch).toHaveBeenCalledTimes(1);

      const newMatchBtn = screen.getByRole("button", { name: /New Match Setup/i });
      fireEvent.click(newMatchBtn);
      expect(onNewMatch).toHaveBeenCalledTimes(1);
    });
  });
});
