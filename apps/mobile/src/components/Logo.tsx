import Svg, { Rect } from 'react-native-svg';

/** The Heaven Hospitality mark: two door-jamb strokes as an "H", a threshold crossbar, and a floating lintel cap. */
export function Logo({ size = 40, color }: { readonly size?: number; readonly color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={12} y={16} width={76} height={7} fill={color} />
      <Rect x={20} y={28} width={12} height={54} fill={color} />
      <Rect x={68} y={28} width={12} height={54} fill={color} />
      <Rect x={20} y={54} width={60} height={8} fill={color} />
    </Svg>
  );
}
