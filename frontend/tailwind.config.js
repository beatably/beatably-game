/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'chewy': ['Chewy', 'system-ui'],
        'encode-sans': ['Encode Sans', 'sans-serif'],
        'sans': ['Encode Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
