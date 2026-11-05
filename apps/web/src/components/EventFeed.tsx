import React, { useState } from "react";
import type { MatchEvent } from "@pageshooter/shared";

interface EventFeedProps {
  events: MatchEvent[];
}

export const EventFeed: React.FC<EventFeedProps> = ({ events }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Take the most recent 6 events
  const recentEvents = [...events].reverse().slice(0, 6);

  const formatEventText = (e: MatchEvent): string => {
    switch (e.type) {
      case "BOOK_ROLL_ACCEPTED":
        return `${e.actorUsername || e.actorPlayerId} turned to Page ${e.pageNumber} (Cell #${e.outcome})`;
      case "CELL_PROGRESS_UPDATED": {
        const stageNames = ["Empty", "Face", "Body", "Legs", "Arms", "Gun"];
        const prog = (e.metadata as { progress?: number })?.progress ?? 0;
        return `${e.actorUsername || e.actorPlayerId}'s Cell #${e.cellValue} progressed to ${stageNames[prog]}`;
      }
      case "SHOT_REQUIRED":
        return `⭐ Bullet loaded! ${e.actorUsername || e.actorPlayerId} must fire!`;
      case "CELL_DESTROYED": {
        const victimName = (e.metadata as { targetUsername?: string })?.targetUsername || e.targetPlayerId;
        return `🎯 Cell #${e.cellValue} of ${victimName} was poofed by ${e.actorUsername || e.actorPlayerId}!`;
      }
      case "PLAYER_ELIMINATED":
        return `😴 ${e.actorUsername || e.actorPlayerId} ran out of ink and is eliminated!`;
      case "MATCH_WON":
        return `👑 ${e.actorUsername || e.actorPlayerId} prevailed as the Storybook Champion!`;
      case "TURN_WASTED":
        return `${e.actorUsername || e.actorPlayerId} rolled destroyed Cell #${e.cellValue}. Turn passed.`;
      default:
        return e.type.replace(/_/g, " ").toLowerCase();
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 mt-2">
      <div className="bg-cozy-white border border-cozy-cell-border rounded-xl p-2.5 shadow-subtle">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between text-left text-xs font-fredoka font-semibold text-cozy-brown/80 hover:text-cozy-brown-dark cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span>📜</span>
            <span>Match Activity Log</span>
            <span className="text-[10px] font-fredoka bg-cozy-parchment/60 px-1.5 py-0.2 rounded-full">
              {events.length}
            </span>
          </div>
          <span className="text-[11px] text-cozy-brown/60">
            {isOpen ? "Hide ▲" : "Show Recent ▼"}
          </span>
        </button>

        {isOpen && (
          <div className="mt-2 pt-2 border-t border-cozy-cell-border/60 max-h-36 overflow-y-auto space-y-1 text-[11px] font-fredoka text-cozy-brown-dark">
            {recentEvents.length === 0 ? (
              <div className="text-cozy-brown/50 italic py-1">No actions recorded yet.</div>
            ) : (
              recentEvents.map((ev, idx) => (
                <div
                  key={ev.eventId || idx}
                  className="flex items-center gap-2 py-0.5 px-1.5 rounded hover:bg-cozy-parchment/20"
                >
                  <span className="text-cozy-brown/50 font-mono text-[10px]">#{ev.sequence}</span>
                  <span className="truncate">{formatEventText(ev)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
