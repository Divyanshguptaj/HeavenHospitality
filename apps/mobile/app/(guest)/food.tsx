import { DAY_NAMES, MEAL_LABELS } from '@heaven/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { PropertyScreen } from '../../src/components/PropertyScreen';
import { Card, CardTitle, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { layout, useTheme } from '../../src/theme';

/** ISO-8601 weekday: Date.getDay() returns 0 for Sunday, the menu uses 7. */
function todayIsoWeekday(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

/**
 * Food — the published weekly menu.
 *
 * Today is highlighted and listed first: a guest deciding whether to eat here
 * cares about today far more than about next Thursday.
 */
export default function FoodScreen() {
  const theme = useTheme();
  const today = todayIsoWeekday();

  return (
    <PropertyScreen>
      {(property) => {
        // Rotate the week so today leads, preserving weekday order after it.
        const orderedMenu = [...property.menu].sort((a, b) => {
          const rank = (day: number) => (day - today + 7) % 7;
          return rank(a.dayOfWeek) - rank(b.dayOfWeek);
        });

        return (
          <>
            <PageHeading
              title="Food"
              subtitle="Three home-style meals a day, plus evening snacks."
            />

            {orderedMenu.length === 0 ? (
              <EmptyState message="The menu is not published yet." />
            ) : (
              orderedMenu.map((day) => {
                const isToday = day.dayOfWeek === today;
                return (
                  <Card
                    key={day.dayOfWeek}
                    style={isToday ? { borderColor: theme.primary, borderWidth: 1.5 } : undefined}
                  >
                    <View style={styles.dayHeader}>
                      <CardTitle>{DAY_NAMES[day.dayOfWeek] ?? `Day ${day.dayOfWeek}`}</CardTitle>
                      {isToday && (
                        <Text style={[styles.todayTag, { color: theme.primary }]}>Today</Text>
                      )}
                    </View>

                    {day.meals.map((meal) => (
                      <View key={meal.mealType} style={styles.meal}>
                        <Text style={[styles.mealName, { color: theme.textMuted }]}>
                          {MEAL_LABELS[meal.mealType]}
                        </Text>
                        <Text style={[styles.mealItems, { color: theme.textPrimary }]}>
                          {meal.items.join(' · ')}
                        </Text>
                      </View>
                    ))}
                  </Card>
                );
              })
            )}

            <Muted>
              The menu may change with seasonal availability. Let the kitchen know a day in advance
              if you will miss a meal.
            </Muted>
          </>
        );
      }}
    </PropertyScreen>
  );
}

const styles = StyleSheet.create({
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayTag: { fontSize: layout.fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  meal: { gap: layout.spacing[1] },
  mealName: { fontSize: layout.fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  mealItems: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
});
