import { MEAL_LABELS } from '@heaven/contracts';
import { formatINR } from '@heaven/money';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useResidentHome } from '../../src/api/resident';
import { isResidentExperience, useAuthStore } from '../../src/auth/authStore';
import {
  Badge,
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../src/components/ui';
import { ApiRequestError } from '../../src/lib/apiClient';
import { layout, useTheme } from '../../src/theme';

/**
 * The resident's home screen.
 *
 * Ordered by what a resident actually opens the app for: what do I owe, what is
 * for dinner, is anything happening. Everything below the fold is detail.
 */
export default function ResidentHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const { data, error, isPending, refetch, isRefetching } = useResidentHome();

  // The owner has an account but no stay; point them at the console rather than
  // showing an error.
  if (user !== null && !isResidentExperience(user)) {
    return (
      <Screen>
        <PageHeading title={`Hello, ${user.fullName}`} />
        <Card>
          <View style={styles.row}>
            <CardTitle>Owner account</CardTitle>
            <Badge label={user.primaryRole} tone="warning" />
          </View>
          <Body>
            This app is for residents. Property operations — residents, billing, occupancy and
            reports — are managed from the admin console on a computer.
          </Body>
        </Card>
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your stay…" />
      </Screen>
    );
  }

  if (error) {
    const notResident = error instanceof ApiRequestError && error.code === 'TENANCY_NOT_ACTIVE';
    return (
      <Screen>
        {notResident ? (
          <Card>
            <CardTitle>No active stay</CardTitle>
            <Body>
              This account is not currently allocated to a room. Please contact the property
              manager.
            </Body>
          </Card>
        ) : (
          <ErrorState
            message={error instanceof ApiRequestError ? error.message : 'Please try again.'}
            onRetry={() => void refetch()}
          />
        )}
      </Screen>
    );
  }

  const owes = data.outstandingPaise > 0;

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <PageHeading
        title={`Hello, ${data.resident.fullName.split(' ')[0] ?? data.resident.fullName}`}
        subtitle={
          data.placement === null
            ? 'You are not allocated to a room yet.'
            : `Room ${data.placement.roomNumber} · Bed ${data.placement.bedLabel} · ${data.placement.floorName}`
        }
      />

      {/* Money first — it is the reason most residents open the app. */}
      <Card style={owes ? { borderColor: theme.danger } : undefined}>
        <View style={styles.row}>
          <CardTitle>{owes ? 'You owe' : 'All settled'}</CardTitle>
          <Badge label={owes ? 'Payment due' : 'Nothing due'} tone={owes ? 'danger' : 'success'} />
        </View>

        <Text style={[styles.amount, { color: owes ? theme.danger : theme.success }]}>
          {formatINR(data.outstandingPaise, { withPaise: false })}
        </Text>

        {data.currentInvoice !== null && (
          <Muted>
            {data.currentInvoice.number} · due {data.currentInvoice.dueDate}
          </Muted>
        )}

        <Button
          label={owes ? 'View bill and pay' : 'View bills'}
          onPress={() => router.push('/(resident)/rent')}
        />
      </Card>

      <Card>
        <CardTitle>Today&apos;s meals</CardTitle>
        {data.todaysMenu.map((meal) => (
          <View key={meal.mealType} style={styles.meal}>
            <View style={styles.mealHeader}>
              <Text style={[styles.mealName, { color: theme.textMuted }]}>
                {MEAL_LABELS[meal.mealType]}
                {meal.startsAt !== null && ` · ${meal.startsAt}`}
              </Text>
              {meal.isAbsent && <Badge label="You're away" tone="warning" />}
            </View>
            <Text style={[styles.mealItems, { color: theme.textPrimary }]}>
              {meal.items.length === 0 ? 'Not set' : meal.items.join(' · ')}
            </Text>
          </View>
        ))}
        <Button
          label="Mark an absence"
          variant="secondary"
          onPress={() => router.push('/(resident)/mess')}
        />
      </Card>

      {data.notices.length > 0 && (
        <Card>
          <CardTitle>Notices</CardTitle>
          {data.notices.map((notice) => (
            <View key={notice.id} style={styles.notice}>
              <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>{notice.title}</Text>
              <Body>{notice.body}</Body>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <CardTitle>Your complaints</CardTitle>
        <DetailRow label="Open" value={String(data.complaints.open)} />
        <DetailRow label="In progress" value={String(data.complaints.inProgress)} />
        <DetailRow label="Resolved" value={String(data.complaints.resolved)} />
        <Button
          label="Raise a complaint"
          variant="secondary"
          onPress={() => router.push('/(resident)/complaints')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  amount: {
    fontSize: layout.fontSize['3xl'],
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  meal: { gap: layout.spacing[1] },
  mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealName: { fontSize: layout.fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  mealItems: {
    fontSize: layout.fontSize.md,
    lineHeight: layout.fontSize.md * layout.lineHeight.normal,
  },
  notice: { gap: layout.spacing[1] },
  noticeTitle: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
