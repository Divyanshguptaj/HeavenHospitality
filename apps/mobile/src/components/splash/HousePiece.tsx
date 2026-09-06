import { Animated } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';

import type { HousePieceConfig } from './houseGeometry';

export interface HousePieceProps {
  readonly config: HousePieceConfig;
  /** Design-unit-to-pixel factor, computed once from screen size. */
  readonly scale: number;
  /** Screen position (px) the house is centered on. */
  readonly houseCenterX: number;
  readonly houseCenterY: number;
  readonly color: string;
  readonly translateX: Animated.Value;
  readonly translateY: Animated.Value;
  readonly rotateDeg: Animated.Value;
  readonly pieceScale: Animated.Value;
}

/**
 * One physical piece of the house: a small SVG shape inside an Animated.View
 * whose transform is driven entirely by the values the controller owns. The
 * piece never decides its own motion — only how its final slot is drawn.
 */
export function HousePiece({
  config,
  scale,
  houseCenterX,
  houseCenterY,
  color,
  translateX,
  translateY,
  rotateDeg,
  pieceScale,
}: HousePieceProps) {
  const { shape, finalCenter } = config;
  const boxWidth = shape.width * scale;
  const boxHeight = shape.height * scale;
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
      <Svg width={boxWidth} height={boxHeight} viewBox={`0 0 ${shape.width} ${shape.height}`}>
        {shape.kind === 'rect' ? (
          <Rect x={0} y={0} width={shape.width} height={shape.height} fill={color} />
        ) : (
          <Polygon points={shape.points} fill={color} />
        )}
      </Svg>
    </Animated.View>
  );
}
