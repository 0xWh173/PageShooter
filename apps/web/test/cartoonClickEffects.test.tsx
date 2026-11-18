// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CartoonClickEffects } from "../src/components/CartoonClickEffects.js";

describe("CartoonClickEffects Overlay", () => {
  it("spawns a comic starburst burst when clicking an enabled button", () => {
    render(
      <div>
        <CartoonClickEffects />
        <button type="button">Smash Me</button>
      </div>
    );

    expect(screen.queryByTestId("cartoon-click-layer")).toBeNull();

    const btn = screen.getByRole("button", { name: "Smash Me" });
    fireEvent.pointerDown(btn, { clientX: 120, clientY: 240 });

    expect(screen.getByTestId("cartoon-click-layer")).toBeTruthy();
  });

  it("does not spawn a burst when clicking a disabled button", () => {
    render(
      <div>
        <CartoonClickEffects />
        <button type="button" disabled>
          Disabled
        </button>
      </div>
    );

    const btn = screen.getByRole("button", { name: "Disabled" });
    fireEvent.pointerDown(btn, { clientX: 50, clientY: 50 });

    expect(screen.queryByTestId("cartoon-click-layer")).toBeNull();
  });
});
