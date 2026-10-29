// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { clamp, mix, Theme } from '../theme';

/* Ported from the handoff's LiquidToggle.tsx (Bencho, MIT — see THIRD_PARTY_NOTICES.md).
   One droplet on a pill. It lengthens into its own travel (area kept: scaleY = 1/scaleX),
   settles on a gentle spring (170/21.5, zeta ~0.87), and can be dragged — it flips as it
   passes the middle so the track answers under the finger. A press that never travels is a tap.
   Dropped: the hover swell (no hover on a phone). Drawn at 92x46 and scaled .75 like the design. */

const TRACK = 92;
const THUMB = 36;
const PAD = (46 - THUMB) / 2;
const SHUT_X = PAD;
const OPEN_X = TRACK - THUMB - PAD;
const MID_X = (SHUT_X + OPEN_X) / 2;
const SCALE = 0.75;

/* the web design eases colours over 420ms; this does the same by hand */
function useColor(target: string, ms = 420) {
  const [c, setC] = useState(target);
  const cur = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    const from = cur.current, t0 = Date.now();
    cancelAnimationFrame(raf.current);
    const run = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      cur.current = mix(target, from, k);
      setC(cur.current);
      if (k < 1) raf.current = requestAnimationFrame(run);
    };
    run();
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return c;
}

export function LiquidToggle({ t, stretch = 36, speed = 50, initialOn = false, onChange }: {
  t: Theme; stretch?: number; speed?: number; initialOn?: boolean; onChange?: (on: boolean) => void;
}) {
  const [on, setOn] = useState(initialOn);
  const [held, setHeld] = useState(false);
  const x = useRef(new Animated.Value(initialOn ? OPEN_X : SHUT_X)).current;
  const sx = useRef(new Animated.Value(1)).current;
  const sy = useRef(new Animated.Value(1)).current;
  const live = useRef({ x: initialOn ? OPEN_X : SHUT_X, eased: 0, raf: 0 });
  const grip = useRef<{ start: number; moved: boolean } | null>(null);
  const onRef = useRef(on);
  onRef.current = on;

  /* the droplet's stretch follows its speed: a low-pass of velocity, written every frame */
  useEffect(() => {
    const l = live.current;
    let prev = Date.now();
    const id = x.addListener(({ value }) => { l.x = value; });
    let last = l.x;
    const run = () => {
      const now = Date.now(), dt = Math.max(0.001, (now - prev) / 1000);
      prev = now;
      const v = (l.x - last) / dt;
      last = l.x;
      l.eased += (v - l.eased) * (1 - Math.exp(-dt * 14));
      const len = 1 + Math.min(0.4, Math.abs(l.eased) / 600) * (clamp(stretch, 0, 100) / 100);
      sx.setValue(len);
      sy.setValue(1 / len);
      l.raf = requestAnimationFrame(run);
    };
    l.raf = requestAnimationFrame(run);
    return () => { cancelAnimationFrame(l.raf); x.removeListener(id); };
  }, [stretch]);

  const settle = useMemo(() => ({
    stiffness: 170 - (50 - clamp(speed, 0, 100)) * 1.1, damping: 21.5, mass: 0.9,
  }), [speed]);

  /* rest is wherever `on` says, applied only while nothing holds the thumb; grabbing it
     mid-flight stops the spring and leaves the value where it had got to */
  useEffect(() => {
    if (held) return;
    const run = Animated.spring(x, { toValue: on ? OPEN_X : SHUT_X, ...settle, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [on, held, settle]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (!initialOn) return; }
    onChange?.(on);
  }, [on]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      /* the offset comes from where the droplet IS, so no press can make it jump */
      grip.current = { start: live.current.x, moved: false };
      setHeld(true);
    },
    onPanResponderMove: (_e, g) => {
      const gr = grip.current;
      if (!gr) return;
      if (Math.abs(g.dx) > 2) gr.moved = true;
      if (!gr.moved) return;
      const next = clamp(gr.start + g.dx / SCALE, SHUT_X, OPEN_X);
      x.setValue(next);
      const past = next > MID_X;
      if (past !== onRef.current) setOn(past);
    },
    onPanResponderRelease: () => {
      const gr = grip.current;
      grip.current = null;
      if (gr && !gr.moved) setOn(v => !v); // a press that never travelled is a tap
      setHeld(false);
    },
    onPanResponderTerminate: () => { grip.current = null; setHeld(false); },
  }), []);

  const track = useColor(on ? t.ink : t.bg);
  const thumb = useColor(on ? t.bg : mix(t.ink, t.bg, 0.19));

  return (
    <View
      style={{ width: 69, height: 44 }}
      hitSlop={{ top: 7, bottom: 7, left: 8, right: 8 }}
      {...pan.panHandlers}
      accessible
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Chocolate Milk theme"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => setOn(v => !v)}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', right: 0, top: -1, width: TRACK, height: 46, borderRadius: 999,
          backgroundColor: track, transform: [{ scale: SCALE }], transformOrigin: 'right center',
        }}
      >
        {/* stroke on: a 1px hairline outside the pill, the design's spread shadow */}
        <View style={{ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: 999, borderWidth: 1, borderColor: t.line }} />
        <Animated.View
          style={{
            position: 'absolute', left: 0, top: 5, width: THUMB, height: THUMB, borderRadius: 999, backgroundColor: thumb,
            transform: [{ translateX: x }, { scaleX: sx }, { scaleY: sy }],
          }}
        />
      </View>
    </View>
  );
}
