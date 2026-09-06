import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../theme';

const BADGE_SIZE = 112;

/** Badge pops in, the wordmark rises in under it, then the whole thing fades to reveal the app. */
export function AppIntro({ onFinish }: { readonly onFinish: () => void }) {
  const theme = useTheme();

  const badgeScale = useRef(new Animated.Value(0.4)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
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
    const safetyNet = setTimeout(reveal, 5000);

    Animated.parallel([
      Animated.timing(badgeOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
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
        setTimeout(reveal, 700);
      });
    });

    return () => clearTimeout(safetyNet);
  }, []);

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: theme.canvas, opacity: overlayOpacity }]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={reveal} accessibilityLabel="Skip intro" />

      <Animated.View
        style={[
          styles.badge,
          {
            backgroundColor: theme.primary,
            opacity: badgeOpacity,
            transform: [{ scale: badgeScale }],
          },
        ]}
      >
        <Ionicons name="home" size={54} color={theme.textInverse} />
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
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
