/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#05060a",
          900: "#0a0c14",
          850: "#0d1019",
          800: "#11151f",
          700: "#171c2a",
          600: "#232a3d",
          500: "#333c54",
        },
        emerald: {
          glow: "#12f7b0",
          soft: "#0ecf94",
          deep: "#064e3b",
        },
        amber: {
          glow: "#ffb020",
          soft: "#f59e0b",
          deep: "#78350f",
        },
        crimson: {
          glow: "#ff3b5c",
          soft: "#e11d48",
          deep: "#7f1d2e",
        },
        azure: {
          glow: "#33c7ff",
          soft: "#0ea5e9",
        },
      },
      fontFamily: {
        arabic: ["Tajawal", "Cairo", "sans-serif"],
        display: ["Cairo", "Tajawal", "sans-serif"],
      },
      boxShadow: {
        "glow-emerald": "0 0 20px rgba(18, 247, 176, 0.35), 0 0 60px rgba(18, 247, 176, 0.12)",
        "glow-amber": "0 0 20px rgba(255, 176, 32, 0.35), 0 0 60px rgba(255, 176, 32, 0.12)",
        "glow-crimson": "0 0 20px rgba(255, 59, 92, 0.4), 0 0 70px rgba(255, 59, 92, 0.18)",
        "glow-azure": "0 0 20px rgba(51, 199, 255, 0.3), 0 0 60px rgba(51, 199, 255, 0.1)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.45)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 12px rgba(18, 247, 176, 0.5)" },
          "50%": { opacity: "0.65", boxShadow: "0 0 4px rgba(18, 247, 176, 0.2)" },
        },
        "pulse-crimson": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(255, 59, 92, 0.55)" },
          "50%": { boxShadow: "0 0 32px rgba(255, 59, 92, 0.85)" },
        },
        "slide-in-row": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "scan-line": {
          "0%": { transform: "translateY(0%)" },
          "100%": { transform: "translateY(2000%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        "pulse-crimson": "pulse-crimson 1.4s ease-in-out infinite",
        "slide-in-row": "slide-in-row 0.4s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
        "scan-line": "scan-line 6s linear infinite",
      },
      backgroundImage: {
        "grid-glow":
          "linear-gradient(rgba(18, 247, 176, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(18, 247, 176, 0.05) 1px, transparent 1px)",
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        ".glass-panel": {
          "background-color": "rgba(17, 21, 31, 0.6)",
          "backdrop-filter": "blur(18px)",
          "-webkit-backdrop-filter": "blur(18px)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
        },
        ".glass-panel-strong": {
          "background-color": "rgba(13, 16, 25, 0.78)",
          "backdrop-filter": "blur(24px)",
          "-webkit-backdrop-filter": "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        },
      });
    },
  ],
};
