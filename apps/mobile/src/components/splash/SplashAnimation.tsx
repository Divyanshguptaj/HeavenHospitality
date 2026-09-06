import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { useTheme } from '../../theme';
import { HOUSE_HEIGHT, HOUSE_PIECES, HOUSE_WIDTH, type PieceColor } from './houseGeometry';
import { HousePiece } from './HousePiece';

/** House width as a fraction of the shorter screen dimension. */
const HOUSE_SCREEN_FRACTION = 0.42;

function colorFor(role: PieceColor, theme: ReturnType<typeof useTheme>): string {
  if (role === 'primary') return theme.primary;
  if (role === 'accent') return theme.primaryHover;
  return theme.canvas;
}

/**
 * Seven scattered pieces accelerate toward a shared point, briefly compress
 * and overshoot as though they collided, then spring apart into their exact
 * final slots — the same pieces, now the house. Runs once per mount.
 */
export function SplashAnimation({ onFinish }: { readonly onFinish: () => void }) {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const scale = (Math.min(screenWidth, screenHeight) * HOUSE_SCREEN_FRACTION) / HOUSE_WIDTH;
  const houseCenterX = screenWidth / 2;
  const houseCenterY = screenHeight * 0.42;

  const pieces = useRef(
    HOUSE_PIECES.map((config) => ({
      config,
      translateX: new Animated.Value(config.startOffset.x * scale),
      translateY: new Animated.Value(config.startOffset.y * scale),
      rotateDeg: new Animated.Value(config.startRotationDeg),
      pieceScale: new Animated.Value(config.startScale),
    })),
  ).current;

  const groupScale = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textRise = useRef(new Animated.Value(10)).current;
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

  function revealText(): void {
    if (finished.current) return;
    Animated.parallel([
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(textRise, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (finished.current) return;
      setTimeout(reveal, 500);
    });
  }

  function settleHouse(): void {
    if (finished.current) return;
    Animated.sequence([
      Animated.timing(groupScale, {
        toValue: 1.02,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(groupScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
    ]).start();
    revealText();
  }

  function assembleInstantly(): void {
    for (const p of pieces) {
      p.translateX.setValue(0);
      p.translateY.setValue(0);
      p.rotateDeg.setValue(0);
      p.pieceScale.setValue(1);
    }
    Animated.timing(overlayOpacity, { toValue: 1, duration: 1, useNativeDriver: true }).start();
    settleHouse();
  }

  useEffect(() => {
    const safetyNet = setTimeout(reveal, 6000);

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (finished.current) return;
      if (reduced) {
        assembleInstantly();
        return;
      }

      const flights = pieces.map(({ config, translateX, translateY, rotateDeg, pieceScale }) =>
        Animated.sequence([
          // 100-600ms: accelerate from the scatter toward the shared centre.
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: config.collisionOffset.x * scale,
              duration: 500,
              delay: 100,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: config.collisionOffset.y * scale,
              duration: 500,
              delay: 100,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          // 600-850ms: the collision — compression, overshoot, a rotation
          // correction. Position holds; only scale and angle move.
          Animated.parallel([
            Animated.sequence([
              Animated.timing(pieceScale, {
                toValue: config.startScale * 0.82,
                duration: 90,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(pieceScale, {
                toValue: 1.16,
                duration: 160,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(rotateDeg, {
              toValue: config.startRotationDeg > 0 ? -8 : 8,
              duration: 250,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          // 850-1300ms: spring into the exact final slot.
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, friction: 8, tension: 55, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, friction: 8, tension: 55, useNativeDriver: true }),
            Animated.spring(rotateDeg, { toValue: 0, friction: 9, tension: 60, useNativeDriver: true }),
            Animated.spring(pieceScale, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
          ]),
        ]),
      );

      Animated.parallel(flights).start(({ finished: allArrived }) => {
        if (allArrived) settleHouse();
      });
    });

    return () => clearTimeout(safetyNet);
  }, []);

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: theme.canvas, opacity: overlayOpacity }]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={reveal} accessibilityLabel="Skip intro" />

      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: groupScale }] }]}>
        {pieces.map(({ config, translateX, translateY, rotateDeg, pieceScale }) => (
          <HousePiece
            key={config.id}
            config={config}
            scale={scale}
            houseCenterX={houseCenterX}
            houseCenterY={houseCenterY}
            color={colorFor(config.color, theme)}
            translateX={translateX}
            translateY={translateY}
            rotateDeg={rotateDeg}
            pieceScale={pieceScale}
          />
        ))}
      </Animated.View>

      <Animated.Text
        style={[
          styles.title,
          {
            color: theme.textPrimary,
            top: houseCenterY + (HOUSE_HEIGHT / 2) * scale + 26,
            opacity: textOpacity,
            transform: [{ translateY: textRise }],
          },
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
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
