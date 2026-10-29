import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/*
  One palette, two themes.
  Every colour used in the app (slate, emerald, rose, ...) is bound to a CSS variable,
  and the variables are swapped when <html data-theme="light"> is set.
  Dark  = the normal Tailwind scale (neutrals use zinc for a calmer, less "blue" look).
  Light = the scale mirrored (950 <-> 50 ...), with 500-700 kept as-is for solid buttons.
*/
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const KEEP_IN_LIGHT = [500, 600, 700];
const NEUTRAL = ['slate', 'zinc'];

const base = {
  slate: colors.zinc, zinc: colors.zinc,
  indigo: colors.blue, blue: colors.blue,          // single accent: blue
  emerald: colors.emerald, rose: colors.rose, amber: colors.amber,
  cyan: colors.cyan, red: colors.red, orange: colors.orange,
  purple: colors.purple, pink: colors.pink,
};

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; };
const mirror = (s) => (s === 50 ? 950 : s === 950 ? 50 : 1000 - s);
const lightShade = (fam, s) => {
  if (NEUTRAL.includes(fam)) {
    if (s === 900) return '#ffffff';
    if (s === 950) return '#fafafa';
    return base[fam][mirror(s)];
  }
  return KEEP_IN_LIGHT.includes(s) ? base[fam][s] : base[fam][mirror(s)];
};

const palette = Object.fromEntries(
  Object.keys(base).map((fam) => [fam, Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--c-${fam}-${s}) / <alpha-value>)`]))])
);
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ...palette,
        canvas: token('canvas'), surface: token('surface'), subtle: token('subtle'), line: token('line'),
        ink: token('ink'), body: token('body'), muted: token('muted'),
        accent: token('accent'), 'accent-hover': token('accent-hover'), link: token('link'),
      },
      borderColor: { DEFAULT: token('line') },
      // flatter, tighter corners and quieter shadows = more "product", less "template"
      borderRadius: { lg: '0.375rem', xl: '0.5rem', '2xl': '0.625rem', '3xl': '0.75rem' },
      boxShadow: {
        sm: '0 1px 2px rgb(0 0 0 / 0.04)',
        DEFAULT: '0 1px 2px rgb(0 0 0 / 0.06)',
        md: '0 1px 3px rgb(0 0 0 / 0.08)',
        lg: '0 2px 6px rgb(0 0 0 / 0.08)',
        xl: '0 4px 12px rgb(0 0 0 / 0.08)',
        '2xl': '0 12px 32px rgb(0 0 0 / 0.16)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const dark = {}; const light = {};
      for (const fam of Object.keys(base)) {
        for (const s of SHADES) {
          dark[`--c-${fam}-${s}`] = rgb(base[fam][s]);
          light[`--c-${fam}-${s}`] = rgb(lightShade(fam, s));
        }
      }
      addBase({ ':root': dark, "html[data-theme='light']": light });
    }),
  ],
};