import { DAY_NAMES, MEAL_LABELS, MEAL_TYPES, type MealTypeName } from '@heaven/contracts';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePublicProperty } from '../../src/api/property';
import { useAbsences, useMarkAbsence, useResidentHome } from '../../src/api/resident';
import {
  Badge,
  Body,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Mess: what is being served, and telling the kitchen when you will not be there.
 *
 * Absence is opt-out — you are counted unless you say otherwise, so forgetting
 * to open the app means you still get fed.
 */
export default function MessScreen() {
  const theme = useTheme();
  const home = useResidentHome();
  const property = usePublicProperty();
  const markAbsence = useMarkAbsence();

  // Today and the next six days: far enough to plan a trip, short enough to stay
  // a single screen.
  const [selectedDate, setSelectedDate] = useState(isoDate(0));
  const absences = useAbsences(isoDate(0), isoDate(6));

  if (home.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the menu…" />
      </Screen>
    );
  }

  if (home.error) {
    return (
      <Screen>
        <ErrorState
          message={home.error instanceof ApiRequestError ? home.error.message : 'Please try again.'}
          onRetry={() => void home.refetch()}
        />
      </Screen>
    );
  }

  const absentOnSelected = new Set(
    (absences.data ?? [])
      .filter((absence) => absence.date === selectedDate)
      .map((absence) => absence.mealType),
  );

  const menuForSelected =
    property.data?.menu.find((day) => day.dayOfWeek === weekdayOf(selectedDate))?.meals ?? [];

  function toggle(mealType: MealTypeName): void {
    const next = new Set(absentOnSelected);
    if (next.has(mealType)) next.delete(mealType);
    else next.add(mealType);

    markAbsence
      .mutateAsync({ date: selectedDate, absentMeals: [...next] })
      .catch((error: unknown) => {
        // The cutoff is enforced by the server; surface its message verbatim.
        Alert.alert(
          'Could not update',
          error instanceof ApiRequestError ? error.message : 'Please try again.',
        );
      });
  }

  function markWholeDay(): void {
    const allAbsent = absentOnSelected.size === MEAL_TYPES.length;
    markAbsence
      .mutateAsync({ date: selectedDate, absentMeals: allAbsent ? [] : [...MEAL_TYPES] })
      .catch((error: unknown) => {
        Alert.alert(
          'Could not update',
          error instanceof ApiRequestError ? error.message : 'Please try again.',
        );
      });
  }

  const days = Array.from({ length: 7 }, (_unused, index) => isoDate(index));

  return (
    <Screen onRefresh={() => void home.refetch()} refreshing={home.isRefetching}>
      <PageHeading
        title="Mess"
        subtitle="Tell the kitchen when you will be away so food is not wasted."
      />

      <Card>
        <CardTitle>Choose a day</CardTitle>
        <View style={styles.dayRow}>
          {days.map((date, index) => {
            const selected = date === selectedDate;
            const hasAbsence = (absences.data ?? []).some((a) => a.date === date);
            return (
              <Pressable
                key={date}
                onPress={() => setSelectedDate(date)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={index === 0 ? 'Today' : DAY_NAMES[weekdayOf(date)]}
                style={[
                  styles.day,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceSubtle,
                    borderColor: hasAbsence && !selected ? theme.warning : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    { color: selected ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  {index === 0 ? 'Today' : (DAY_NAMES[weekdayOf(date)]?.slice(0, 3) ?? '')}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    { color: selected ? theme.textInverse : theme.textPrimary },
                  ]}
                >
                  {date.slice(8)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <View style={styles.headerRow}>
          <CardTitle>Meals on {selectedDate}</CardTitle>
          {absentOnSelected.size > 0 && (
            <Badge label={`${absentOnSelected.size} skipped`} tone="warning" />
          )}
        </View>

        {MEAL_TYPES.map((mealType) => {
          const isAbsent = absentOnSelected.has(mealType);
          const items = menuForSelected.find((meal) => meal.mealType === mealType)?.items ?? [];
          const timing = property.data?.mealTimings.find((t) => t.mealType === mealType);

          return (
            <Pressable
              key={mealType}
              onPress={() => toggle(mealType)}
              disabled={markAbsence.isPending}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isAbsent }}
              accessibilityLabel={`${MEAL_LABELS[mealType]} — ${isAbsent ? 'skipping' : 'attending'}`}
              style={[
                styles.meal,
                {
                  borderColor: isAbsent ? theme.warning : theme.border,
                  backgroundColor: isAbsent ? theme.warningSubtle : 'transparent',
                },
              ]}
            >
              <View style={styles.mealHeader}>
                <Text style={[styles.mealName, { color: theme.textPrimary }]}>
                  {MEAL_LABELS[mealType]}
                  {timing !== undefined && (
                    <Text style={{ color: theme.textMuted }}> · {timing.startsAt}</Text>
                  )}
                </Text>
                <Badge
                  label={isAbsent ? 'Skipping' : 'Eating'}
                  tone={isAbsent ? 'warning' : 'success'}
                />
              </View>
              <Text style={[styles.mealItems, { color: theme.textSecondary }]}>
                {items.length === 0 ? 'Menu not set' : items.join(' · ')}
              </Text>
            </Pressable>
          );
        })}

        <Button
          label={
            absentOnSelected.size === MEAL_TYPES.length
              ? 'I will be here all day'
              : 'Away for the whole day'
          }
          variant="secondary"
          onPress={markWholeDay}
        />

        <Muted>
          Tap a meal to switch between eating and skipping. Changes to today close at the
          property&apos;s cutoff time.
        </Muted>
      </Card>

      <Card>
        <CardTitle>This week&apos;s menu</CardTitle>
        {property.data === undefined ? (
          <LoadingState />
        ) : property.data.menu.length === 0 ? (
          <EmptyState message="The menu has not been published yet." />
        ) : (
          property.data.menu.map((day) => (
            <View key={day.dayOfWeek} style={styles.menuDay}>
              <Text style={[styles.menuDayName, { color: theme.textPrimary }]}>
                {DAY_NAMES[day.dayOfWeek]}
              </Text>
              {day.meals.map((meal) => (
                <Body key={meal.mealType}>
                  {MEAL_LABELS[meal.mealType]}: {meal.items.join(', ')}
                </Body>
              ))}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  day: {
    minWidth: 46,
    minHeight: layout.minTouchTarget,
    borderRadius: layout.radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.spacing[2],
  },
  dayLabel: { fontSize: layout.fontSize.xs },
  dayNumber: { fontSize: layout.fontSize.md, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meal: {
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    padding: layout.spacing[4],
    gap: layout.spacing[2],
  },
  mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealName: { fontSize: layout.fontSize.md, fontWeight: '600' },
  mealItems: { fontSize: layout.fontSize.sm },
  menuDay: { gap: layout.spacing[1] },
  menuDayName: { fontSize: layout.fontSize.sm, fontWeight: '600' },
});
