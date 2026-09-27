import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
} from '@heaven/contracts';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useOwnerComplaints, useUpdateComplaintStatus } from '../../src/api/owner';
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

function statusTone(status: string): 'danger' | 'warning' | 'success' | 'neutral' {
  if (status === 'OPEN') return 'danger';
  if (status === 'IN_PROGRESS') return 'warning';
  if (status === 'RESOLVED') return 'success';
  return 'neutral';
}

/** Issues: what residents have reported, dealt with while walking around. */
export default function OwnerIssuesScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState('ALL');
  const complaints = useOwnerComplaints(filter);
  const updateStatus = useUpdateComplaintStatus();

  const rows = complaints.data ?? [];

  function advance(id: string, title: string, current: string): void {
    const next = COMPLAINT_STATUSES.filter((status) => status !== current);

    Alert.alert(title, 'Move this complaint to:', [
      ...next.map((status) => ({
        text: COMPLAINT_STATUS_LABELS[status],
        onPress: () => {
          updateStatus.mutateAsync({ id, status }).catch((error: unknown) => {
            Alert.alert(
              'Could not update',
              error instanceof ApiRequestError ? error.message : 'Please try again.',
            );
          });
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Screen onRefresh={() => void complaints.refetch()} refreshing={complaints.isRefetching}>
      <PageHeading title="Issues" subtitle="Complaints from residents." />

      <Card>
        <CardTitle>Filter</CardTitle>
        <View style={styles.filters}>
          {(['ALL', ...COMPLAINT_STATUSES] as const).map((status) => {
            const active = status === filter;
            return (
              <Pressable
                key={status}
                onPress={() => setFilter(status)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filter,
                  { backgroundColor: active ? theme.primary : theme.surfaceSubtle },
                ]}
              >
                <Text
                  style={{
                    color: active ? theme.textInverse : theme.textSecondary,
                    fontSize: layout.fontSize.sm,
                    fontWeight: '600',
                  }}
                >
                  {status === 'ALL' ? 'All' : COMPLAINT_STATUS_LABELS[status]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {complaints.isPending ? (
        <LoadingState />
      ) : complaints.error ? (
        <ErrorState
          message={
            complaints.error instanceof ApiRequestError
              ? complaints.error.message
              : 'Please try again.'
          }
          onRetry={() => void complaints.refetch()}
        />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState message="Nothing to deal with right now." />
        </Card>
      ) : (
        rows.map((complaint) => (
          <Card key={complaint.id}>
            <View style={styles.headerRow}>
              <CardTitle>{complaint.title}</CardTitle>
              <Badge
                label={COMPLAINT_STATUS_LABELS[complaint.status]}
                tone={statusTone(complaint.status)}
              />
            </View>

            <Body>{complaint.description}</Body>
            {complaint.imageUrl !== null && (
              <Image
                source={{ uri: complaint.imageUrl }}
                style={[styles.photo, { backgroundColor: theme.surfaceSubtle }]}
                resizeMode="contain"
                accessibilityLabel={`Photo attached to ${complaint.title}`}
              />
            )}
            <Muted>
              {COMPLAINT_CATEGORY_LABELS[complaint.category]} · {complaint.residentName}
              {complaint.roomNumber !== null && ` · room ${complaint.roomNumber}`} · raised{' '}
              {complaint.createdAt.slice(0, 10)}
            </Muted>

            <Button
              label="Change status"
              variant="secondary"
              onPress={() => advance(complaint.id, complaint.title, complaint.status)}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[3],
  },
  photo: { width: '100%', height: 260, borderRadius: layout.radius.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  filter: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[5],
    paddingVertical: layout.spacing[3],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
});
