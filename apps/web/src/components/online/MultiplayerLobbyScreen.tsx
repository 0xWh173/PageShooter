import React, { useState } from "react";
import type { PublicRoomState } from "@pageshooter/shared";
import { useAuth } from "../../context/AuthContext.js";
import { apiClient, ApiError } from "../../network/apiClient.js";

export interface MultiplayerLobbyScreenProps {
  onRoomCreated: (room: PublicRoomState) => void;
  onJoinRoom: (room: PublicRoomState, role: "PLAYER" | "SPECTATOR") => void;
  onOpenAuth: () => void;
}

export const MultiplayerLobbyScreen: React.FC<MultiplayerLobbyScreenProps> = ({
  onRoomCreated,
  onJoinRoom
}) => {
  const { user, isAuthenticated, setSession } = useAuth();

  const [scribeName, setScribeName] = useState<string>(
    () => user?.username || `Scribe_${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isSpectating, setIsSpectating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (user?.username) {
      setScribeName(user.username);
    }
  }, [user?.username]);

  const ensureScribeSession = async () => {
    if (isAuthenticated && user) {
      return user;
    }
    const { user: guestUser } = await apiClient.createGuestSession(scribeName);
    setSession(guestUser);
    return guestUser;
  };

  // Filter input to valid 6-char Base-32 alphanumeric characters
  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const raw = e.target.value.toUpperCase();
    // Allow Base-32 alphabet (A-Z excluding I and O, and 2-9 excluding 0 and 1)
    const sanitized = raw.replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
    setRoomCodeInput(sanitized);
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await ensureScribeSession();
      const { room } = await apiClient.createRoom();
      onRoomCreated(room);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create room. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinAsPlayer = async () => {
    if (roomCodeInput.length !== 6) return;

    setIsJoining(true);
    setErrorMessage(null);
    try {
      await ensureScribeSession();
      const { room } = await apiClient.joinRoom(roomCodeInput);
      onJoinRoom(room, "PLAYER");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to join room. Verify the code and try again.";
      setErrorMessage(msg);
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinAsSpectator = async () => {
    if (roomCodeInput.length !== 6) return;

    setIsSpectating(true);
    setErrorMessage(null);
    try {
      await ensureScribeSession();
      const { room } = await apiClient.spectateRoom(roomCodeInput);
      onJoinRoom(room, "SPECTATOR");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to spectate room. Verify the code and try again.";
      setErrorMessage(msg);
    } finally {
      setIsSpectating(false);
    }
  };

  const isActionDisabled = isCreating || isJoining || isSpectating;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 animate-fadeIn text-[#1C1917]">
      {/* Top Comic Issue Banner & Instant Scribe Name Panel (Warm Vintage Reference 3 Palette) */}
      <div className="cartoon-card-lg bg-[#FAF4E6] mb-6 relative overflow-hidden">
        <div className="bg-[#1C1917] text-[#FAF4E6] px-6 py-4 border-b-4 border-[#1C1917] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-[#E5C467] border-3 border-[#FAF4E6] shadow-[4px_4px_0_#C85A48] -rotate-3 flex items-center justify-center text-3xl">
              📖
            </div>
            <div>
              <span className="inline-block bg-[#C85A48] text-[#FAF4E6] font-mono font-bold text-[10px] px-2 py-0.5 uppercase tracking-widest -skew-x-6 mb-1">
                COMIC PORT • LIVE MULTIPLAYER
              </span>
              <h1 className="text-3xl font-bangers text-[#E5C467] tracking-wider uppercase leading-none">
                Multiplayer Folio Arena
              </h1>
              <p className="text-xs font-bold text-[#FAF4E6]/85 mt-1">
                Instant Online Play — Create or Join a Chamber Directly (5–10 Players)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-[#E5C467] border-3 border-[#FAF4E6] shadow-[4px_4px_0_#688B9A] px-4 py-2 -skew-x-3">
            <div className="w-8 h-8 bg-[#1C1917] text-[#E5C467] border-2 border-[#1C1917] font-bangers flex items-center justify-center text-sm">
              {(scribeName || "S").slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left">
              <label htmlFor="scribe-name-input" className="block text-[10px] font-bangers text-[#9E3526] uppercase tracking-wider">
                Online Scribe
              </label>
              {isAuthenticated && user ? (
                <div className="text-xs font-extrabold text-[#1C1917]">{user.username}</div>
              ) : (
                <input
                  id="scribe-name-input"
                  aria-label="Scribe Name"
                  type="text"
                  maxLength={20}
                  value={scribeName}
                  onChange={(e) => setScribeName(e.target.value)}
                  disabled={isActionDisabled}
                  className="bg-transparent text-xs font-extrabold text-[#1C1917] focus:outline-none border-b-2 border-dashed border-[#1C1917] w-32"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-[#C85A48] border-4 border-[#1C1917] shadow-[6px_6px_0_#1C1917] text-[#FAF4E6] text-xs flex items-center space-x-3">
          <span className="text-xl">⚠️</span>
          <span className="flex-1 font-bold">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[#FAF4E6] hover:text-[#E5C467] text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Panels: Create Room & Join Room */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Create Room */}
        <div className="cartoon-card bg-[#FAF4E6] flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="bg-[#1C1917] text-[#E5C467] px-5 py-3 border-b-4 border-[#1C1917] flex items-center space-x-3">
              <span className="text-2xl">🏰</span>
              <h2 className="text-2xl font-bangers tracking-wider uppercase">
                Create Private Room
              </h2>
            </div>
            <div className="p-6">
              <p className="text-xs font-bold text-[#1C1917] leading-relaxed mb-4">
                Open a new comic battle chamber! You become the Room Host with authority to manage participants and launch the match when 5–10 players assemble.
              </p>
              <ul className="text-xs font-bold text-[#1C1917]/80 space-y-1.5 bg-[#EFE6D0] border-2 border-[#1C1917] p-3 shadow-[3px_3px_0_#1C1917]">
                <li>★ 5 to 10 players required to launch</li>
                <li>★ Up to 5 additional spectators supported</li>
                <li>★ Automatic 10-minute timeout for idle waiting rooms</li>
              </ul>
            </div>
          </div>

          <div className="px-6 pb-6">
            <button
              onClick={handleCreateRoom}
              disabled={isActionDisabled}
              className="cartoon-btn w-full py-3.5 bg-[#E5C467] hover:bg-[#EDD07A] text-[#1C1917] font-bangers text-lg uppercase tracking-wider disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isCreating ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Opening Chamber...</span>
                </>
              ) : (
                <>
                  <span>☛</span>
                  <span>Inscribe New Room</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Panel 2: Join Room by Code */}
        <div className="cartoon-card bg-[#FAF4E6] flex flex-col justify-between overflow-hidden">
          <div>
            <div className="bg-[#1C1917] text-[#9AC0CD] px-5 py-3 border-b-4 border-[#1C1917] flex items-center space-x-3">
              <span className="text-2xl">🗝️</span>
              <h2 className="text-2xl font-bangers tracking-wider uppercase">
                Enter Room Code
              </h2>
            </div>
            <div className="p-6 pb-2">
              <p className="text-xs font-bold text-[#1C1917] leading-relaxed mb-3">
                Join an existing match using the six-character Base-32 chamber code shared by the host scribe.
              </p>

              <div className="mb-3">
                <label htmlFor="room-code-input" className="block text-xs font-bangers tracking-wider uppercase text-[#1C1917] mb-1">
                  Six-Character Code:
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  placeholder="ABC234"
                  value={roomCodeInput}
                  onChange={handleRoomCodeChange}
                  disabled={isActionDisabled}
                  maxLength={6}
                  className="cartoon-input w-full bg-[#EFE6D0] px-4 py-2.5 text-center text-xl font-mono font-extrabold tracking-[0.25em] text-[#1C1917] uppercase focus:bg-[#E5C467]/40 disabled:opacity-50"
                />
                <div className="flex justify-between items-center text-[11px] font-bold text-[#1C1917]/80 mt-1.5 px-1">
                  <span>Base-32 Code</span>
                  <span>{roomCodeInput.length} / 6</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-6 pb-6">
            <button
              onClick={handleJoinAsPlayer}
              disabled={isActionDisabled || roomCodeInput.length !== 6}
              className="cartoon-btn py-3 bg-[#688B9A] hover:bg-[#7A9DAB] text-[#FAF4E6] font-bangers text-base uppercase tracking-wider disabled:opacity-40 flex items-center justify-center space-x-1 cursor-pointer"
            >
              {isJoining ? <span>Joining...</span> : <span>Join as Player</span>}
            </button>

            <button
              onClick={handleJoinAsSpectator}
              disabled={isActionDisabled || roomCodeInput.length !== 6}
              className="cartoon-btn py-3 bg-[#C85A48] hover:bg-[#D66A59] text-[#FAF4E6] font-bangers text-base uppercase tracking-wider disabled:opacity-40 flex items-center justify-center space-x-1 cursor-pointer"
            >
              {isSpectating ? <span>Entering...</span> : <span>Spectate</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Rules & Editor's Note Banner (Reference 3 Style) */}
      <div className="comic-editors-note mt-8 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span>🛡️</span>
          <span>
            <strong>* Editor&apos;s Note (Server-Authoritative):</strong> All dice rolls use cryptographic commitment-reveal; match state exists strictly in RAM.
          </span>
        </div>
        <div className="bg-[#C85A48] text-[#FAF4E6] border-2 border-[#1C1917] px-3 py-0.5 font-bangers tracking-widest text-xs uppercase -skew-x-6">
          TO BE CONTINUED... • v3.2.0
        </div>
      </div>
    </div>
  );
};
