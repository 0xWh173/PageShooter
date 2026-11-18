import React from "react";

interface ServerRestartModalProps {
  reason: string | null;
  onReturnToLobby: () => void;
}

export const ServerRestartModal: React.FC<ServerRestartModalProps> = ({
  reason,
  onReturnToLobby
}) => {
  if (!reason) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-restart-title"
      data-testid="server-restart-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
    >
      <div className="bg-[#18141f] border-2 border-red-500/60 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl text-[#f5ede0]">
        <div className="text-4xl">🔥</div>
        <h3
          id="server-restart-title"
          className="text-xl font-bold font-fredoka text-red-400"
        >
          Match Terminated (Server Restart)
        </h3>
        <p className="text-xs text-[#c9bdd9] leading-relaxed">
          {reason}
        </p>
        <p className="text-[11px] text-[#8e809e] bg-[#120f18] p-3 rounded-xl border border-[#2d223c]">
          Active matches are stored strictly in RAM to protect privacy and zero-cost hosting. Please create or join a new chamber to play again.
        </p>
        <button
          onClick={onReturnToLobby}
          data-testid="server-restart-return-lobby"
          className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-lg cursor-pointer"
        >
          Return to Lobby
        </button>
      </div>
    </div>
  );
};
