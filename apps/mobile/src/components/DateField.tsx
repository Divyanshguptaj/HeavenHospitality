import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { layout, useTheme } from '../theme';
import { Button } from './ui';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

function toDateOnly(year: number, month: number, day: number): string {
  return `${String(year)}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * A date field that opens a calendar rather than asking for typed YYYY-MM-DD —
 * the format is easy to get subtly wrong by hand, and a mistyped date fails
 * validation with no clue which part was off.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  clearable = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly clearable?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const parsed = parseDateOnly(value);
  const now = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? now.getMonth());

  function openPicker(): void {
    const current = parseDateOnly(value);
    const today = new Date();
    setViewYear(current?.year ?? today.getFullYear());
    setViewMonth(current?.month ?? today.getMonth());
    setOpen(true);
  }

  function changeMonth(delta: number): void {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  const grid = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= total; day++) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const displayValue =
    parsed === null
      ? ''
      : `${MONTH_LABELS[parsed.month]!.slice(0, 3)} ${String(parsed.day)}, ${String(parsed.year)}`;

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={openPicker}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          style={[styles.inputText, { color: displayValue === '' ? theme.textMuted : theme.textPrimary }]}
        >
          {displayValue === '' ? placeholder : displayValue}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={theme.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheetShadow, { backgroundColor: theme.textPrimary }]} onPress={() => undefined}>
            <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.borderStrong }]}>
              <View style={styles.header}>
                <Pressable onPress={() => changeMonth(-1)} accessibilityLabel="Previous month" hitSlop={8}>
                  <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
                </Pressable>
                <Text style={[styles.headerLabel, { color: theme.textPrimary }]}>
                  {MONTH_LABELS[viewMonth]} {viewYear}
                </Text>
                <Pressable onPress={() => changeMonth(1)} accessibilityLabel="Next month" hitSlop={8}>
                  <Ionicons name="chevron-forward" size={22} color={theme.textPrimary} />
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <Text
                    key={`${weekday}-${String(index)}`}
                    style={[styles.weekdayLabel, { color: theme.textMuted }]}
                  >
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.daysGrid}>
                {grid.map((day, index) => {
                  const isSelected =
                    day !== null &&
                    parsed !== null &&
                    parsed.year === viewYear &&
                    parsed.month === viewMonth &&
                    parsed.day === day;
                  return (
                    <Pressable
                      key={index}
                      disabled={day === null}
                      onPress={() => {
                        if (day === null) return;
                        onChange(toDateOnly(viewYear, viewMonth, day));
                        setOpen(false);
                      }}
                      style={[styles.dayCell, isSelected && { backgroundColor: theme.primary }]}
                    >
                      {day !== null && (
                        <Text
                          style={[styles.dayText, { color: isSelected ? theme.textInverse : theme.textPrimary }]}
                        >
                          {day}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.footer}>
                {clearable && (
                  <Button
                    label="Clear"
                    variant="secondary"
                    onPress={() => {
                      onChange('');
                      setOpen(false);
                    }}
                  />
                )}
                <Button
                  label="Today"
                  variant="secondary"
                  onPress={() => {
                    const today = new Date();
                    onChange(toDateOnly(today.getFullYear(), today.getMonth(), today.getDate()));
                    setOpen(false);
                  }}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: layout.spacing[2] },
  fieldLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: { fontSize: layout.fontSize.md },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.spacing[6],
  },
  sheetShadow: { borderRadius: layout.radius.xl, padding: 3 },
  sheet: {
    width: 320,
    maxWidth: '100%',
    borderRadius: layout.radius.xl,
    borderWidth: 1,
    padding: layout.spacing[5],
    gap: layout.spacing[4],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontSize: layout.fontSize.md, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: layout.fontSize.xs,
    fontWeight: '600',
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.radius.full,
  },
  dayText: { fontSize: layout.fontSize.sm },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: layout.spacing[2] },
});
