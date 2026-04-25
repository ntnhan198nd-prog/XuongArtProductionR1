const defaultTheme = require("tailwindcss/defaultTheme");
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        "4xl": "2.5rem",
      },
      colors: {
        accent: {
          50:  "#FDF6E8",
          100: "#FAE8C2",
          200: "#F4D085",
          300: "#EDB748",
          400: "#E8A33D",
          500: "#D98C1F",
          600: "#B0700F",
          700: "#85540B",
          800: "#5A3807",
          900: "#2E1C03",
        },
      },
      fontFamily: {
        sans: ["Samsung Sharp Sans", "Mona Sans", ...defaultTheme.fontFamily.sans],
        display: ["Samsung Sharp Sans", "Mona Sans", ...defaultTheme.fontFamily.sans],
      },
      fontWeight: {
        'medium': '400', // Samsung Medium
        'bold': '700',   // Samsung Bold
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        marquee: "marquee 35s linear infinite",
        "marquee-fast": "marquee 22s linear infinite",
      },
    },
  },
  plugins: [],
};
