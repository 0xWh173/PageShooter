import React, { useState, useEffect } from "react";
import type { MatchState } from "@pageshooter/shared";
import type { ConnectionStatus } from "../../network/websocketClient.js";

interface DisconnectOverlayProps {
  matchState: MatchState | null;
  connectionStatus: ConnectionStatus;
  onReturnToLobby: () => void;
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const DisconnectOverlay: React.FC<DisconnectOverlayProps> = ({
  matchState,
  connectionStatus,
  onReturnToLobby
}) => {
  const [now, setNow] = useState(() => Date.now());

  const isPaused = matchState?.phase === "PAUSED";
  const deadline = matchState?.disconnectDeadline ?? null;

  useEffect(() => {
    if (!isPaused || !deadline) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [isPaused, deadline]);

  const disconnectedNames =
    matchState?.players
      .filter((p) => p.connected === false && p.status === "ACTIVE")
      .map((p) => p.username) || [];

  return (
    <>
      {/* Peer Disconnect 60-Second Match Pause Banner */}
      {isPaused && (
        <div
          role="alert"
          data-testid="match-paused-banner"
          className="w-full bg-amber-950/90 border-b-2 border-amber-500 text-amber-100 px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm"
        >
          <span className="text-lg animate-pulse">⏸️</span>
          <span>
            <strong>Match Paused:</strong>{" "}
            {disconnectedNames.length > 0
              ? `${disconnectedNames.join(", ")} disconnected.`
              : "A player disconnected."}{" "}
            Waiting for reconnection:
          </span>
          {deadline && (
            <span
              data-testid="pause-countdown-timer"
              className="font-mono font-bold text-amber-300 bg-black/40 px-2.5 py-0.5 rounded-lg border border-amber-500/40"
            >
              {formatCountdown(deadline - now)}
            </span>
          )}
        </div>
      )}

      {/* Local Socket Reconnecting Modal */}
      {connectionStatus === "RECONNECTING" && (
        <div
          role="alertdialog"
          aria-modal="true"
          data-testid="local-reconnecting-overlay"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#18141f] border-2 border-amber-500/60 rounded-2xl p-6 max-w-sm w-full text-center space-y-3 shadow-2xl text-[#f5ede0]">
            <div className="text-3xl animate-spin inline-block">⏳</div>
            <h3 className="text-lg font-bold font-fredoka text-[#f59e0b]">
              Connection Lost
            </h3>
            <p className="text-xs text-[#c9bdd9]">
              Reconnecting to match chamber... Your seat is held safely for up to 60 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Multi-Tab Supersession Modal (Close Code 4409) */}
      {connectionStatus === "SUPERSEDED" && (
        <div
          role="alertdialog"
          aria-modal="true"
          data-testid="session-superseded-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#18141f] border-2 border-cyan-500/60 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl text-[#f5ede0]">
            <div className="text-3xl">🪟</div>
            <h3 className="text-lg font-bold font-fredoka text-cyan-300">
              Session Opened in Another Window
            </h3>
            <p className="text-xs text-[#c9bdd9]">
              Your account connected to this chamber from a newer browser tab. This window has been disconnected to prevent phantom disconnects.
            </p>
            <button
              onClick={onReturnToLobby}
              className="w-full py-2.5 bg-[#2d233a] hover:bg-[#3d2f4d] border border-[#5a4278] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </>
  );
};
