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
          ivory: "#F7F0E5",        // Main background
          parchment: "#E8D8C3",    // Header, folios, muted surfaces
          "parchment-light": "#FAF3E8",
          brown: "#A77B59",        // Outlines, secondary text
          "brown-dark": "#75685C", // Primary charcoal-brown typography
          amber: "#D9AA61",        // Action buttons, active column accent
          "amber-light": "#FAF1DF",// Pale honey active column fill
          "amber-dark": "#B88636",
          peach: "#E8B5A5",        // Target highlight outline
          "peach-light": "#F8EBE6",// Target cell fill
          sage: "#8DAA81",         // Success / friendly accent
          "sage-light": "#E9F0E6",
          white: "#FFFFFF",
          cell: "#FDFBF7",         // Default matrix cell fill
          "cell-border": "#E3D5C4" // Thin grid line
        },
        cartoon: {
          ink: "#1E1410",
          cream: "#FFFDF7",
          paper: "#FFF4DC",
          gold: "#FFB703",
          "gold-hover": "#FFC933",
          cyan: "#21D4FD",
          coral: "#FF4D6D",
          mint: "#38B000",
          plum: "#241938",
          "plum-dark": "#191128"
        }
      },
      fontFamily: {
        fredoka: ["Fredoka", "Quicksand", "sans-serif"],
        sans: ["Quicksand", "Fredoka", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"]
      },
      boxShadow: {
        subtle: "0 2px 8px rgba(117, 104, 92, 0.06)",
        card: "0 4px 16px rgba(117, 104, 92, 0.08)",
        modal: "0 12px 32px rgba(117, 104, 92, 0.16)",
        "cartoon-sm": "3px 3px 0 #1E1410",
        "cartoon-md": "5px 5px 0 #1E1410",
        "cartoon-lg": "8px 8px 0 #1E1410",
        "cartoon-btn": "0 4px 0 #1E1410"
      }
    }
  },
  plugins: []
};
