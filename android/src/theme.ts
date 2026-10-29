// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
// Tokens from the design handoff (DESIGN-SPEC.md).
export const THEMES = {
  white: { name: 'White Milky', bg: '#FFFDF7', ink: '#282620', muted: '#817E72', line: '#E8E5DB', panel: '#F5F2E9', edge: '#C5AD7E', active: '#648047' },
  chocolate: { name: 'Chocolate Milk', bg: '#241913', ink: '#F6EADD', muted: '#B7A393', line: '#49372C', panel: '#32231B', edge: '#E1B88C', active: '#C8D69F' },
};
export type Theme = typeof THEMES.white;
export type ThemeKey = keyof typeof THEMES;

export const FONT_BRAND = 'Fredoka_500Medium';
export const FONT_UI = 'Nunito_600SemiBold';
export const FONT_BOLD = 'Nunito_800ExtraBold';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* the web design's color-mix(in srgb, a p%, b): opaque, so shapes stay solid */
export function mix(a: string, b: string, p: number) {
  const n = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return '#' + x.map((c, i) => Math.round(c * p + y[i] * (1 - p)).toString(16).padStart(2, '0')).join('');
}
