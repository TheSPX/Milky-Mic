// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
import { useState, useRef, useEffect } from 'react';
import {
  Animated, Platform, Pressable, StyleSheet, Text, TextInput, View, FlatList,
  StatusBar as RNStatusBar, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Fredoka_500Medium } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { THEMES, ThemeKey, Theme, FONT_BRAND, FONT_UI } from './src/theme';
import { LiquidToggle } from './src/components/LiquidToggle';
import { WakeSlider } from './src/components/WakeSlider';
import { FilterOverlay } from './src/components/FilterOverlay';

// Demo mode (EXPO_PUBLIC_MOCK=1): Connect only opens the home screen, no network and no microphone.
// In demo mode src/stream.ts (the native modules) is never loaded, so Expo Go can run the design.
const MOCK = process.env.EXPO_PUBLIC_MOCK === '1';

type Pc = { name: string; ip: string };
const mockStreamer = {
  discover: (onPc: (pc: Pc) => void, _s?: (s: string) => void) => onPc({ name: 'Demo PC', ip: '192.168.1.20' }),
  start: async (_ip: string, _code: string, _s: (s: string) => void, _l: (l: 'live' | 'reconnecting') => void, _c: () => void) => true,
  stop: async (_s?: (s: string) => void) => {},
};
// a constant, so the same hook runs on every render
const useStreamer: () => typeof mockStreamer = MOCK ? () => mockStreamer : require('./src/stream').useStreamer;

const CARTON = {
  white: { closed: require('./assets/carton.png'), open: require('./assets/carton-open.png') },
  chocolate: { closed: require('./assets/chocolate-closed.png'), open: require('./assets/chocolate-open.png') },
};

function Waveform({ t, active, level }: { t: Theme; active: boolean; level: number }) {
  const [bars, setBars] = useState<number[]>(() => Array(45).fill(0));
  useEffect(() => {
    if (!active) { setBars(Array(45).fill(0)); return; }
    const id = setInterval(() => setBars(b => [...b.slice(1), Math.random()]), 90);
    return () => clearInterval(id);
  }, [active]);
  return (
    <View style={s.wave} accessibilityRole="image" accessibilityLabel={active ? 'Microphone active' : 'Microphone inactive'}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{ width: 4, borderRadius: 8, backgroundColor: active ? t.ink : t.line, height: active ? Math.max(5, 48 * h * (level / 100)) : 5 }}
        />
      ))}
    </View>
  );
}

/* the open carton settles in over 420ms; the closed one fades and flattens (the design's CSS) */
function Carton({ themeKey, active, size }: { themeKey: ThemeKey; active: boolean; size: number }) {
  const fade = useRef(new Animated.Value(active ? 1 : 0)).current;
  const settle = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: active ? 1 : 0, duration: 280, useNativeDriver: true }).start();
    Animated.timing(settle, { toValue: active ? 1 : 0, duration: 420, useNativeDriver: true }).start();
  }, [active]);
  const art = CARTON[themeKey];
  const base = { position: 'absolute' as const, width: size, height: size, transformOrigin: ['50%', '65%', 0] as any };
  return (
    <View style={{ width: size, height: size }}>
      <Animated.Image
        source={art.closed}
        resizeMode="contain"
        accessibilityLabel="Milky Mic carton"
        style={[base, {
          opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ scaleY: settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }],
        }]}
      />
      <Animated.Image
        source={art.open}
        resizeMode="contain"
        style={[base, {
          opacity: fade,
          transform: [
            { perspective: 600 },
            { scaleY: settle.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
            { rotateX: settle.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
          ],
        }]}
      />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Nunito_600SemiBold, Nunito_800ExtraBold });
  const [themeKey, setThemeKey] = useState<ThemeKey>('white');
  const t = THEMES[themeKey];
  const { width, height } = useWindowDimensions();
  const short = height <= 700;

  const [screen, setScreen] = useState<'connect' | 'home'>('connect');
  const [pcs, setPcs] = useState<Pc[]>([]);
  const [manualIp, setManualIp] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('Searching for PCs…');
  const [host, setHost] = useState('');
  const [mockActive, setMockActive] = useState(false);
  const [level, setLevel] = useState(100);
  const [code, setCode] = useState('');
  const [link, setLink] = useState<'live' | 'reconnecting'>('live');
  const [loaded, setLoaded] = useState(false);
  const streamer = useStreamer();

  // remember the last PC, its pairing code and the theme
  const save = (patch: object) =>
    AsyncStorage.getItem('milkymic')
      .then(raw => AsyncStorage.setItem('milkymic', JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), ...patch })))
      .catch(() => {});
  useEffect(() => {
    AsyncStorage.getItem('milkymic')
      .then(raw => {
        const v = raw ? JSON.parse(raw) : {};
        if (v.ip) setManualIp(v.ip);
        if (/^\d{6}$/.test(v.code)) setCode(v.code);
        if (v.theme === 'chocolate') setThemeKey('chocolate');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => { if (loaded) save({ theme: themeKey }); }, [themeKey, loaded]);

  const active = MOCK ? mockActive : streaming;

  function discover() {
    setPcs([]);
    setStatus('Searching for PCs…');
    streamer.discover(
      pc => setPcs(list => (list.some(p => p.ip === pc.ip) ? list : [...list, pc])),
      setStatus,
    );
  }

  async function start(ip: string) {
    if (!MOCK && !/^\d{6}$/.test(code)) { setStatus('Enter the 6-digit pairing code shown on the PC page'); return; }
    setHost(ip);
    setLink('live');
    const ok = await streamer.start(ip, code, setStatus, setLink, () => { setStreaming(false); setScreen('connect'); });
    if (!ok) return;
    save({ ip, code });
    if (!MOCK) setStreaming(true);
    setScreen('home');
  }

  async function stop() {
    await streamer.stop(setStatus);
    setStreaming(false);
    setScreen('connect');
  }

  // carton: mock toggles the waveform, real mode stops the stream
  const onCarton = () => (MOCK ? setMockActive(a => !a) : stop());

  if (!fontsLoaded || !loaded) return null;

  const dark = themeKey === 'chocolate';
  // keyed by screen so it remounts with the current theme as its starting state
  const toggle = <LiquidToggle key={screen} t={t} initialOn={dark} onChange={on => setThemeKey(on ? 'chocolate' : 'white')} />;
  // iOS has no currentHeight; 54 clears the notch / Dynamic Island
  const top = (Platform.OS === 'ios' ? 54 : RNStatusBar.currentHeight ?? 0) + 20;

  if (screen === 'connect') {
    return (
      <View style={[s.screen, { backgroundColor: t.bg, paddingTop: top }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={[s.top, { borderColor: t.line }]}>
          <View style={s.headRow}>
            <View>
              <Text style={[s.brand, { color: t.ink }]}>milky mic</Text>
              <Text style={[s.test, { color: t.muted }]}>YOUR PHONE. YOUR MIC.</Text>
            </View>
            {toggle}
          </View>
          <Text style={[s.status, { color: t.muted, marginTop: 20 }]}>{status}</Text>
        </View>

        <Pressable style={[s.pill, { backgroundColor: t.ink }]} onPress={discover}>
          <Text style={[s.pillText, { color: t.bg }]}>Find PCs</Text>
        </Pressable>
        <FlatList
          style={{ flexGrow: 0, marginTop: 12 }}
          data={pcs}
          keyExtractor={p => p.ip}
          renderItem={({ item }) => (
            <Pressable style={[s.row, { backgroundColor: t.panel, borderColor: t.line }]} onPress={() => start(item.ip)}>
              <Text style={[s.rowName, { color: t.ink }]}>{item.name}</Text>
              <Text style={[s.rowIp, { color: t.muted }]}>{item.ip}</Text>
            </Pressable>
          )}
        />
        <View style={{ marginTop: 'auto', gap: 8, paddingBottom: 12 }}>
          <TextInput
            style={[s.input, s.code, { color: t.ink, borderColor: t.line, backgroundColor: t.panel }]}
            placeholder="Pairing code (6 digits)"
            placeholderTextColor={t.muted}
            value={code}
            onChangeText={v => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            accessibilityLabel="Pairing code shown on the PC page"
          />
          <TextInput
            style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.panel }]}
            placeholder="PC IP, e.g. 192.168.1.20"
            placeholderTextColor={t.muted}
            value={manualIp}
            onChangeText={setManualIp}
            keyboardType="numeric"
          />
          <Pressable style={[s.pill, { backgroundColor: t.ink, opacity: manualIp.trim() ? 1 : 0.4 }]} onPress={() => start(manualIp.trim())} disabled={!manualIp.trim()}>
            <Text style={[s.pillText, { color: t.bg }]}>Connect</Text>
          </Pressable>
        </View>
        <Text style={[s.credit, { color: t.muted }]}>Made by TheSPX · open source · MIT</Text>
      </View>
    );
  }

  const reconnecting = active && link === 'reconnecting';
  const live = active && !reconnecting;
  const box = short ? 166 : Math.min(232, Math.max(180, width * 0.55));

  return (
    <View style={[s.screen, { backgroundColor: t.bg, paddingTop: top }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={[s.top, { borderColor: t.line }]}>
        <View style={s.headRow}>
          <View>
            <Text style={[s.brand, { color: t.ink }]}>milky mic</Text>
            <Text style={[s.test, { color: t.muted }]}>MINIMAL / TEST VERSION</Text>
          </View>
          {toggle}
        </View>
        <View style={s.connection}>
          <View style={{ padding: 4, borderRadius: 10, backgroundColor: live ? t.active + '1F' : 'transparent' }}>
            <View style={[s.dot, { backgroundColor: live ? t.active : t.muted }]} />
          </View>
          <Text style={[s.status, { color: t.muted }]}>
            {active ? (reconnecting ? 'Reconnecting to the PC…' : 'Mic active on this device') : 'Mic not connected'}
          </Text>
          <Text style={[s.flavor, { color: t.muted }]}>{t.name}</Text>
        </View>
      </View>

      <View style={[s.main, short && { paddingTop: 18, paddingBottom: 22 }]}>
        <View style={{ width: box, height: box }}>
          <Pressable
            onPress={onCarton}
            accessibilityRole="button"
            accessibilityLabel={active ? 'Turn off microphone' : 'Turn on microphone'}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({ width: box, height: box, transform: [{ scale: pressed ? 0.96 : 1 }] })}
          >
            <Carton themeKey={themeKey} active={active} size={box} />
          </Pressable>
          <FilterOverlay t={t} style={{ position: 'absolute', right: 7, bottom: 5 }} />
        </View>

        <Text style={[s.headline, { color: t.ink }, short && { fontSize: 26, marginTop: 18, marginBottom: 8 }]}>
          {active ? 'Fresh sound. You’re on.' : 'Open to Speak'}
        </Text>
        <Text style={[s.hint, { color: t.muted }, short && { fontSize: 13 }]}>
          {active ? (reconnecting ? 'Trying to reach your PC again. The mic keeps listening.' : 'Tap the carton again to turn off.') : 'Your carton is your mic. Tap it to turn on.'}
        </Text>

        <Waveform t={t} active={active} level={level} />
        <View style={{ width: '100%', marginTop: 8, paddingVertical: 8 }}>
          <WakeSlider t={t} initialValue={100} onValueChange={setLevel} />
        </View>
      </View>

      <Pressable onPress={() => (MOCK ? setScreen('connect') : stop())} style={{ alignSelf: 'center', padding: 12, marginBottom: 12 }}>
        <Text style={{ color: t.muted, fontFamily: FONT_UI, fontSize: 13 }}>Change PC · {host || '—'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  top: { borderBottomWidth: 1, paddingBottom: 18 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: FONT_BRAND, fontSize: 29, letterSpacing: -0.5 },
  test: { fontFamily: FONT_UI, fontSize: 10, letterSpacing: 1.3, marginTop: 7 },
  connection: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontFamily: FONT_UI, fontSize: 13 },
  flavor: { fontFamily: FONT_UI, fontSize: 12, marginLeft: 'auto' },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 24, paddingBottom: 32 },
  headline: { fontFamily: FONT_BRAND, fontSize: 29, lineHeight: 35, letterSpacing: -0.25, marginTop: 24, marginBottom: 10, textAlign: 'center', alignSelf: 'stretch' },
  hint: { fontFamily: FONT_UI, fontSize: 14, lineHeight: 22, textAlign: 'center', paddingHorizontal: 8 },
  wave: { height: 54, marginTop: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  credit: { fontFamily: FONT_UI, fontSize: 12, textAlign: 'center', marginBottom: 12 },
  pill: { borderRadius: 999, padding: 14, alignItems: 'center', marginTop: 12 },
  pillText: { fontFamily: FONT_UI, fontSize: 16 },
  row: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 8 },
  rowName: { fontFamily: FONT_UI, fontSize: 16 },
  rowIp: { fontFamily: FONT_UI, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 16, padding: 12, fontFamily: FONT_UI },
  code: { letterSpacing: 4 },
});
