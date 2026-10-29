// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { FILTERS, MagneticSelect } from './MagneticSelect';
import { FONT_BOLD, FONT_BRAND, FONT_UI, Theme } from '../theme';

/* Ported from the handoff's FilterOverlay.tsx: a trigger and a bottom sheet.
   Opening settings never touches the microphone; the trigger is a sibling control. */
export function FilterOverlay({ t, style }: { t: Theme; style?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const sheet = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) { sheet.setValue(0); Animated.timing(sheet, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Voice filters"
        accessibilityState={{ expanded: open }}
        style={[{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }, style]}
      >
        <Svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke={t.ink} strokeWidth={1.7} strokeLinecap="round">
          <Path d="M4 6h16M4 12h16M4 18h16" />
          <Circle cx={9} cy={6} r={2} fill={t.bg} />
          <Circle cx={15} cy={12} r={2} fill={t.bg} />
          <Circle cx={10} cy={18} r={2} fill={t.bg} />
        </Svg>
        {selected > 0 && <View style={{ position: 'absolute', right: 5, top: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: t.active }} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,12,9,0.5)' }}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close voice filters" />
          <Animated.View
            style={{
              alignSelf: 'center', width: '100%', maxWidth: 430, backgroundColor: t.bg,
              paddingTop: 12, paddingHorizontal: 24, paddingBottom: 32,
              borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: t.line,
              opacity: sheet,
              transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [35, 0] }) }],
            }}
          >
            <View style={{ width: 32, height: 4, borderRadius: 4, alignSelf: 'center', marginBottom: 22, backgroundColor: t.line }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: t.muted, fontFamily: FONT_UI, fontSize: 10, letterSpacing: 1.5, marginBottom: 6 }}>FIND YOUR FLAVOR</Text>
                <Text style={{ color: t.ink, fontFamily: FONT_BRAND, fontSize: 28 }}>Voice filters</Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close voice filters"
                style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: t.ink, fontFamily: FONT_UI, fontSize: 26, lineHeight: 30 }}>×</Text>
              </Pressable>
            </View>
            <Text style={{ color: t.muted, fontFamily: FONT_UI, fontSize: 13, marginTop: 12 }}>Tap a preset. Make it yours.</Text>

            <View style={{ marginTop: 22, marginBottom: 16 }}>
              <MagneticSelect t={t} value={selected} onChange={setSelected} />
            </View>

            <View style={{ alignItems: 'center', minHeight: 64 }} accessibilityLiveRegion="polite">
              <Text style={{ color: t.ink, fontFamily: FONT_BRAND, fontSize: 23, marginBottom: 8 }}>{FILTERS[selected].name}</Text>
              <Text style={{ color: t.muted, fontFamily: FONT_UI, fontSize: 13, textAlign: 'center' }}>{FILTERS[selected].description}</Text>
            </View>
            <Text style={{ color: t.muted, fontFamily: FONT_UI, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 20, marginBottom: 16 }}>
              Preview presets only. Audio effects aren’t applied yet.
            </Text>
            <Pressable onPress={close} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 16, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.bg, fontFamily: FONT_BOLD, fontSize: 14 }}>Done</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
