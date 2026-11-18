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
    <div className="w-full max-w-4xl mx-auto px-4 py-8 animate-fadeIn text-[#f5ede0]">
      {/* Top Welcome & Instant Scribe Name Card */}
      <div className="cartoon-card bg-[#241938] p-6 mb-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-[#191128] border-[3px] border-[#1E1410] shadow-[3px_3px_0_#1E1410] flex items-center justify-center text-3xl">
              📖
            </div>
            <div>
              <h1 className="text-2xl font-bold font-fredoka text-[#FFB703] tracking-wider drop-shadow-[2px_2px_0_#1E1410]">
                Multiplayer Folio Arena
              </h1>
              <p className="text-xs text-[#E2D9F3]">
                Instant Online Play — Create or Join a Chamber Directly (5–10 Players)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-[#191128] border-[3px] border-[#1E1410] shadow-[3px_3px_0_#1E1410] px-4 py-2 rounded-2xl">
            <div className="w-8 h-8 rounded-full bg-[#FFB703] text-[#1E1410] border-2 border-[#1E1410] font-bold flex items-center justify-center text-xs">
              {(scribeName || "S").slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left">
              <label htmlFor="scribe-name-input" className="block text-[10px] font-bold text-[#21D4FD] uppercase tracking-wider">
                Online Scribe
              </label>
              {isAuthenticated && user ? (
                <div className="text-xs font-bold text-[#FFFDF7]">{user.username}</div>
              ) : (
                <input
                  id="scribe-name-input"
                  aria-label="Scribe Name"
                  type="text"
                  maxLength={20}
                  value={scribeName}
                  onChange={(e) => setScribeName(e.target.value)}
                  disabled={isActionDisabled}
                  className="bg-transparent text-xs font-bold text-[#FFFDF7] focus:outline-none border-b border-dashed border-[#FFB703]/60 focus:border-[#FFB703] w-32"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-950/80 border-2 border-red-500/50 rounded-xl text-red-200 text-xs flex items-center space-x-3 shadow-lg">
          <span className="text-xl">⚠️</span>
          <span className="flex-1 font-semibold">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-300 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Cards: Create Room & Join Room */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Create Room */}
        <div className="cartoon-card bg-[#241938] p-6 flex flex-col justify-between relative">
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-3xl drop-shadow-[2px_2px_0_#1E1410]">🏰</span>
              <h2 className="text-lg font-bold font-fredoka text-[#FFB703] drop-shadow-[1px_1px_0_#1E1410]">
                Create Private Room
              </h2>
            </div>
            <p className="text-xs text-[#E2D9F3] leading-relaxed mb-4">
              Open a new magical chamber. You will become the Room Host with authority to manage participants and launch the match when 5–10 players are assembled.
            </p>
            <ul className="text-[11px] text-[#B8A9D4] space-y-1 mb-6">
              <li>• 5 to 10 players required to launch</li>
              <li>• Up to 5 additional spectators supported</li>
              <li>• Automatic 10-minute timeout for idle waiting rooms</li>
            </ul>
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={isActionDisabled}
            className="cartoon-btn w-full py-3 bg-[#FFB703] hover:bg-[#FFC933] text-[#1E1410] font-bold text-xs uppercase tracking-wider rounded-2xl disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
          >
            {isCreating ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Opening Chamber...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>Inscribe New Room</span>
              </>
            )}
          </button>
        </div>

        {/* Card 2: Join Room by Code */}
        <div className="cartoon-card bg-[#241938] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-3xl drop-shadow-[2px_2px_0_#1E1410]">🗝️</span>
              <h2 className="text-lg font-bold font-fredoka text-[#21D4FD] drop-shadow-[1px_1px_0_#1E1410]">
                Enter Room Code
              </h2>
            </div>
            <p className="text-xs text-[#E2D9F3] leading-relaxed mb-3">
              Join an existing match using the six-character Base-32 chamber code shared by the host scribe.
            </p>

            <div className="mb-4">
              <label htmlFor="room-code-input" className="block text-[11px] font-semibold text-[#C9BDD9] mb-1">
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
                className="cartoon-input w-full bg-[#191128] rounded-2xl px-4 py-2.5 text-center text-lg font-mono font-bold tracking-[0.25em] text-[#FFB703] uppercase focus:border-[#FFB703] disabled:opacity-50"
              />
              <div className="flex justify-between items-center text-[10px] text-[#B8A9D4] mt-1.5 px-1">
                <span>Base-32 Code</span>
                <span>{roomCodeInput.length} / 6</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <button
              onClick={handleJoinAsPlayer}
              disabled={isActionDisabled || roomCodeInput.length !== 6}
              className="cartoon-btn py-2.5 bg-[#21D4FD] hover:bg-[#5CE1FF] text-[#1E1410] font-bold text-xs uppercase tracking-wider rounded-2xl disabled:opacity-40 flex items-center justify-center space-x-1 cursor-pointer"
            >
              {isJoining ? <span>Joining...</span> : <span>Join as Player</span>}
            </button>

            <button
              onClick={handleJoinAsSpectator}
              disabled={isActionDisabled || roomCodeInput.length !== 6}
              className="cartoon-btn py-2.5 bg-[#34264D] hover:bg-[#433163] text-[#FFFDF7] font-bold text-xs uppercase tracking-wider rounded-2xl disabled:opacity-40 flex items-center justify-center space-x-1 cursor-pointer"
            >
              {isSpectating ? <span>Entering...</span> : <span>Spectate</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Rules & Architecture Invariants Banner */}
      <div className="mt-8 p-4 bg-[#141019] border border-[#2b2138] rounded-xl text-xs text-[#8e809e] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span>🛡️</span>
          <span>
            <strong>Server-Authoritative:</strong> All dice rolls use cryptographic commitment-reveal; match state exists strictly in RAM.
          </span>
        </div>
        <div className="text-[11px] text-[#22d3ee]">v3.2.0 Locked Protocol</div>
      </div>
    </div>
  );
};
