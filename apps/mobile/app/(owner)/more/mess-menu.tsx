import { DAY_NAMES, MEAL_LABELS, MEAL_TYPES, type MealTypeName } from '@heaven/contracts';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOwnerMenu, useOwnerSettings, useUpdateMealTiming, useUpdateMenuDay } from '../../../src/api/owner';
import {
  Accordion,
  Button,
  Card,
  CardTitle,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout } from '../../../src/theme';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The weekly menu and meal timings — exactly what a guest reads on the
 * public Menu page, edited here instead of by hand in the database.
 */
export default function MessMenuScreen() {
  const menu = useOwnerMenu();
  const settings = useOwnerSettings();

  if (menu.isPending || settings.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading the menu…" />
      </Screen>
    );
  }

  if (menu.error || settings.error || menu.data === undefined || settings.data === undefined) {
    const error = menu.error ?? settings.error;
    return (
      <Screen>
        <ErrorState
          message={error instanceof ApiRequestError ? error.message : 'Please try again.'}
          onRetry={() => {
            void menu.refetch();
            void settings.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => void menu.refetch()} refreshing={menu.isRefetching}>
      <PageHeading title="Mess menu" subtitle="What's served, and when." />

      <Card>
        <CardTitle>Meal timings</CardTitle>
        {settings.data.mess.timings.length === 0 ? (
          <Muted>No timings set yet — add one for each meal below.</Muted>
        ) : null}
        {MEAL_TYPES.map((mealType) => {
          const timing = settings.data.mess.timings.find((t) => t.mealType === mealType);
          return <TimingRow key={mealType} mealType={mealType} startsAt={timing?.startsAt ?? ''} endsAt={timing?.endsAt ?? ''} />;
        })}
      </Card>

      {DAYS.map((dayOfWeek) => {
        const day = menu.data?.find((d) => d.dayOfWeek === dayOfWeek);
        const mealsSet = day?.meals.length ?? 0;
        return (
          <Accordion
            key={dayOfWeek}
            title={DAY_NAMES[dayOfWeek] ?? `Day ${String(dayOfWeek)}`}
            subtitle={mealsSet === 0 ? 'Nothing set' : `${String(mealsSet)} meal${mealsSet === 1 ? '' : 's'} set`}
          >
            {MEAL_TYPES.map((mealType) => {
              const meal = day?.meals.find((m) => m.mealType === mealType);
              return (
                <MealRow
                  key={mealType}
                  dayOfWeek={dayOfWeek}
                  mealType={mealType}
                  initialItems={meal?.items ?? []}
                />
              );
            })}
          </Accordion>
        );
      })}
    </Screen>
  );
}

function MealRow({
  dayOfWeek,
  mealType,
  initialItems,
}: {
  readonly dayOfWeek: number;
  readonly mealType: MealTypeName;
  readonly initialItems: readonly string[];
}) {
  const updateMenuDay = useUpdateMenuDay();
  const [text, setText] = useState(initialItems.join(', '));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(initialItems.join(', '));
  }, [initialItems]);

  async function save(): Promise<void> {
    setError(null);
    const items = text
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
    try {
      await updateMenuDay.mutateAsync({ dayOfWeek, mealType, items });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <View style={styles.mealRow}>
      <FormField
        label={MEAL_LABELS[mealType]}
        value={text}
        onChangeText={setText}
        placeholder="Comma-separated, e.g. Poha, Tea"
      />
      {error !== null && <Muted>{error}</Muted>}
      <Button label={updateMenuDay.isPending ? 'Saving…' : 'Save'} variant="secondary" onPress={() => void save()} />
    </View>
  );
}

function TimingRow({
  mealType,
  startsAt,
  endsAt,
}: {
  readonly mealType: MealTypeName;
  readonly startsAt: string;
  readonly endsAt: string;
}) {
  const updateTiming = useUpdateMealTiming();
  const [starts, setStarts] = useState(startsAt);
  const [ends, setEnds] = useState(endsAt);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setError(null);
    try {
      await updateTiming.mutateAsync({ mealType, startsAt: starts, endsAt: ends });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <View style={styles.timingRow}>
      <Muted>{MEAL_LABELS[mealType]}</Muted>
      <View style={styles.timingFields}>
        <View style={styles.grow}>
          <FormField label="Starts" value={starts} onChangeText={setStarts} placeholder="08:00" />
        </View>
        <View style={styles.grow}>
          <FormField label="Ends" value={ends} onChangeText={setEnds} placeholder="09:30" />
        </View>
        <Button label={updateTiming.isPending ? '…' : 'Save'} variant="secondary" onPress={() => void save()} />
      </View>
      {error !== null && <Muted>{error}</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  mealRow: { gap: layout.spacing[2] },
  timingRow: { gap: layout.spacing[2] },
  timingFields: { flexDirection: 'row', gap: layout.spacing[3], alignItems: 'flex-end' },
  grow: { flex: 1 },
});
