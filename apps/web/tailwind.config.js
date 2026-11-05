/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        cozy: {
          bg: "#FAF5EB",          // Warm cream background
          parchment: "#F4EBD9",   // Soft warm paper
          card: "#FFFDF9",        // Clean warm card
          "card-hover": "#FFF8EC",
          border: "#7C5335",      // Illustrated brown ink outline
          "border-light": "#E2D3BE", // Subtle separator
          gold: "#F2B84B",        // Warm honey gold
          "gold-light": "#FDF0D0",
          "gold-dark": "#C88E23",
          peach: "#F9A887",       // Soft peach accent
          "peach-light": "#FDEAE2",
          coral: "#E76F51",       // Warm coral / red accent
          "coral-light": "#FADFD7",
          brown: "#462B18",       // Deep warm ink text
          "brown-light": "#7D583F",
          sage: "#8DAA81",        // Gentle green
          "sage-light": "#E6EEE3",
          cream: "#FFFBF2"
        }
      },
      fontFamily: {
        fredoka: ["Fredoka", "Quicksand", "system-ui", "sans-serif"],
        hand: ["Gaegu", "Fredoka", "cursive", "sans-serif"],
        sans: ["Quicksand", "Fredoka", "ui-sans-serif", "sans-serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"]
      },
      boxShadow: {
        cozy: "0 4px 14px rgba(70, 43, 24, 0.08)",
        "cozy-lg": "0 10px 25px rgba(70, 43, 24, 0.12)",
        "cozy-inner": "inset 0 2px 4px rgba(70, 43, 24, 0.06)"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" }
        },
        pop: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "70%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        sparkle: {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.8) rotate(0deg)" },
          "50%": { opacity: "1", transform: "scale(1.2) rotate(180deg)" }
        }
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        pop: "pop 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
        sparkle: "sparkle 2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
