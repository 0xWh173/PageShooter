import React, { useState, useEffect, useRef } from "react";
import { ALLOWED_EMOJI_IDS, type AllowedEmojiId, type RoomParticipant } from "@pageshooter/shared";
import type { ChatMessage } from "../../network/syncStore.js";
import type { WebSocketClient } from "../../network/websocketClient.js";
import { soundManager } from "../../audio/soundManager.js";

const EMOJI_DISPLAY: Record<AllowedEmojiId, { glyph: string; label: string; accent: string }> = {
  thumb: { glyph: "👍", label: "Thumbs Up", accent: "#E5C467" },
  fire: { glyph: "🔥", label: "Fire", accent: "#C85A48" },
  skull: { glyph: "💀", label: "Skull", accent: "#688B9A" },
  scream: { glyph: "😱", label: "Scream", accent: "#E5C467" },
  sword: { glyph: "⚔️", label: "Sword", accent: "#C85A48" },
  cheer: { glyph: "🎉", label: "Cheer", accent: "#5E8C61" }
};

const QUICK_CHAT_CHIPS = [
  "Nice shot! 🎯",
  "Watch out! 👀",
  "My turn! 📖",
  "NOOO! 😱",
  "GG! 🏆"
];

interface FloatingEmoji {
  id: string;
  emojiId: AllowedEmojiId;
  senderUsername: string;
  rightOffsetPx: number;
  drift1: number;
  drift2: number;
  drift3: number;
  rotStart: number;
  rotMid: number;
  rotEnd: number;
  scale: number;
  durationMs: number;
}

interface ChatAndEmojiHUDProps {
  roomCode: string;
  chatMessages: ChatMessage[];
  webSocketClient: WebSocketClient | null;
  participants?: RoomParticipant[];
}

export const ChatAndEmojiHUD: React.FC<ChatAndEmojiHUDProps> = ({
  roomCode,
  chatMessages,
  webSocketClient,
  participants = []
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [emojiCooldown, setEmojiCooldown] = useState(false);
  const [clickedEmoji, setClickedEmoji] = useState<AllowedEmojiId | null>(null);
  const [muteSecondsRemaining, setMuteSecondsRemaining] = useState(0);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestPreview, setLatestPreview] = useState<ChatMessage | null>(null);
  const prevMsgCountRef = useRef(chatMessages.length);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const participantsRef = useRef<RoomParticipant[]>(participants);
  participantsRef.current = participants;

  // Track unread messages, play chat ping & show brief comic preview toast when closed
  useEffect(() => {
    if (chatMessages.length > prevMsgCountRef.current) {
      soundManager.playChatPing();
      if (!drawerOpen) {
        const added = chatMessages.length - prevMsgCountRef.current;
        setUnreadCount((c) => c + added);
        const newest = chatMessages[chatMessages.length - 1];
        if (newest) {
          setLatestPreview(newest);
        }
      }
    }
    prevMsgCountRef.current = chatMessages.length;
  }, [chatMessages, drawerOpen]);

  useEffect(() => {
    if (!latestPreview) return;
    const timer = setTimeout(() => setLatestPreview(null), 3600);
    return () => clearTimeout(timer);
  }, [latestPreview]);

  useEffect(() => {
    if (!statusNotice) return;
    const timer = setTimeout(() => setStatusNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [statusNotice]);

  useEffect(() => {
    if (drawerOpen) {
      setUnreadCount(0);
      setLatestPreview(null);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [drawerOpen, chatMessages.length]);

  // Mute countdown timer
  useEffect(() => {
    if (muteSecondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setMuteSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [muteSecondsRemaining]);

  const spawnFloatingEmoji = (emojiId: AllowedEmojiId, senderUsername: string) => {
    const floatId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const durationMs = 2250 + Math.floor(Math.random() * 550);
    const nextItem: FloatingEmoji = {
      id: floatId,
      emojiId,
      senderUsername,
      rightOffsetPx: 8 + Math.floor(Math.random() * 56),
      drift1: direction * (10 + Math.floor(Math.random() * 14)),
      drift2: -direction * (14 + Math.floor(Math.random() * 18)),
      drift3: direction * (12 + Math.floor(Math.random() * 18)),
      rotStart: -direction * (6 + Math.floor(Math.random() * 8)),
      rotMid: direction * (7 + Math.floor(Math.random() * 9)),
      rotEnd: -direction * (8 + Math.floor(Math.random() * 10)),
      scale: 0.95 + Math.random() * 0.32,
      durationMs
    };

    setFloatingEmojis((prev) => [...prev.slice(-28), nextItem]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== floatId));
    }, durationMs + 120);
  };

  // Subscribe to EMOJI_BROADCAST and MUTED errors
  useEffect(() => {
    if (!webSocketClient) return;
    const unsubscribe = webSocketClient.onMessage((msg) => {
      if (msg.type === "EMOJI_BROADCAST") {
        const emojiId = msg.emojiId as AllowedEmojiId;
        if (!ALLOWED_EMOJI_IDS.includes(emojiId)) return;
        soundManager.playEmojiPop();
        const sender = participantsRef.current.find((p) => p.userId === msg.senderUserId);
        const senderUsername = msg.senderUsername || sender?.username || "Scribe";
        spawnFloatingEmoji(emojiId, senderUsername);
      } else if (msg.type === "ERROR" && msg.code === "MUTED") {
        setMuteSecondsRemaining(30);
      }
    });
    return () => unsubscribe();
  }, [webSocketClient]);

  const handleSendEmoji = (emojiId: AllowedEmojiId) => {
    if (emojiCooldown) return;
    if (!webSocketClient || !webSocketClient.isConnected) {
      setStatusNotice("Reconnecting to chamber… try again in a moment!");
      return;
    }
    setEmojiCooldown(true);
    setClickedEmoji(emojiId);
    setTimeout(() => setClickedEmoji(null), 180);
    try {
      webSocketClient.sendEmoji(roomCode, emojiId);
    } catch {
      setStatusNotice("Could not send reaction — connection busy.");
    }
    setTimeout(() => setEmojiCooldown(false), 380);
  };

  const sendChatText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || muteSecondsRemaining > 0) return;
    if (!webSocketClient || !webSocketClient.isConnected) {
      setStatusNotice("Reconnecting to chamber… message not sent yet.");
      return;
    }
    try {
      webSocketClient.sendChat(roomCode, trimmed.slice(0, 200));
      setDraft("");
    } catch {
      setStatusNotice("Failed to send chat — check connection.");
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    sendChatText(draft);
  };

  return (
    <>
      {/* YouTube Live-Style Floating Emoji Stream (Right-Side Vertical Lane) */}
      <div
        aria-hidden="true"
        data-testid="floating-emoji-layer"
        className="pointer-events-none fixed right-3 sm:right-8 bottom-24 z-50 w-36 h-[400px] overflow-visible"
      >
        {floatingEmojis.map((item) => {
          const meta = EMOJI_DISPLAY[item.emojiId];
          return (
            <div
              key={item.id}
              style={
                {
                  right: `${item.rightOffsetPx}px`,
                  "--drift-1": `${item.drift1}px`,
                  "--drift-2": `${item.drift2}px`,
                  "--drift-3": `${item.drift3}px`,
                  "--rot-start": `${item.rotStart}deg`,
                  "--rot-mid": `${item.rotMid}deg`,
                  "--rot-end": `${item.rotEnd}deg`,
                  "--emoji-scale": item.scale,
                  "--float-duration": `${item.durationMs}ms`
                } as React.CSSProperties
              }
              className="animate-yt-live-emoji absolute bottom-0 flex flex-col items-center"
            >
              <span
                style={{ backgroundColor: meta.accent }}
                className="w-12 h-12 rounded-full border-[3px] border-[#1C1917] shadow-[3px_3px_0_#1C1917] flex items-center justify-center text-2xl sm:text-3xl"
              >
                {meta.glyph}
              </span>
              <span className="text-[10px] font-bold bg-[#1C1917] text-[#FAF4E6] border border-[#FAF4E6]/40 px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap shadow-sm">
                {item.senderUsername}
              </span>
            </div>
          );
        })}
      </div>

      {/* Brief Comic Speech-Bubble Toast for Incoming Chat (when drawer closed) or Status Notice */}
      {(statusNotice || (!drawerOpen && latestPreview)) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-xs sm:max-w-sm px-3 pointer-events-none">
          {statusNotice ? (
            <div className="bg-[#C85A48] text-[#FAF4E6] border-[3px] border-[#1C1917] shadow-[4px_4px_0_#1C1917] px-3 py-1.5 text-xs font-bold text-center">
              ⚠️ {statusNotice}
            </div>
          ) : latestPreview ? (
            <div className="bg-[#FAF4E6] text-[#1C1917] border-[3px] border-[#1C1917] shadow-[4px_4px_0_#1C1917] px-3 py-1.5 text-xs truncate">
              <span className="font-bangers tracking-wider text-[#C85A48] mr-1">
                {latestPreview.senderUsername}:
              </span>
              <span className="font-bold">{latestPreview.message}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Docked Comic Bottom Bar: 6 Authorized Emoji Buttons + Chat Toggle */}
      <div className="cartoon-card fixed bottom-9 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-1.5 sm:space-x-2 bg-[#FAF4E6]/95 backdrop-blur-md px-3 py-1.5">
        <div className="flex items-center space-x-1.5" data-testid="emoji-reaction-bar">
          {ALLOWED_EMOJI_IDS.map((emojiId) => {
            const meta = EMOJI_DISPLAY[emojiId];
            const isPopped = clickedEmoji === emojiId;
            return (
              <button
                key={emojiId}
                type="button"
                onClick={() => handleSendEmoji(emojiId)}
                disabled={emojiCooldown}
                title={meta.label}
                aria-label={`Send ${meta.label} reaction`}
                data-testid={`emoji-btn-${emojiId}`}
                className={`cartoon-btn w-9 h-9 bg-[#EFE6D0] hover:bg-[#E5C467] flex items-center justify-center text-lg disabled:opacity-50 cursor-pointer transition-transform ${
                  isPopped ? "scale-125 bg-[#E5C467]" : ""
                }`}
              >
                {meta.glyph}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-[2px] bg-[#1C1917] mx-1" />

        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          data-testid="toggle-chat-drawer"
          className="cartoon-btn relative px-3 py-1.5 bg-[#688B9A] hover:bg-[#7A9DAC] text-xs font-bangers tracking-wider uppercase text-[#FAF4E6] flex items-center space-x-1.5 cursor-pointer"
        >
          <span>💬</span>
          <span className="hidden sm:inline">Chat</span>
          {unreadCount > 0 && (
            <span
              data-testid="chat-unread-badge"
              className="px-1.5 py-0.2 rounded-full bg-[#C85A48] text-[#FAF4E6] border-2 border-[#1C1917] text-[10px] font-bold"
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Slide-out Comic Chamber Chat Drawer */}
      {drawerOpen && (
        <aside
          data-testid="room-chat-drawer"
          className="cartoon-card-lg fixed right-3 bottom-24 z-40 w-80 max-w-[calc(100vw-1.5rem)] h-[420px] bg-[#FAF4E6] flex flex-col overflow-hidden text-[#1C1917]"
        >
          <div className="px-4 py-2.5 bg-[#1C1917] border-b-[3px] border-[#1C1917] flex items-center justify-between">
            <span className="text-sm font-bangers tracking-wider text-[#E5C467] uppercase">
              💬 Chamber Chat ({roomCode})
            </span>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close chat"
              className="text-[#FAF4E6]/80 hover:text-[#E5C467] text-xs font-bold px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs bg-[#FAF4E6]">
            {chatMessages.length === 0 ? (
              <p className="text-[#7A6E5A] italic text-center mt-8 font-medium">
                No messages yet. Drop a comic taunt or say hello!
              </p>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={msg.id ?? `${msg.senderUserId}-${msg.timestamp}-${idx}`}
                  className="bg-[#EFE6D0] border-2 border-[#1C1917] shadow-[2px_2px_0_#1C1917] px-2.5 py-1.5 leading-snug"
                >
                  <span className="font-bangers tracking-wider text-[#C85A48] text-[13px]">
                    {msg.senderUsername}
                    {msg.role === "SPECTATOR" ? " [Spec]" : ""}:{" "}
                  </span>
                  <span className="text-[#1C1917] font-semibold break-words">{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 1-Tap Comic Quick-Chat Banter Chips */}
          <div className="px-2 py-1.5 bg-[#EFE6D0] border-t-2 border-[#1C1917] flex items-center gap-1 overflow-x-auto">
            {QUICK_CHAT_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={muteSecondsRemaining > 0}
                onClick={() => sendChatText(chip)}
                className="shrink-0 px-2 py-0.5 bg-[#FAF4E6] hover:bg-[#E5C467] border-2 border-[#1C1917] text-[10px] font-bold text-[#1C1917] cursor-pointer disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>

          {muteSecondsRemaining > 0 && (
            <div
              data-testid="chat-mute-banner"
              className="px-3 py-1.5 bg-[#C85A48] border-t-2 border-[#1C1917] text-[#FAF4E6] text-[11px] font-bold text-center"
            >
              ⏳ Rate limit exceeded. Muted for {muteSecondsRemaining}s
            </div>
          )}

          <form
            onSubmit={handleSendChat}
            className="p-2 bg-[#1C1917] border-t-2 border-[#1C1917] flex items-center space-x-2"
          >
            <input
              type="text"
              value={draft}
              maxLength={200}
              disabled={muteSecondsRemaining > 0}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                muteSecondsRemaining > 0
                  ? `Muted (${muteSecondsRemaining}s)...`
                  : "Say something comical..."
              }
              data-testid="chat-message-input"
              className="flex-1 bg-[#FAF4E6] border-2 border-[#1C1917] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] placeholder-[#7A6E5A] focus:outline-none focus:ring-2 focus:ring-[#E5C467]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || muteSecondsRemaining > 0}
              data-testid="chat-send-button"
              className="cartoon-btn px-3 py-1.5 bg-[#E5C467] hover:bg-[#EDD07A] disabled:opacity-40 text-[#1C1917] font-bangers tracking-wider uppercase text-xs"
            >
              Send
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
