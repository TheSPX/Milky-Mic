// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { clamp, mix, Theme } from '../theme';

/* Ported from the handoff's WakeSlider.tsx (Bencho, MIT — see THIRD_PARTY_NOTICES.md).
   A thumbless range: thin bars, solid up to the value, faint after it. Drag fast and every
   bar the value sweeps past takes energy from the speed, springs up and decays — the wake.
   Each bar holds its own energy; all of it decays at one rate, so the wake IS the falloff.
   Heights are written straight to Animated values from a loop, React renders only on value. */

const H = 20; // a bar at rest
const BAR = 3;

export function WakeSlider({ t, bars = 36, wake = 60, initialValue = 100, onValueChange, label = 'Mic sensitivity' }: {
  t: Theme; bars?: number; wake?: number; initialValue?: number; onValueChange?: (v: number) => void; label?: string;
}) {
  const n = Math.round(clamp(bars, 12, 64));
  const [value, setValue] = useState(() => Math.round(clamp(initialValue, 0, 100)));
  const scales = useRef(Array.from({ length: n }, () => new Animated.Value(1))).current;
  const width = useRef(1);
  const knob = useRef(wake);
  knob.current = clamp(wake, 0, 100);
  const st = useRef({
    energy: new Float32Array(n), down: false, lastX: 0, lastT: 0, speed: 0, raf: 0, origin: 0,
    at: clamp(initialValue, 0, 100) / 100,
  });

  const loop = () => {
    const s = st.current;
    if (s.raf) return;
    let prev = Date.now();
    const run = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      let live = false;
      const fall = Math.exp(-dt * 6.5);
      for (let i = 0; i < n; i++) {
        s.energy[i] *= fall;
        if (s.energy[i] < 0.002) s.energy[i] = 0; else live = true;
        /* up to 2.6 times as tall at the very top of the knob */
        scales[i].setValue(1 + s.energy[i] * 1.6);
      }
      s.raf = live || s.down ? requestAnimationFrame(run) : 0;
    };
    s.raf = requestAnimationFrame(run);
  };

  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  /* move the value to a fraction, waking every bar it passes */
  const to = (f: number, speed: number) => {
    const s = st.current;
    f = clamp(f, 0, 1);
    const from = s.at;
    s.at = f;
    const a = Math.round(from * (n - 1)), b = Math.round(f * (n - 1));
    /* how hard: drag speed through a saturating curve, scaled by the knob */
    const push = Math.min(1, (1 - Math.exp(-speed / 900)) * (knob.current / 60));
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) s.energy[i] = Math.max(s.energy[i], push);
    const next = Math.round(f * 100);
    setValue(next);
    onValueChange?.(next);
    loop();
  };
  const toRef = useRef(to);
  toRef.current = to;

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e, g) => {
      const s = st.current;
      s.down = true;
      s.origin = g.x0 - e.nativeEvent.locationX; // children ignore touches, so locationX is the track's own
      s.lastX = g.x0; s.lastT = Date.now(); s.speed = 0;
      toRef.current((g.x0 - s.origin) / width.current, 0);
    },
    onPanResponderMove: (_e, g) => {
      const s = st.current;
      const now = Date.now();
      const dt = Math.max(0.008, (now - s.lastT) / 1000);
      /* px/s, smoothed so one jittery frame cannot fake a fling */
      s.speed = s.speed * 0.5 + (Math.abs(g.moveX - s.lastX) / dt) * 0.5;
      s.lastX = g.moveX; s.lastT = now;
      toRef.current((g.moveX - s.origin) / width.current, s.speed);
    },
    onPanResponderRelease: () => { st.current.down = false; },
    onPanResponderTerminate: () => { st.current.down = false; },
  }), []);

  const lit = Math.round((value / 100) * (n - 1));
  const off = mix(t.ink, t.bg, 0.32);

  return (
    <View
      style={{ width: '100%', height: H * 2.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      onLayout={e => { width.current = e.nativeEvent.layout.width || 1; }}
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => toRef.current(clamp(value + (e.nativeEvent.actionName === 'increment' ? 10 : -10), 0, 100) / 100, 600)}
    >
      {scales.map((sc, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            width: BAR, height: H, borderRadius: BAR,
            backgroundColor: value > 0 && i <= lit ? t.ink : off,
            transform: [{ scaleY: sc }],
          }}
        />
      ))}
    </View>
  );
}
