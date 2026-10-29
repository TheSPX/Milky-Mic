// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { clamp, Theme } from '../theme';

/* Ported from the handoff's MagneticSelect.tsx (Framer Motion -> RN Animated).
   Same lattice, same field arithmetic, same spring tuning.
   Dropped: the pointer "lean" — it only runs where hover exists, and a phone has none. */

export const FILTERS = [
  { name: 'Original', description: 'Your natural voice, unchanged.', color: '#ddd1ba', path: 'M8 12h8m-4-4v8' },
  { name: 'Warm', description: 'A gentle, warm voice preset.', color: '#d4a075', path: 'M9 16c-5-5 5-4 1-9m4 10c-4-4 5-4 1-10' },
  { name: 'Bright', description: 'A brighter, more present voice preset.', color: '#ebd68e', path: 'M12 7v-2m0 14v-2M7 12H5m14 0h-2M8 8 6 6m12 12-2-2m0-8 2-2M6 18l2-2M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0' },
  { name: 'Radio', description: 'A compact radio-style voice preset.', color: '#b6c2bb', path: 'M6 8h12v10H6zM7 8l9-3M9 12h1m4 0h2m-2 3h2' },
  { name: 'Deep', description: 'A lower, fuller voice preset.', color: '#b3a3b7', path: 'M7 8v8m5-11v14m5-11v8' },
  { name: 'Clear', description: 'A clean, speech-focused voice preset.', color: '#a8c6ca', path: 'm7 12 3 3 7-7M5 5h14v14H5z' },
  { name: 'Soft', description: 'A softer, gentler voice preset.', color: '#d6b2b5', path: 'M6 13c2-8 4 6 6-2s4 7 6-1' },
];

function Mark({ i, size }: { i: number; size: number }) {
  const f = FILTERS[i];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect width={24} height={24} rx={12} fill={f.color} />
      <Path d={f.path} fill="none" stroke="#392b22" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const CHIP = 44, H_PAD = 26;
/* a hex lattice; the first point is the centre */
const PTS: [number, number][] = [[0, 0], [45, 0], [22.5, -39], [-22.5, -39], [-45, 0], [-22.5, 39], [22.5, 39]];
const PITCH = 45;
const SPREAD = 2.8;

export function MagneticSelect({ t, pull = 55, bounce = 55, value = 0, onChange }: {
  t: Theme; pull?: number; bounce?: number; value?: number; onChange?: (i: number) => void;
}) {
  const n = PTS.length;
  const p = clamp(pull, 0, 100) / 100;
  const at = clamp(value, 0, n - 1);
  const grow = 1.16 + 0.22 * p, room = (CHIP * (grow - 1)) / 2, aura = 3 + 9 * p, tilt = 5 * p, cower = 0.04 + 0.09 * p;
  const zeta = 0.9 - (0.48 * clamp(bounce, 0, 100)) / 100;
  const swing = (k: number, mass: number) => ({ stiffness: k, damping: 2 * Math.sqrt(k * mass) * zeta, mass });

  const xs = PTS.map(q => q[0]), ys = PTS.map(q => q[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const W = Math.max(...xs) - minX + CHIP + H_PAD * 2;
  const H = Math.max(...ys) - minY + CHIP + H_PAD * 2;

  /* the field, worked out once per selection */
  const field = (sel: number) => PTS.map(([px, py], i) => {
    const [ax, ay] = PTS[sel], dx = px - ax, dy = py - ay, gap = Math.hypot(dx, dy), far = gap / PITCH;
    const fall = i === sel ? 0 : Math.exp(-(far - 1) / SPREAD);
    /* the push does not decay: chips on one bearing move the same amount */
    const push = i === sel ? 0 : room + aura, ux = gap ? dx / gap : 0, uy = gap ? dy / gap : 0;
    const on = i === sel;
    return { far, x: ux * push, y: uy * push, s: on ? grow : 1 - cower * fall, r: ux * tilt * fall };
  });

  const vals = useRef(
    field(at).map(f => ({
      x: new Animated.Value(f.x), y: new Animated.Value(f.y),
      sx: new Animated.Value(f.s), sy: new Animated.Value(f.s), r: new Animated.Value(f.r),
    })),
  ).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; } // nothing animates on mount
    const anims = field(at).flatMap((f, i) => {
      const k = 300 + 280 * (1 - Math.min(f.far, 3) / 4), delay = f.far * 22;
      const go = (v: Animated.Value, to: number, k2: number, m: number) =>
        Animated.spring(v, { toValue: to, ...swing(k2, m), delay, useNativeDriver: true });
      const v = vals[i];
      return [go(v.x, f.x, k, 0.9), go(v.y, f.y, k, 0.9), go(v.sx, f.s, k * 1.24, 0.8), go(v.sy, f.s, k * 0.86, 0.95), go(v.r, f.r, k * 0.8, 1)];
    });
    Animated.parallel(anims).start();
  }, [at]);

  return (
    <View style={{ width: W, height: H, alignSelf: 'center' }} accessibilityRole="radiogroup" accessibilityLabel="Voice filter presets">
      {PTS.map(([px, py], i) => {
        const on = i === at, v = vals[i];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: px - minX + H_PAD, top: py - minY + H_PAD, width: CHIP, height: CHIP,
              zIndex: on ? 2 : 1,
              transform: [
                { translateX: v.x }, { translateY: v.y }, { scaleX: v.sx }, { scaleY: v.sy },
                { rotate: v.r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] }) },
              ],
            }}
          >
            {on && (
              <>
                <View pointerEvents="none" style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 999, borderWidth: 2, borderColor: t.ink }} />
                <View pointerEvents="none" style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: 999, borderWidth: 2, borderColor: t.bg }} />
              </>
            )}
            <Pressable
              onPress={() => onChange?.(i)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={FILTERS[i].name}
              style={{ width: CHIP, height: CHIP, borderRadius: CHIP / 2, overflow: 'hidden' }}
            >
              <Mark i={i} size={CHIP} />
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
