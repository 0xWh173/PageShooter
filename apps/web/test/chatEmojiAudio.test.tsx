// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ALLOWED_EMOJI_IDS, type WSServerMessage } from "@pageshooter/shared";
import type { WebSocketClient } from "../src/network/websocketClient.js";
import { ChatAndEmojiHUD } from "../src/components/online/ChatAndEmojiHUD.js";
import { AudioSettingsModal } from "../src/components/online/AudioSettingsModal.js";
import { soundManager, type AudioChannel } from "../src/audio/soundManager.js";

function createMockChatWsClient() {
  const listeners = new Set<(m: WSServerMessage) => void>();
  const client = {
    isConnected: true,
    sendChat: vi.fn(),
    sendEmoji: vi.fn(),
    onMessage: (cb: (m: WSServerMessage) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: (m: WSServerMessage) => {
      for (const cb of listeners) cb(m);
    }
  };
  return client as unknown as WebSocketClient & { emit: (m: WSServerMessage) => void };
}

describe("Milestone 4: Chat, 6-Emoji HUD & 5-Channel Audio", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders strictly the 6 authorized emoji buttons and emits SEND_EMOJI_REACTION", () => {
    const ws = createMockChatWsClient();
    render(<ChatAndEmojiHUD roomCode="ROOM42" chatMessages={[]} webSocketClient={ws} />);

    expect(ALLOWED_EMOJI_IDS).toEqual(["thumb", "fire", "skull", "scream", "sword", "cheer"]);
    for (const id of ALLOWED_EMOJI_IDS) {
      expect(screen.getByTestId(`emoji-btn-${id}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("emoji-btn-fire"));
    expect(ws.sendEmoji).toHaveBeenCalledWith("ROOM42", "fire");
  });

  it("enforces 200-char chat input, sends chat messages, and handles MUTED error countdown", () => {
    const ws = createMockChatWsClient();
    render(<ChatAndEmojiHUD roomCode="ROOM42" chatMessages={[]} webSocketClient={ws} />);

    fireEvent.click(screen.getByTestId("toggle-chat-drawer"));
    const input = screen.getByTestId("chat-message-input") as HTMLInputElement;
    expect(input.maxLength).toBe(200);

    fireEvent.change(input, { target: { value: "Good luck scribes!" } });
    fireEvent.click(screen.getByTestId("chat-send-button"));
    expect(ws.sendChat).toHaveBeenCalledWith("ROOM42", "Good luck scribes!");

    act(() => {
      ws.emit({
        type: "ERROR",
        code: "MUTED",
        message: "You are muted for 30s"
      });
    });

    expect(screen.getByTestId("chat-mute-banner")).toBeTruthy();
    expect(input.disabled).toBe(true);
  });

  it("supports 5 independent audio channels in SoundManager and persists to localStorage", () => {
    const channels: AudioChannel[] = ["music", "book", "combat", "ui", "voice"];
    for (const ch of channels) {
      soundManager.setChannelVolume(ch, 0.35);
      soundManager.setChannelMuted(ch, ch === "voice");
    }

    const loaded = soundManager.getChannelSettings();
    expect(loaded.music.volume).toBe(0.35);
    expect(loaded.book.muted).toBe(false);
    expect(loaded.voice.muted).toBe(true);

    const stored = JSON.parse(localStorage.getItem("pageshooter_audio_v2_settings") || "{}");
    expect(stored.combat.volume).toBe(0.35);
    expect(stored.voice.muted).toBe(true);
  });

  it("renders AudioSettingsModal with all 5 channels and updates SoundManager", () => {
    render(<AudioSettingsModal isOpen={true} onClose={vi.fn()} />);

    for (const ch of ["music", "book", "combat", "ui", "voice"] as AudioChannel[]) {
      expect(screen.getByTestId(`audio-channel-${ch}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("mute-channel-book"));
    expect(soundManager.getChannelSettings().book.muted).toBe(true);
  });
});
