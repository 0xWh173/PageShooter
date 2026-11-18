import React, { useState, useEffect, useRef } from "react";
import { ALLOWED_EMOJI_IDS, type AllowedEmojiId, type RoomParticipant } from "@pageshooter/shared";
import type { ChatMessage } from "../../network/syncStore.js";
import type { WebSocketClient } from "../../network/websocketClient.js";
import { soundManager } from "../../audio/soundManager.js";

const EMOJI_DISPLAY: Record<AllowedEmojiId, { glyph: string; label: string }> = {
  thumb: { glyph: "👍", label: "Thumbs Up" },
  fire: { glyph: "🔥", label: "Fire" },
  skull: { glyph: "💀", label: "Skull" },
  scream: { glyph: "😱", label: "Scream" },
  sword: { glyph: "⚔️", label: "Sword" },
  cheer: { glyph: "🎉", label: "Cheer" }
};

interface FloatingEmoji {
  id: string;
  emojiId: AllowedEmojiId;
  senderUsername: string;
  leftPercent: number;
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
  const [muteSecondsRemaining, setMuteSecondsRemaining] = useState(0);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMsgCountRef = useRef(chatMessages.length);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Track unread messages & play chat ping
  useEffect(() => {
    if (chatMessages.length > prevMsgCountRef.current) {
      soundManager.playChatPing();
      if (!drawerOpen) {
        setUnreadCount((c) => c + (chatMessages.length - prevMsgCountRef.current));
      }
    }
    prevMsgCountRef.current = chatMessages.length;
  }, [chatMessages.length, drawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      setUnreadCount(0);
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

  // Subscribe to EMOJI_BROADCAST and MUTED errors
  useEffect(() => {
    if (!webSocketClient) return;
    const unsubscribe = webSocketClient.onMessage((msg) => {
      if (msg.type === "EMOJI_BROADCAST") {
        const emojiId = msg.emojiId as AllowedEmojiId;
        if (!ALLOWED_EMOJI_IDS.includes(emojiId)) return;
        soundManager.playEmojiPop();
        const floatId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const leftPercent = 15 + Math.floor(Math.random() * 70);
        const sender = participants.find((p) => p.userId === msg.senderUserId);
        const senderUsername = sender?.username ?? "Scribe";
        setFloatingEmojis((prev) => [
          ...prev,
          { id: floatId, emojiId, senderUsername, leftPercent }
        ]);
        setTimeout(() => {
          setFloatingEmojis((prev) => prev.filter((item) => item.id !== floatId));
        }, 1800);
      } else if (msg.type === "ERROR" && msg.code === "MUTED") {
        setMuteSecondsRemaining(30);
      }
    });
    return () => unsubscribe();
  }, [webSocketClient]);

  const handleSendEmoji = (emojiId: AllowedEmojiId) => {
    if (emojiCooldown || !webSocketClient || !webSocketClient.isConnected) return;
    setEmojiCooldown(true);
    try {
      webSocketClient.sendEmoji(roomCode, emojiId);
    } catch {
      // Ignore send failure if socket disconnected
    }
    setTimeout(() => setEmojiCooldown(false), 500);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || muteSecondsRemaining > 0) return;
    if (!webSocketClient || !webSocketClient.isConnected) return;
    try {
      webSocketClient.sendChat(roomCode, trimmed.slice(0, 200));
      setDraft("");
    } catch {
      // Ignore send failure
    }
  };

  return (
    <>
      {/* Ephemeral Floating Emoji Cascade Layer */}
      <div
        aria-hidden="true"
        data-testid="floating-emoji-layer"
        className="pointer-events-none fixed inset-x-0 bottom-20 top-20 z-40 overflow-hidden"
      >
        {floatingEmojis.map((item) => (
          <div
            key={item.id}
            style={{ left: `${item.leftPercent}%` }}
            className="absolute bottom-4 flex flex-col items-center animate-bounce transition-all duration-1000"
          >
            <span className="text-4xl drop-shadow-lg">{EMOJI_DISPLAY[item.emojiId].glyph}</span>
            <span className="text-[10px] font-bold bg-black/70 text-[#f5ede0] px-2 py-0.5 rounded-full mt-0.5">
              {item.senderUsername}
            </span>
          </div>
        ))}
      </div>

      {/* Docked Bottom Bar: 6 Authorized Emoji Buttons + Chat Toggle */}
      <div className="cartoon-card fixed bottom-10 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-1.5 sm:space-x-2 bg-[#241938]/95 backdrop-blur-md px-3 py-1.5">
        <div className="flex items-center space-x-1.5" data-testid="emoji-reaction-bar">
          {ALLOWED_EMOJI_IDS.map((emojiId) => {
            const meta = EMOJI_DISPLAY[emojiId];
            return (
              <button
                key={emojiId}
                type="button"
                onClick={() => handleSendEmoji(emojiId)}
                disabled={emojiCooldown}
                title={meta.label}
                aria-label={`Send ${meta.label} reaction`}
                data-testid={`emoji-btn-${emojiId}`}
                className="cartoon-btn w-9 h-9 rounded-xl bg-[#34264D] hover:bg-[#4B3670] flex items-center justify-center text-lg disabled:opacity-50 cursor-pointer"
              >
                {meta.glyph}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-[2px] bg-[#1E1410] mx-1" />

        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          data-testid="toggle-chat-drawer"
          className="cartoon-btn relative px-3 py-1.5 rounded-xl bg-[#21D4FD] hover:bg-[#5CE1FF] text-xs font-bold text-[#1E1410] flex items-center space-x-1.5 cursor-pointer"
        >
          <span>💬</span>
          <span className="hidden sm:inline">Chat</span>
          {unreadCount > 0 && (
            <span
              data-testid="chat-unread-badge"
              className="px-1.5 py-0.2 rounded-full bg-[#FF4D6D] text-[#FFFDF7] border border-[#1E1410] text-[10px] font-bold"
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Slide-out Room Chat Drawer */}
      {drawerOpen && (
        <aside
          data-testid="room-chat-drawer"
          className="cartoon-card-lg fixed right-3 bottom-24 z-40 w-80 max-w-[calc(100vw-1.5rem)] h-96 bg-[#241938] flex flex-col overflow-hidden text-[#FFFDF7]"
        >
          <div className="px-4 py-2.5 bg-[#120f18] border-b border-[#2d223c] flex items-center justify-between">
            <span className="text-xs font-bold font-fredoka text-[#f59e0b]">
              💬 Chamber Chat ({roomCode})
            </span>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close chat"
              className="text-[#a394b3] hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {chatMessages.length === 0 ? (
              <p className="text-[#7a6d88] italic text-center mt-8">
                No messages yet. Say hello to the chamber!
              </p>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={`${msg.senderUserId}-${msg.timestamp}-${idx}`} className="leading-snug">
                  <span className="font-bold text-[#22d3ee]">
                    {msg.senderUsername}
                    {msg.role === "SPECTATOR" ? " [Spec]" : ""}:{" "}
                  </span>
                  <span className="text-[#f5ede0] break-words">{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {muteSecondsRemaining > 0 && (
            <div
              data-testid="chat-mute-banner"
              className="px-3 py-1.5 bg-red-950/80 border-t border-red-500/40 text-red-200 text-[11px] font-semibold text-center"
            >
              ⏳ Rate limit exceeded. Muted for {muteSecondsRemaining}s
            </div>
          )}

          <form
            onSubmit={handleSendChat}
            className="p-2 bg-[#120f18] border-t border-[#2d223c] flex items-center space-x-2"
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
                  : "Message (max 200 chars)..."
              }
              data-testid="chat-message-input"
              className="flex-1 bg-[#1e1828] border border-[#382b4a] rounded-xl px-3 py-1.5 text-xs text-[#f5ede0] placeholder-[#6c5e7b] focus:outline-none focus:border-[#f59e0b]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || muteSecondsRemaining > 0}
              data-testid="chat-send-button"
              className="cartoon-btn px-3 py-1.5 bg-[#FFB703] hover:bg-[#FFC933] disabled:opacity-40 text-[#1E1410] font-bold text-xs rounded-xl"
            >
              Send
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
