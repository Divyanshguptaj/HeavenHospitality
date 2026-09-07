import { Animated } from 'react-native';
import Svg, { Circle, Polygon, Rect } from 'react-native-svg';

import type { HousePieceConfig } from './houseGeometry';

export interface HousePieceProps {
  readonly config: HousePieceConfig;
  /** Design-unit-to-pixel factor, computed once from screen size. */
  readonly scale: number;
  /** Screen position (px) the house is centered on. */
  readonly houseCenterX: number;
  readonly houseCenterY: number;
  readonly translateX: Animated.Value;
  readonly translateY: Animated.Value;
  readonly rotateDeg: Animated.Value;
  readonly pieceScale: Animated.Value;
}

/**
 * Three stroke-only layers of the exact same shape — wide and faint, medium,
 * then a thin bright core — is what reads as a neon glow. No blur filter and
 * no separate glow shape, so the light can never spill wider than the line
 * that makes it.
 */
const GLOW_LAYERS = [
  { strokeWidth: 13, opacity: 0.14 },
  { strokeWidth: 7, opacity: 0.3 },
  { strokeWidth: 2.5, opacity: 1 },
] as const;

function GlowShape({ config }: { readonly config: HousePieceConfig }) {
  const { shape, color } = config;

  if (shape.kind === 'rect') {
    return (
      <>
        {GLOW_LAYERS.map((layer) => (
          <Rect
            key={layer.strokeWidth}
            x={0}
            y={0}
            width={shape.width}
            height={shape.height}
            fill="none"
            stroke={color}
            strokeOpacity={layer.opacity}
            strokeWidth={layer.strokeWidth}
          />
        ))}
      </>
    );
  }

  if (shape.kind === 'triangle') {
    return (
      <>
        {GLOW_LAYERS.map((layer) => (
          <Polygon
            key={layer.strokeWidth}
            points={shape.points}
            fill="none"
            stroke={color}
            strokeOpacity={layer.opacity}
            strokeWidth={layer.strokeWidth}
            strokeLinejoin="round"
          />
        ))}
      </>
    );
  }

  return (
    <>
      {GLOW_LAYERS.map((layer) => (
        <Circle
          key={layer.strokeWidth}
          cx={shape.radius}
          cy={shape.radius}
          r={shape.radius - layer.strokeWidth / 2}
          fill="none"
          stroke={color}
          strokeOpacity={layer.opacity}
          strokeWidth={layer.strokeWidth}
        />
      ))}
    </>
  );
}

function boxSize(shape: HousePieceConfig['shape']): { width: number; height: number } {
  if (shape.kind === 'circle') return { width: shape.radius * 2, height: shape.radius * 2 };
  return { width: shape.width, height: shape.height };
}

/**
 * One physical piece of the house: a neon-outline SVG shape inside an
 * Animated.View whose transform is driven entirely by the values the
 * controller owns. The piece never decides its own motion — only how its
 * final slot is drawn.
 */
export function HousePiece({
  config,
  scale,
  houseCenterX,
  houseCenterY,
  translateX,
  translateY,
  rotateDeg,
  pieceScale,
}: HousePieceProps) {
  const { finalCenter } = config;
  const { width, height } = boxSize(config.shape);
  const boxWidth = width * scale;
  const boxHeight = height * scale;
  const left = houseCenterX + finalCenter.x * scale - boxWidth / 2;
  const top = houseCenterY + finalCenter.y * scale - boxHeight / 2;

  const rotate = rotateDeg.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: boxWidth,
        height: boxHeight,
        transform: [{ translateX }, { translateY }, { rotate }, { scale: pieceScale }],
      }}
    >
      <Svg width={boxWidth} height={boxHeight} viewBox={`0 0 ${width} ${height}`}>
        <GlowShape config={config} />
      </Svg>
    </Animated.View>
  );
}
