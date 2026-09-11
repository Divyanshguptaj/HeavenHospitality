import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/** A soft radial glow: a bright core fading through a warm mid tone to nothing. */
export function Bloom({
  size,
  gradientId,
  coreColor,
  edgeColor,
}: {
  readonly size: number;
  readonly gradientId: string;
  readonly coreColor: string;
  readonly edgeColor: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={coreColor} stopOpacity={0.95} />
          <Stop offset="55%" stopColor={edgeColor} stopOpacity={0.35} />
          <Stop offset="100%" stopColor={edgeColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#${gradientId})`} />
    </Svg>
  );
}
