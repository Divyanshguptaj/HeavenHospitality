import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Bloom } from './Bloom';
import { INTRO_COLORS } from './colors';

// Design-unit geometry for the brand mark, matching assets/rive/RIVE_SPEC.md's
// 120x150 artboard: two jambs either side of centre, a crossbar at centre, a
// cap floating above. The jambs and crossbar are the same pieces used for the
// door leaves and the threshold light earlier in the sequence — nothing is
// swapped out, only re-animated.
const JAMB = { width: 14, height: 100, offsetX: 33, offsetY: 5 };
const BAR = { width: 80, height: 10 };
const CAP = { width: 92, height: 8, offsetY: -57 };
const MARK_BOX_WIDTH = 120;
const MARK_SCREEN_FRACTION = 0.46;
const OUTER_BLOOM_SIZE = 300;
const INNER_BLOOM_SIZE = 150;

/** The full "doorway to home" composition: a seam of light opens into a doorway and resolves into the mark. */
export function DoorwayReveal({
  reducedMotion,
  onFinish,
}: {
  readonly reducedMotion: boolean;
  readonly onFinish: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scale = (Math.min(screenWidth, screenHeight) * MARK_SCREEN_FRACTION) / MARK_BOX_WIDTH;
  const markCenterX = screenWidth / 2;
  const markCenterY = screenHeight * 0.42;

  const bloomOpacity = useRef(new Animated.Value(0)).current;
  const bloomScale = useRef(new Animated.Value(0.5)).current;

  const jambOpacity = useRef(new Animated.Value(0)).current;
  const jambLeftX = useRef(new Animated.Value(26 * scale)).current;
  const jambRightX = useRef(new Animated.Value(-26 * scale)).current;
  const jambScaleY = useRef(new Animated.Value(3)).current;

  const barOpacity = useRef(new Animated.Value(0)).current;
  const barScaleX = useRef(new Animated.Value(0.04)).current;
  const barScaleY = useRef(new Animated.Value(6)).current;

  const capOpacity = useRef(new Animated.Value(0)).current;
  const capScale = useRef(new Animated.Value(0.8)).current;

  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordRise = useRef(new Animated.Value(8)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagRise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (reducedMotion) {
      bloomOpacity.setValue(0.5);
      bloomScale.setValue(1);
      jambOpacity.setValue(1);
      jambLeftX.setValue(0);
      jambRightX.setValue(0);
      jambScaleY.setValue(1);
      barOpacity.setValue(1);
      barScaleX.setValue(1);
      barScaleY.setValue(1);
      capOpacity.setValue(1);
      capScale.setValue(1);
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(wordRise, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tagOpacity, { toValue: 1, duration: 220, delay: 60, useNativeDriver: true }),
        Animated.timing(tagRise, {
          toValue: 0,
          duration: 220,
          delay: 60,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setTimeout(onFinish, 120));
      return;
    }

    Animated.sequence([
      // Scene 1 — darkness, a seam of light.
      Animated.parallel([
        Animated.timing(bloomOpacity, { toValue: 0.6, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bloomScale, { toValue: 0.7, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(barOpacity, { toValue: 1, duration: 200, delay: 60, useNativeDriver: true }),
      ]),
      // Scene 2/3 — the door opens and the light widens as the viewer moves through it.
      Animated.parallel([
        Animated.timing(jambOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(jambLeftX, { toValue: 0, duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(jambRightX, { toValue: 0, duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(jambScaleY, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(barScaleX, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(barScaleY, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(bloomScale, { toValue: 1.3, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(bloomOpacity, { toValue: 0.85, duration: 500, useNativeDriver: true }),
      ]),
      // Scene 4 — the lines settle into the mark, the lintel appears, the light recedes behind it.
      Animated.parallel([
        Animated.timing(bloomScale, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bloomOpacity, { toValue: 0.45, duration: 350, useNativeDriver: true }),
        Animated.timing(capOpacity, { toValue: 1, duration: 260, delay: 80, useNativeDriver: true }),
        Animated.timing(capScale, {
          toValue: 1,
          duration: 260,
          delay: 80,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(160),
      // Scene 5 — brand reveal.
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(wordRise, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tagOpacity, { toValue: 1, duration: 260, delay: 80, useNativeDriver: true }),
        Animated.timing(tagRise, {
          toValue: 0,
          duration: 260,
          delay: 80,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setTimeout(onFinish, 200));
  }, [reducedMotion]);

  const jambTop = markCenterY + JAMB.offsetY * scale - (JAMB.height * scale) / 2;
  const jambWidthPx = JAMB.width * scale;
  const jambHeightPx = JAMB.height * scale;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        style={{
          position: 'absolute',
          width: OUTER_BLOOM_SIZE,
          height: OUTER_BLOOM_SIZE,
          left: markCenterX - OUTER_BLOOM_SIZE / 2,
          top: markCenterY - OUTER_BLOOM_SIZE / 2,
          opacity: bloomOpacity,
          transform: [{ scale: bloomScale }],
        }}
      >
        <Bloom
          size={OUTER_BLOOM_SIZE}
          gradientId="introBloomOuter"
          coreColor={INTRO_COLORS.lightMid}
          edgeColor={INTRO_COLORS.lightWarmEdge}
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          width: INNER_BLOOM_SIZE,
          height: INNER_BLOOM_SIZE,
          left: markCenterX - INNER_BLOOM_SIZE / 2,
          top: markCenterY - INNER_BLOOM_SIZE / 2,
          opacity: bloomOpacity,
          transform: [{ scale: bloomScale }],
        }}
      >
        <Bloom
          size={INNER_BLOOM_SIZE}
          gradientId="introBloomInner"
          coreColor={INTRO_COLORS.lightHot}
          edgeColor={INTRO_COLORS.lightMid}
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          width: jambWidthPx,
          height: jambHeightPx,
          top: jambTop,
          left: markCenterX - JAMB.offsetX * scale - jambWidthPx / 2,
          backgroundColor: INTRO_COLORS.lightHot,
          opacity: jambOpacity,
          transform: [{ translateX: jambLeftX }, { scaleY: jambScaleY }],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          width: jambWidthPx,
          height: jambHeightPx,
          top: jambTop,
          left: markCenterX + JAMB.offsetX * scale - jambWidthPx / 2,
          backgroundColor: INTRO_COLORS.lightHot,
          opacity: jambOpacity,
          transform: [{ translateX: jambRightX }, { scaleY: jambScaleY }],
        }}
      />

      <Animated.View
        style={{
          position: 'absolute',
          width: BAR.width * scale,
          height: BAR.height * scale,
          left: markCenterX - (BAR.width * scale) / 2,
          top: markCenterY - (BAR.height * scale) / 2,
          borderRadius: 2,
          backgroundColor: INTRO_COLORS.lightHot,
          opacity: barOpacity,
          transform: [{ scaleX: barScaleX }, { scaleY: barScaleY }],
        }}
      />

      <Animated.View
        style={{
          position: 'absolute',
          width: CAP.width * scale,
          height: CAP.height * scale,
          left: markCenterX - (CAP.width * scale) / 2,
          top: markCenterY + CAP.offsetY * scale - (CAP.height * scale) / 2,
          borderRadius: 2,
          backgroundColor: INTRO_COLORS.lightHot,
          opacity: capOpacity,
          transform: [{ scale: capScale }],
        }}
      />

      <Animated.Text
        style={[
          styles.word,
          { top: markCenterY + 110 * scale, opacity: wordOpacity, transform: [{ translateY: wordRise }] },
        ]}
      >
        {'HEAVEN\nHOSPITALITY'}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.tagline,
          {
            top: markCenterY + 110 * scale + 58,
            opacity: tagOpacity,
            transform: [{ translateY: tagRise }],
          },
        ]}
      >
        Feel at home.
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  word: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 28,
    color: INTRO_COLORS.wordmark,
  },
  tagline: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    color: INTRO_COLORS.tagline,
  },
});
