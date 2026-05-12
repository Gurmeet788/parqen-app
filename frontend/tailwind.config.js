module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '360px',   // Small phones (360px+) — use xs:classname
        '3xl': '1600px', // Very wide desktops
      },
      colors: {
        'slate': {
          900: '#0f172a',
          800: '#1e293b',
        },
        'blue': {
          600: '#1e40af',
          700: '#1d3a8a',
        },
        'amber': {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      spacing: {
        'nav': '60px',    // BottomNav height
        'navbar': '64px', // Top Navbar height
      },
      minHeight: {
        'screen-nav': 'calc(100vh - 64px)', // Below top navbar
      },
    },
  },
  plugins: [],
}
