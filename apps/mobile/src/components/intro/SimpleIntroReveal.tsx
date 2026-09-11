import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { HeavenMark } from './HeavenMark';
import { INTRO_COLORS } from './colors';

/** Plain reveal shown when the cinematic Rive composition can't play: reduced motion, Expo Go, or a Rive failure. */
export function SimpleIntroReveal({
  reducedMotion,
  onFinish,
}: {
  readonly reducedMotion: boolean;
  readonly onFinish: () => void;
}) {
  const lineOpacity = useRef(new Animated.Value(0)).current;
  const panelScale = useRef(new Animated.Value(0.05)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.94)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordRise = useRef(new Animated.Value(8)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagRise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (reducedMotion) {
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(wordOpacity, { toValue: 1, duration: 220, delay: 40, useNativeDriver: true }),
        Animated.timing(wordRise, {
          toValue: 0,
          duration: 220,
          delay: 40,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tagOpacity, { toValue: 1, duration: 220, delay: 90, useNativeDriver: true }),
        Animated.timing(tagRise, {
          toValue: 0,
          duration: 220,
          delay: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setTimeout(onFinish, 120));
      return;
    }

    Animated.sequence([
      Animated.timing(lineOpacity, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(panelScale, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lineOpacity, { toValue: 0, duration: 250, delay: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 1, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(wordRise, { toValue: 0, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tagOpacity, { toValue: 1, duration: 250, delay: 80, useNativeDriver: true }),
        Animated.timing(tagRise, {
          toValue: 0,
          duration: 250,
          delay: 80,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setTimeout(onFinish, 150));
  }, [reducedMotion]);

  return (
    <View style={styles.center}>
      <Animated.View style={[styles.line, { opacity: lineOpacity }]} />
      <Animated.View style={[styles.panel, { transform: [{ scaleX: panelScale }] }]} />
      <Animated.View style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}>
        <HeavenMark size={72} color={INTRO_COLORS.lightHot} />
      </Animated.View>
      <Animated.Text style={[styles.word, { opacity: wordOpacity, transform: [{ translateY: wordRise }] }]}>
        {'HEAVEN\nHOSPITALITY'}
      </Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: tagOpacity, transform: [{ translateY: tagRise }] }]}>
        Feel at home.
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', width: 2, height: 120, backgroundColor: INTRO_COLORS.lightHot },
  panel: { position: 'absolute', width: 160, height: 4, borderRadius: 2, backgroundColor: INTRO_COLORS.lightMid },
  word: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 26,
    color: INTRO_COLORS.wordmark,
  },
  tagline: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
    color: INTRO_COLORS.tagline,
  },
});
