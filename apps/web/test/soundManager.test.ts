// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { soundManager } from "../src/audio/soundManager.js";

describe("SoundManager & Audio Settings Persistence", () => {
  beforeEach(() => {
    // Reset localStorage before each test
    localStorage.clear();
  });

  it("initializes with default sound settings (volume 0.7, muted false)", () => {
    const settings = soundManager.getSettings();
    expect(settings.volume).toBeGreaterThanOrEqual(0);
    expect(settings.volume).toBeLessThanOrEqual(1);
    expect(typeof settings.muted).toBe("boolean");
  });

  it("updates volume and persists to localStorage", () => {
    soundManager.setVolume(0.45);
    const settings = soundManager.getSettings();
    expect(settings.volume).toBe(0.45);

    const stored = JSON.parse(localStorage.getItem("pageshooter_sound_settings") || "{}");
    expect(stored.volume).toBe(0.45);
  });

  it("toggles mute and persists to localStorage", () => {
    soundManager.setMuted(false);
    const muted = soundManager.toggleMute();
    expect(muted).toBe(true);
    expect(soundManager.getSettings().muted).toBe(true);

    const stored = JSON.parse(localStorage.getItem("pageshooter_sound_settings") || "{}");
    expect(stored.muted).toBe(true);

    soundManager.toggleMute();
    expect(soundManager.getSettings().muted).toBe(false);
  });

  it("safely invokes all katana execution sound methods without throwing", () => {
    expect(() => soundManager.playKatanaUnsheathe()).not.toThrow();
    expect(() => soundManager.playRealisticFleshSlice()).not.toThrow();
    expect(() => soundManager.playKatanaSlice()).not.toThrow();
    expect(() => soundManager.playScreenBloodSlap()).not.toThrow();
    expect(() => soundManager.playBloodSplash()).not.toThrow();
    expect(() => soundManager.playChiburuiFlick()).not.toThrow();
    expect(() => soundManager.playKatanaSheathe()).not.toThrow();
  });
});
