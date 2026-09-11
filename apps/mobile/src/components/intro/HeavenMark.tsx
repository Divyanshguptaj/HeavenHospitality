import Svg, { Rect } from 'react-native-svg';

/** The Heaven Hospitality mark: two door-jamb strokes as an "H", a threshold crossbar, and a floating lintel cap. */
export function HeavenMark({ size = 96, color }: { readonly size?: number; readonly color: string }) {
  const height = (size * 150) / 120;
  return (
    <Svg width={size} height={height} viewBox="0 0 120 150">
      <Rect x={14} y={14} width={92} height={8} fill={color} />
      <Rect x={20} y={30} width={14} height={100} fill={color} />
      <Rect x={86} y={30} width={14} height={100} fill={color} />
      <Rect x={20} y={70} width={80} height={10} fill={color} />
    </Svg>
  );
}
