import { DAY_NAMES, MEAL_LABELS, MEAL_TYPES, type MealTypeName } from '@heaven/contracts';
import { useState } from 'react';

import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  StatTile,
  formatDate,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import {
  useMealCounts,
  useMenu,
  useSettings,
  useUpdateMealTiming,
  useUpdateMenu,
} from '../lib/ownerApi';

/**
 * Mess: the weekly menu, meal timings, and how many to cook for.
 *
 * Editing is inline — a dish list is not worth a modal, and the owner updates
 * this often enough that friction would show.
 */
export function MessPage() {
  const menu = useMenu();
  const counts = useMealCounts();
  const settings = useSettings();

  if (menu.isPending || counts.isPending) {
    return (
      <>
        <PageHeader title="Mess" />
        <LoadingRows rows={8} />
      </>
    );
  }

  if (menu.error) {
    return (
      <>
        <PageHeader title="Mess" />
        <Card>
          <ErrorState message={menu.error.message} onRetry={() => void menu.refetch()} />
        </Card>
      </>
    );
  }

  const todayWeekday = ((new Date().getUTCDay() + 6) % 7) + 1;

  return (
    <>
      <PageHeader title="Mess" description="Weekly menu, meal timings and expected counts." />

      {counts.data !== undefined && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {counts.data.counts.map((count) => (
            <StatTile
              key={count.mealType}
              label={`${MEAL_LABELS[count.mealType]} today`}
              value={String(count.expected)}
              hint={count.absent === 0 ? 'no absences' : `${count.absent} away`}
            />
          ))}
          <StatTile
            label="Active residents"
            value={String(counts.data.totalActiveResidents)}
            hint={formatDate(counts.data.date)}
          />
        </div>
      )}

      <div className="mb-4">
        <Card title="Meal timings">
          <div className="grid gap-3 sm:grid-cols-3">
            {MEAL_TYPES.map((mealType) => {
              const timing = settings.data?.mess.timings.find((t) => t.mealType === mealType);
              return (
                <TimingEditor
                  key={mealType}
                  mealType={mealType}
                  startsAt={timing?.startsAt ?? '08:00'}
                  endsAt={timing?.endsAt ?? '09:30'}
                />
              );
            })}
          </div>
          <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-text-muted)]">
            Residents can change their absence until{' '}
            {settings.data?.mess.mealCutoffLocalTime ?? '21:00'} — adjust that in Settings.
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {menu.data.map((day) => (
          <DayEditor key={day.dayOfWeek} day={day} isToday={day.dayOfWeek === todayWeekday} />
        ))}
      </div>
    </>
  );
}

function TimingEditor({
  mealType,
  startsAt,
  endsAt,
}: {
  readonly mealType: MealTypeName;
  readonly startsAt: string;
  readonly endsAt: string;
}) {
  const updateTiming = useUpdateMealTiming();
  const [form, setForm] = useState({ startsAt, endsAt });
  const dirty = form.startsAt !== startsAt || form.endsAt !== endsAt;

  return (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <p className="mb-2 text-sm font-medium text-[var(--color-text-primary)]">
        {MEAL_LABELS[mealType]}
      </p>
      <div className="flex items-end gap-2">
        <Field label="From" htmlFor={`start-${mealType}`}>
          <Input
            id={`start-${mealType}`}
            type="time"
            value={form.startsAt}
            onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
          />
        </Field>
        <Field label="To" htmlFor={`end-${mealType}`}>
          <Input
            id={`end-${mealType}`}
            type="time"
            value={form.endsAt}
            onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
          />
        </Field>
      </div>
      {dirty && (
        <Button
          variant="primary"
          className="mt-2 w-full"
          disabled={updateTiming.isPending}
          onClick={() => {
            void updateTiming.mutateAsync({ mealType, ...form });
          }}
        >
          {updateTiming.isPending ? 'Saving…' : 'Save'}
        </Button>
      )}
    </div>
  );
}

function DayEditor({
  day,
  isToday,
}: {
  readonly day: {
    dayOfWeek: number;
    meals: ReadonlyArray<{ mealType: MealTypeName; items: readonly string[] }>;
  };
  readonly isToday: boolean;
}) {
  return (
    <Card
      title={`${DAY_NAMES[day.dayOfWeek] ?? ''}${isToday ? ' · today' : ''}`}
      className={isToday ? 'border-[var(--color-primary)]' : ''}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {MEAL_TYPES.map((mealType) => {
          const meal = day.meals.find((candidate) => candidate.mealType === mealType);
          return (
            <MealEditor
              key={mealType}
              dayOfWeek={day.dayOfWeek}
              mealType={mealType}
              items={meal?.items ?? []}
            />
          );
        })}
      </div>
    </Card>
  );
}

function MealEditor({
  dayOfWeek,
  mealType,
  items,
}: {
  readonly dayOfWeek: number;
  readonly mealType: MealTypeName;
  readonly items: readonly string[];
}) {
  const updateMenu = useUpdateMenu();
  // Comma-separated is the fastest way to edit a dish list, and matches how a
  // menu is written down anyway. The owner never sees JSON.
  const [value, setValue] = useState(items.join(', '));
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== items.join(', ');

  async function save(): Promise<void> {
    setError(null);
    const parsed = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');

    try {
      await updateMenu.mutateAsync({ dayOfWeek, mealType, items: parsed });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <div>
      <Field
        label={MEAL_LABELS[mealType]}
        htmlFor={`menu-${String(dayOfWeek)}-${mealType}`}
        hint={dirty ? undefined : 'Separate dishes with commas'}
        error={error ?? undefined}
      >
        <Input
          id={`menu-${String(dayOfWeek)}-${mealType}`}
          value={value}
          placeholder="Not set"
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            if (dirty) void save();
          }}
        />
      </Field>
      {dirty && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {updateMenu.isPending ? 'Saving…' : 'Click away to save'}
        </p>
      )}
    </div>
  );
}
