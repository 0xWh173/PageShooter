/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        fantasy: {
          bg: "#0B0C10",
          card: "#14161D",
          border: "#282B36",
          gold: "#E5A93C",
          "gold-light": "#FAD074",
          "gold-dark": "#9E6F18",
          parchment: "#D9C9A5",
          crimson: "#A82020",
          "crimson-light": "#E83A3A",
          rune: "#4E9F9F",
          "rune-glow": "#79ECEC"
        }
      },
      fontFamily: {
        serif: ["Cinzel", "Cinzel Decorative", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"]
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" }
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" }
        }
      },
      animation: {
        shimmer: "shimmer 2.5s infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

