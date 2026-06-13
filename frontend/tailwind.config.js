/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f6",
          100: "#d7ece9",
          200: "#afd9d4",
          300: "#80bdb6",
          400: "#529c96",
          500: "#347f7b",
          600: "#256763",
          700: "#20524f",
          800: "#1d4442",
          900: "#1a3938",
          950: "#0b2525",
        },
        ink: {
          50: "#f8faf9",
          100: "#eef2f1",
          200: "#d9e0de",
          300: "#b9c5c2",
          400: "#8fa09c",
          500: "#6f817d",
          600: "#596965",
          700: "#475552",
          800: "#303b39",
          900: "#1e2826",
          950: "#111816",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
