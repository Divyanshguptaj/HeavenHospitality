import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Pressable, StyleSheet } from 'react-native';

import { INTRO_COLORS } from './colors';
import { DoorwayReveal } from './DoorwayReveal';
import { RiveIntroScene } from './RiveIntroScene';

const SAFETY_TIMEOUT_MS = 4000;

/** The app's opening identity, shown once per cold start over whatever the navigator renders underneath. */
export function AppIntro({
  onFinish,
  backgroundTarget,
}: {
  readonly onFinish: () => void;
  readonly backgroundTarget: string;
}) {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [riveFailed, setRiveFailed] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const dissolve = useRef(new Animated.Value(0)).current;
  const finished = useRef(false);

  function finish(): void {
    if (finished.current) return;
    finished.current = true;
    Animated.parallel([
      Animated.timing(dissolve, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 400,
        delay: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished: done }) => {
      if (done) onFinish();
    });
  }

  useEffect(() => {
    const safetyNet = setTimeout(finish, SAFETY_TIMEOUT_MS);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReducedMotion)
      .catch(() => setReducedMotion(false));
    return () => clearTimeout(safetyNet);
  }, []);

  // Dismisses any keyboard that opens while the intro is on screen.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => Keyboard.dismiss());
    return () => subscription.remove();
  }, []);

  const backgroundColor = dissolve.interpolate({
    inputRange: [0, 1],
    outputRange: [INTRO_COLORS.background, backgroundTarget],
  });

  if (reducedMotion === null) {
    return <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor }]} />;
  }

  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const useDoorwayReveal = reducedMotion || isExpoGo || riveFailed;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Skip intro" />
      {useDoorwayReveal ? (
        <DoorwayReveal reducedMotion={reducedMotion} onFinish={finish} />
      ) : (
        <RiveIntroScene onComplete={finish} onError={() => setRiveFailed(true)} />
      )}
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
});
