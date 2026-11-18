// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CartoonClickEffects } from "../src/components/CartoonClickEffects.js";

describe("CartoonClickEffects Overlay", () => {
  it("spawns a comic starburst strictly when clicking a mode-selector button with [data-cartoon-click]", () => {
    render(
      <div>
        <CartoonClickEffects />
        <button type="button" data-cartoon-click="true">
          Local Pass & Play
        </button>
        <button type="button">Regular Button</button>
      </div>
    );

    expect(screen.queryByTestId("cartoon-click-layer")).toBeNull();

    // Clicking a regular button without data-cartoon-click must NOT trigger the burst
    const regularBtn = screen.getByRole("button", { name: "Regular Button" });
    fireEvent.pointerDown(regularBtn, { clientX: 80, clientY: 100 });
    expect(screen.queryByTestId("cartoon-click-layer")).toBeNull();

    // Clicking a mode-selector button with data-cartoon-click triggers the burst
    const modeBtn = screen.getByRole("button", { name: "Local Pass & Play" });
    fireEvent.pointerDown(modeBtn, { clientX: 120, clientY: 240 });

    expect(screen.getByTestId("cartoon-click-layer")).toBeTruthy();
  });

  it("does not spawn a burst when clicking a disabled [data-cartoon-click] button", () => {
    render(
      <div>
        <CartoonClickEffects />
        <button type="button" data-cartoon-click="true" disabled>
          Disabled
        </button>
      </div>
    );

    const btn = screen.getByRole("button", { name: "Disabled" });
    fireEvent.pointerDown(btn, { clientX: 50, clientY: 50 });

    expect(screen.queryByTestId("cartoon-click-layer")).toBeNull();
  });
});
