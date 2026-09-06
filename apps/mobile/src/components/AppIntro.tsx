import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../theme';

const STAGE_WIDTH = 168;
const STAGE_HEIGHT = 130;

/** Starting offset for each shape, off the edge of the screen. */
const OFFSCREEN = 600;

function degrees(value: Animated.Value) {
  return value.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
}

/** Animates four shapes in from four screen edges to form a house, then reveals the app. */
export function AppIntro({ onFinish }: { readonly onFinish: () => void }) {
  const theme = useTheme();

  const roofXY = useRef(new Animated.ValueXY({ x: -60, y: -OFFSCREEN })).current;
  const roofRotate = useRef(new Animated.Value(-50)).current;

  const bodyXY = useRef(new Animated.ValueXY({ x: -OFFSCREEN, y: 40 })).current;
  const bodyRotate = useRef(new Animated.Value(24)).current;

  const windowXY = useRef(new Animated.ValueXY({ x: OFFSCREEN, y: -30 })).current;
  const windowRotate = useRef(new Animated.Value(-30)).current;

  const doorXY = useRef(new Animated.ValueXY({ x: 24, y: OFFSCREEN })).current;
  const doorRotate = useRef(new Animated.Value(16)).current;

  const pulse = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textRise = useRef(new Animated.Value(14)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const finished = useRef(false);

  function reveal(): void {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 380,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(onFinish);
  }

  useEffect(() => {
    const land = (xy: Animated.ValueXY, rotate: Animated.Value, friction: number, tension: number) =>
      Animated.parallel([
        Animated.spring(xy, { toValue: { x: 0, y: 0 }, friction, tension, useNativeDriver: true }),
        Animated.spring(rotate, { toValue: 0, friction: friction + 1, tension, useNativeDriver: true }),
      ]);

    const assemble = Animated.stagger(150, [
      land(roofXY, roofRotate, 5, 38),
      land(bodyXY, bodyRotate, 6, 32),
      land(windowXY, windowRotate, 5, 44),
      land(doorXY, doorRotate, 7, 30),
    ]);

    assemble.start(({ finished: allLanded }) => {
      if (!allLanded || finished.current) return;

      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(pulse, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }),
      ]).start(() => {
        if (finished.current) return;
        Animated.parallel([
          Animated.timing(textOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(textRise, {
            toValue: 0,
            duration: 380,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (finished.current) return;
          setTimeout(reveal, 650);
        });
      });
    });
  }, []);

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: theme.canvas, opacity: overlayOpacity }]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={reveal} accessibilityLabel="Skip intro" />

      <Animated.View style={[styles.stage, { transform: [{ scale: pulse }] }]}>
        <Animated.View
          style={[
            styles.roof,
            { borderBottomColor: theme.primary },
            { transform: [...roofXY.getTranslateTransform(), { rotate: degrees(roofRotate) }] },
          ]}
        />
        <Animated.View
          style={[
            styles.body,
            { backgroundColor: theme.primary },
            { transform: [...bodyXY.getTranslateTransform(), { rotate: degrees(bodyRotate) }] },
          ]}
        />
        <Animated.View
          style={[
            styles.window,
            { backgroundColor: theme.canvas },
            { transform: [...windowXY.getTranslateTransform(), { rotate: degrees(windowRotate) }] },
          ]}
        />
        <Animated.View
          style={[
            styles.door,
            { backgroundColor: theme.canvas },
            { transform: [...doorXY.getTranslateTransform(), { rotate: degrees(doorRotate) }] },
          ]}
        />
      </Animated.View>

      <Animated.Text
        style={[
          styles.title,
          { color: theme.textPrimary, opacity: textOpacity, transform: [{ translateY: textRise }] },
        ]}
      >
        Heaven Hospitality
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
  },
  roof: {
    position: 'absolute',
    top: 0,
    left: 36,
    width: 0,
    height: 0,
    borderLeftWidth: 48,
    borderRightWidth: 48,
    borderBottomWidth: 50,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  body: {
    position: 'absolute',
    top: 50,
    left: 36,
    width: 96,
    height: 80,
    borderRadius: 6,
  },
  window: {
    position: 'absolute',
    top: 66,
    left: 50,
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  door: {
    position: 'absolute',
    top: 96,
    left: 72,
    width: 24,
    height: 34,
    borderRadius: 3,
  },
  title: {
    marginTop: 28,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
