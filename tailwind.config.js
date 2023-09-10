/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  daisyui: {
    themes: [
      {
        light: {
          primary: "#fcf7ae",
          secondary: "#fcaef7",
          "base-100": "#fff",
        },
        dark: {
          primary: "#fcf7ae",
          secondary: "#fcaef7",
          "base-100": "#222",
        },
      },
    ],
  },
  // eslint-disable-next-line no-undef
  plugins: [require("daisyui")],
};
