import { colors } from '@heaven/tokens';
import Matter from 'matter-js';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** One vivid hue per shape. */
const HUE = {
  tower: '#FF6B6B',
  square: '#4D8AFF',
  base: '#FFD23F',
  roof: '#B15DFF',
  sun: '#FFB627',
} as const;

const backdrop = colors.dark;

const TOWER_W = 56;
const TOWER_H = 150;
const SQUARE = 110;
const BASE_W = 110;
const BASE_H = 26;
const ROOF_W = 140;
const ROOF_H = 74;
const SUN_R = 26;

const GROUND_Y = SCREEN_H * 0.46;
const HOUSE_LEFT = SCREEN_W / 2 - (TOWER_W + SQUARE) / 2;

const squareTarget = { x: HOUSE_LEFT + TOWER_W + SQUARE / 2, y: GROUND_Y - SQUARE / 2 };
const towerTarget = { x: HOUSE_LEFT + TOWER_W / 2, y: GROUND_Y - TOWER_H / 2 };
const squareTop = GROUND_Y - SQUARE;
const baseTarget = { x: squareTarget.x, y: squareTop - BASE_H / 2 };
const baseTop = squareTop - BASE_H;
const roofTarget = { x: squareTarget.x, y: baseTop - ROOF_H / 3 };
const sunTarget = { x: squareTarget.x + SQUARE / 2 + 90, y: baseTop - ROOF_H - 20 };

/** Isoceles triangle, apex up, centroid at (0, 0). */
const ROOF_VERTICES = [
  { x: -ROOF_W / 2, y: ROOF_H / 3 },
  { x: ROOF_W / 2, y: ROOF_H / 3 },
  { x: 0, y: -(2 * ROOF_H) / 3 },
];

const towerStart = { x: towerTarget.x - 130, y: -220 };
const squareStart = { x: squareTarget.x + 130, y: -320 };
const baseStart = { x: baseTarget.x + 15, y: -420 };
const roofStart = { x: roofTarget.x - 110, y: -520 };
const sunStart = { x: sunTarget.x - 90, y: -260 };

function outlineBox(width: number, height: number, radius: number) {
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width,
    height,
    borderRadius: radius,
    borderWidth: 5,
    backgroundColor: 'transparent',
  };
}

function homingConstraint(body: Matter.Body, target: { x: number; y: number }) {
  return Matter.Constraint.create({
    bodyA: body,
    pointB: target,
    stiffness: 0.006,
    damping: 0.4,
    length: 0,
  });
}

/**
 * Drops five shapes (tower, square, base, roof, sun) from above the screen,
 * lets them collide and bounce off each other under real physics, then
 * assembles them into a house before revealing the app.
 */
export function AppIntro({ onFinish }: { readonly onFinish: () => void }) {
  const towerX = useRef(new Animated.Value(towerStart.x - TOWER_W / 2)).current;
  const towerY = useRef(new Animated.Value(towerStart.y - TOWER_H / 2)).current;
  const squareX = useRef(new Animated.Value(squareStart.x - SQUARE / 2)).current;
  const squareY = useRef(new Animated.Value(squareStart.y - SQUARE / 2)).current;
  const baseX = useRef(new Animated.Value(baseStart.x - BASE_W / 2)).current;
  const baseY = useRef(new Animated.Value(baseStart.y - BASE_H / 2)).current;
  const roofX = useRef(new Animated.Value(roofStart.x - ROOF_W / 2)).current;
  const roofY = useRef(new Animated.Value(roofStart.y - ROOF_H / 2)).current;
  const sunX = useRef(new Animated.Value(sunStart.x - SUN_R)).current;
  const sunY = useRef(new Animated.Value(sunStart.y - SUN_R)).current;

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

  function runFinale(): void {
    if (finished.current) return;
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
  }

  useEffect(() => {
    // Forces the reveal if the physics loop or the finale below never
    // finishes on its own.
    const safetyNet = setTimeout(reveal, 6000);

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1 } });
    const world = engine.world;

    const towerBody = Matter.Bodies.rectangle(towerStart.x, towerStart.y, TOWER_W, TOWER_H, {
      restitution: 0.5,
      friction: 0.15,
    });
    const squareBody = Matter.Bodies.rectangle(squareStart.x, squareStart.y, SQUARE, SQUARE, {
      restitution: 0.5,
      friction: 0.15,
    });
    const baseBody = Matter.Bodies.rectangle(baseStart.x, baseStart.y, BASE_W, BASE_H, {
      restitution: 0.5,
      friction: 0.15,
    });
    const roofBody = Matter.Bodies.fromVertices(roofStart.x, roofStart.y, [ROOF_VERTICES], {
      restitution: 0.5,
      friction: 0.15,
    });
    for (const body of [towerBody, squareBody, baseBody, roofBody]) {
      Matter.Body.setInertia(body, Infinity);
    }

    const floor = Matter.Bodies.rectangle(
      HOUSE_LEFT + (TOWER_W + SQUARE) / 2,
      GROUND_Y + 10,
      TOWER_W + SQUARE + 60,
      20,
      { isStatic: true },
    );
    const leftWall = Matter.Bodies.rectangle(6, SCREEN_H / 2, 12, SCREEN_H * 2, { isStatic: true });
    const rightWall = Matter.Bodies.rectangle(SCREEN_W - 6, SCREEN_H / 2, 12, SCREEN_H * 2, {
      isStatic: true,
    });
    const safetyFloor = Matter.Bodies.rectangle(SCREEN_W / 2, GROUND_Y + 400, SCREEN_W * 2, 20, {
      isStatic: true,
    });

    const towerConstraint = homingConstraint(towerBody, towerTarget);
    const squareConstraint = homingConstraint(squareBody, squareTarget);
    const baseConstraint = homingConstraint(baseBody, baseTarget);
    const roofConstraint = homingConstraint(roofBody, roofTarget);

    Matter.Composite.add(world, [
      towerBody,
      squareBody,
      baseBody,
      roofBody,
      floor,
      leftWall,
      rightWall,
      safetyFloor,
      towerConstraint,
      squareConstraint,
      baseConstraint,
      roofConstraint,
    ]);

    let sunBody: Matter.Body | null = null;

    function tick() {
      Matter.Engine.update(engine, 1000 / 60);

      towerX.setValue(towerBody.position.x - TOWER_W / 2);
      towerY.setValue(towerBody.position.y - TOWER_H / 2);
      squareX.setValue(squareBody.position.x - SQUARE / 2);
      squareY.setValue(squareBody.position.y - SQUARE / 2);
      baseX.setValue(baseBody.position.x - BASE_W / 2);
      baseY.setValue(baseBody.position.y - BASE_H / 2);
      roofX.setValue(roofBody.position.x - ROOF_W / 2);
      roofY.setValue(roofBody.position.y - ROOF_H / 2);
      if (sunBody !== null) {
        sunX.setValue(sunBody.position.x - SUN_R);
        sunY.setValue(sunBody.position.y - SUN_R);
      }

      rafId = requestAnimationFrame(tick);
    }

    let rafId = requestAnimationFrame(tick);

    const snapTimer = setTimeout(() => {
      towerConstraint.stiffness = 0.25;
      squareConstraint.stiffness = 0.25;
      baseConstraint.stiffness = 0.25;
      roofConstraint.stiffness = 0.25;
    }, 900);

    const spawnSunTimer = setTimeout(() => {
      sunBody = Matter.Bodies.circle(sunStart.x, sunStart.y, SUN_R, {
        restitution: 0.55,
        friction: 0.1,
      });
      Matter.Body.setInertia(sunBody, Infinity);
      const sunConstraint = homingConstraint(sunBody, sunTarget);
      sunConstraint.stiffness = 0.015;
      Matter.Composite.add(world, [sunBody, sunConstraint]);

      setTimeout(() => {
        sunConstraint.stiffness = 0.3;
      }, 500);
    }, 1500);

    const stopTimer = setTimeout(() => {
      cancelAnimationFrame(rafId);
      runFinale();
    }, 2600);

    return () => {
      clearTimeout(safetyNet);
      cancelAnimationFrame(rafId);
      clearTimeout(snapTimer);
      clearTimeout(spawnSunTimer);
      clearTimeout(stopTimer);
    };
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={reveal} accessibilityLabel="Skip intro" />

      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pulse }] }]}>
        <Animated.View
          style={[styles.shapeWrap, { transform: [{ translateX: towerX }, { translateY: towerY }] }]}
        >
          <Animated.View style={[outlineBox(TOWER_W, TOWER_H, 6), { borderColor: HUE.tower }]} />
        </Animated.View>

        <Animated.View
          style={[styles.shapeWrap, { transform: [{ translateX: squareX }, { translateY: squareY }] }]}
        >
          <Animated.View style={[outlineBox(SQUARE, SQUARE, 10), { borderColor: HUE.square }]} />
        </Animated.View>

        <Animated.View
          style={[styles.shapeWrap, { transform: [{ translateX: baseX }, { translateY: baseY }] }]}
        >
          <Animated.View style={[outlineBox(BASE_W, BASE_H, 4), { borderColor: HUE.base }]} />
        </Animated.View>

        <Animated.View
          style={[styles.shapeWrap, { transform: [{ translateX: roofX }, { translateY: roofY }] }]}
        >
          <Svg width={ROOF_W} height={ROOF_H} style={styles.svg}>
            <Polygon
              points={`${ROOF_W / 2},2 ${ROOF_W - 2},${ROOF_H - 2} 2,${ROOF_H - 2}`}
              fill="none"
              stroke={HUE.roof}
              strokeWidth={5}
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>

        <Animated.View
          style={[styles.shapeWrap, { transform: [{ translateX: sunX }, { translateY: sunY }] }]}
        >
          <Animated.View style={[outlineBox(SUN_R * 2, SUN_R * 2, SUN_R), { borderColor: HUE.sun }]} />
        </Animated.View>
      </Animated.View>

      <Animated.Text
        style={[styles.title, { opacity: textOpacity, transform: [{ translateY: textRise }] }]}
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
    backgroundColor: backdrop.canvas,
  },
  shapeWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  title: {
    position: 'absolute',
    bottom: SCREEN_H * 0.28,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: backdrop.textPrimary,
  },
});
