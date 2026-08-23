import {
  MIN_TOUCH_TARGET_PX,
  colors,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  spacing,
  type ColorScheme,
} from '@heaven/tokens';
import { useColorScheme } from 'react-native';

/**
 * The mobile side of the design system.
 *
 * Identical token *values* to the admin, expressed as React Native styles rather
 * than CSS. We share the numbers, never the components — a `<View>` and a `<div>`
 * are not the same thing and pretending otherwise produces bad UI on both.
 */
export function useTheme(): ColorScheme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? colors.dark : colors.light;
}

export const layout = {
  spacing,
  radius,
  fontSize,
  fontWeight,
  lineHeight,
  /**
   * Every tappable element must meet this. Undersized targets are the single most
   * common accessibility failure in a mobile app.
   */
  minTouchTarget: MIN_TOUCH_TARGET_PX,
} as const;
