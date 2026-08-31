import { MEAL_LABELS } from '@heaven/contracts';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePublicMenu } from '../../src/api/public';
import { Card, EmptyState, Muted, PageHeading } from '../../src/components/ui';
import { QueryScreen } from '../../src/components/publicUi';
import { layout, useTheme } from '../../src/theme';

/**
 * Menu — today first, then the rest of the week, day by day.
 *
 * The server decides which day is "today" and returns the week already rotated
 * to start there. A device clock is neither trustworthy nor necessarily in the
 * property's timezone, and a phone an hour ahead must not be shown tomorrow's
 * dinner as if it were tonight's.
 *
 * Every dish, every serving time and every special comes from the database. The
 * owner changing Tuesday's lunch needs no new build of this app.
 */
export default function MenuScreen() {
  const theme = useTheme();
  const query = usePublicMenu();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  return (
    <QueryScreen query={query}>
      {(week) => {
        // Defaults to today, which is the first day the server returned.
        const activeDayOfWeek = selectedDay ?? week.days[0]?.dayOfWeek ?? week.todayDayOfWeek;
        const activeDay = week.days.find((day) => day.dayOfWeek === activeDayOfWeek) ?? week.days[0];

        return (
          <>
            <PageHeading
              title="Mess menu"
              subtitle="Three home-style meals a day, cooked on the premises."
            />

            {week.days.length === 0 ? (
              <EmptyState message="The menu has not been published yet." />
            ) : (
              <>
                {/* Day selector. A horizontal strip rather than seven stacked
                    cards: the whole week has to be reachable without scrolling
                    past six days you did not want. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStrip}
                >
                  {week.days.map((day, index) => {
                    const isActive = day.dayOfWeek === activeDayOfWeek;
                    const isToday = index === 0;

                    return (
                      <Pressable
                        key={day.date ?? day.dayOfWeek}
                        onPress={() => {
                          setSelectedDay(day.dayOfWeek);
                        }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={isToday ? `Today, ${day.dayName}` : day.dayName}
                        style={[
                          styles.dayChip,
                          {
                            backgroundColor: isActive ? theme.primary : theme.surface,
                            borderColor: isActive ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayChipLabel,
                            { color: isActive ? theme.textInverse : theme.textSecondary },
                          ]}
                        >
                          {isToday ? 'Today' : day.dayName.slice(0, 3)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {activeDay !== undefined && (
                  <>
                    <Text style={[styles.dayHeading, { color: theme.textPrimary }]}>
                      {activeDay.dayName}
                    </Text>

                    {activeDay.meals.length === 0 ? (
                      <EmptyState message="No meals are listed for this day." />
                    ) : (
                      activeDay.meals.map((meal) => (
                        <Card key={meal.mealType}>
                          <View style={styles.mealHeader}>
                            <Text style={[styles.mealName, { color: theme.textPrimary }]}>
                              {MEAL_LABELS[meal.mealType]}
                            </Text>
                            {meal.timing !== null && (
                              <Text style={[styles.mealTime, { color: theme.textMuted }]}>
                                {meal.timing.startsAt} – {meal.timing.endsAt}
                              </Text>
                            )}
                          </View>

                          <View style={styles.items}>
                            {meal.items.map((item) => (
                              <View key={item} style={styles.item}>
                                <View style={[styles.bullet, { backgroundColor: theme.primary }]} />
                                <Text style={[styles.itemText, { color: theme.textPrimary }]}>
                                  {item}
                                </Text>
                              </View>
                            ))}
                          </View>

                          {/* A special replaces the usual item for this one
                              meal, so say so — otherwise the weekly menu on
                              another day looks like a contradiction. */}
                          {meal.isSpecial && (
                            <View
                              style={[styles.specialTag, { backgroundColor: theme.primarySubtle }]}
                            >
                              <Text style={[styles.specialText, { color: theme.primary }]}>
                                {meal.description ?? 'Special — replaces the usual menu'}
                              </Text>
                            </View>
                          )}

                          {!meal.isSpecial && meal.description !== null && (
                            <Muted>{meal.description}</Muted>
                          )}
                        </Card>
                      ))
                    )}
                  </>
                )}
              </>
            )}

            <Muted>
              The menu occasionally changes with seasonal availability. Residents can tell the
              kitchen a day in advance if they will miss a meal.
            </Muted>
          </>
        );
      }}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  dayStrip: { gap: layout.spacing[3], paddingRight: layout.spacing[4] },
  dayChip: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[5],
  },
  dayChipLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },

  dayHeading: { fontSize: layout.fontSize.lg, fontWeight: '600' },

  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mealName: { fontSize: layout.fontSize.md, fontWeight: '600' },
  mealTime: { fontSize: layout.fontSize.sm, fontVariant: ['tabular-nums'] },

  items: { gap: layout.spacing[3] },
  item: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing[4] },
  bullet: { width: 5, height: 5, borderRadius: layout.radius.full },
  itemText: { flex: 1, fontSize: layout.fontSize.md },

  specialTag: {
    alignSelf: 'flex-start',
    borderRadius: layout.radius.md,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[2],
  },
  specialText: { fontSize: layout.fontSize.xs, fontWeight: '600' },
});
