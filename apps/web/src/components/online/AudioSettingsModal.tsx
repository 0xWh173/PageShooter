import React, { useState, useEffect } from "react";
import {
  soundManager,
  type AudioChannel,
  type AudioChannelSettingsMap
} from "../../audio/soundManager.js";

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHANNEL_METADATA: Array<{
  key: AudioChannel;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    key: "music",
    label: "Music & Ambience",
    icon: "🎼",
    description: "Background chamber resonance and thematic ambience"
  },
  {
    key: "book",
    label: "Book & Page",
    icon: "📖",
    description: "Storybook opening chimes, parchment rustles, page flips"
  },
  {
    key: "combat",
    label: "Combat & Katana",
    icon: "⚔️",
    description: "Katana unsheathe, slashes, cell shatters, eliminations"
  },
  {
    key: "ui",
    label: "UI & Reactions",
    icon: "🔔",
    description: "Turn chimes, chat pings, emoji pops, button feedback"
  },
  {
    key: "voice",
    label: "Voice (Gated)",
    icon: "🎙️",
    description: "Incoming peer voice channel (disabled while TURN gated)"
  }
];

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const [master, setMaster] = useState(() => soundManager.getSettings());
  const [channels, setChannels] = useState<AudioChannelSettingsMap>(() =>
    soundManager.getChannelSettings()
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMasterVolume = (value: number) => {
    soundManager.setVolume(value);
    setMaster(soundManager.getSettings());
  };

  const handleMasterMute = () => {
    soundManager.toggleMute();
    setMaster(soundManager.getSettings());
  };

  const handleChannelVolume = (channel: AudioChannel, value: number) => {
    soundManager.setChannelVolume(channel, value);
    setChannels(soundManager.getChannelSettings());
  };

  const handleChannelMute = (channel: AudioChannel) => {
    soundManager.toggleChannelMute(channel);
    setChannels(soundManager.getChannelSettings());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-settings-title"
      onClick={onClose}
    >
      <div
        className="cartoon-card-lg bg-[#241938] max-w-md w-full p-6 text-[#FFFDF7] space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-[#1E1410] pb-3">
          <div>
            <h2 id="audio-settings-title" className="text-lg font-bold font-fredoka text-[#FFB703] drop-shadow-[1px_1px_0_#1E1410]">
              🔊 5-Channel Audio Mixer
            </h2>
            <p className="text-[11px] text-[#C9BDD9]">
              Independent volume & mute controls persisted locally
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close audio settings"
            className="cartoon-btn w-8 h-8 rounded-xl bg-[#34264D] hover:bg-[#433163] text-[#FFFDF7] flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Master Control */}
        <div className="cartoon-card p-3 bg-[#191128] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#FFFDF7]">Master Output</span>
            <button
              onClick={handleMasterMute}
              data-testid="master-mute-toggle"
              className={`cartoon-btn px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                master.muted
                  ? "bg-[#FF4D6D] text-[#FFFDF7]"
                  : "bg-[#38B000] text-[#FFFDF7]"
              }`}
            >
              {master.muted ? "Muted" : "Active"}
            </button>
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={master.volume}
              aria-label="Master Volume"
              onChange={(e) => handleMasterVolume(parseFloat(e.target.value))}
              className="flex-1 accent-[#f59e0b]"
            />
            <span className="text-xs font-mono w-10 text-right text-[#c4b58a]">
              {Math.round(master.volume * 100)}%
            </span>
          </div>
        </div>

        {/* 5 Independent Channels */}
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {CHANNEL_METADATA.map((meta) => {
            const ch = channels[meta.key];
            return (
              <div
                key={meta.key}
                data-testid={`audio-channel-${meta.key}`}
                className="p-3 rounded-xl bg-[#14101a] border border-[#2d223c] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span>{meta.icon}</span>
                    <span className="text-xs font-bold text-[#f5ede0]">{meta.label}</span>
                  </div>
                  <button
                    onClick={() => handleChannelMute(meta.key)}
                    data-testid={`mute-channel-${meta.key}`}
                    className={`cartoon-btn px-2.5 py-0.5 rounded-lg text-[10px] font-bold ${
                      ch.muted
                        ? "bg-[#FF4D6D] text-[#FFFDF7]"
                        : "bg-[#34264D] text-[#FFFDF7]"
                    }`}
                  >
                    {ch.muted ? "Muted" : "On"}
                  </button>
                </div>
                <p className="text-[10px] text-[#7a6d88]">{meta.description}</p>
                <div className="flex items-center space-x-3 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={ch.volume}
                    aria-label={`${meta.label} Volume`}
                    data-testid={`slider-channel-${meta.key}`}
                    onChange={(e) => handleChannelVolume(meta.key, parseFloat(e.target.value))}
                    className="flex-1 accent-[#22d3ee]"
                  />
                  <span className="text-[11px] font-mono w-9 text-right text-[#a394b3]">
                    {Math.round(ch.volume * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="cartoon-btn w-full py-2.5 bg-[#FFB703] hover:bg-[#FFC933] text-[#1E1410] font-bold text-xs uppercase tracking-wider rounded-2xl"
        >
          Done
        </button>
      </div>
    </div>
  );
};
