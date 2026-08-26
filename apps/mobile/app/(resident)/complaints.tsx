import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUS_LABELS,
  type ComplaintCategoryName,
} from '@heaven/contracts';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  useCreateComplaint,
  useResidentComplaint,
  useResidentComplaints,
} from '../../src/api/resident';
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

/** The resident's own complaints — raising one, and following what happens next. */
export default function ComplaintsScreen() {
  const complaints = useResidentComplaints();
  const [composeOpen, setComposeOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Screen onRefresh={() => void complaints.refetch()} refreshing={complaints.isRefetching}>
      <PageHeading
        title="Complaints"
        subtitle="Report something that needs fixing and follow its progress."
      />

      <Button label="Raise a complaint" onPress={() => setComposeOpen(true)} />

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
      ) : (complaints.data ?? []).length === 0 ? (
        <Card>
          <EmptyState message="You have not raised any complaints. Tap the button above if something needs attention." />
        </Card>
      ) : (
        (complaints.data ?? []).map((complaint) => (
          <Pressable key={complaint.id} onPress={() => setOpenId(complaint.id)}>
            <Card>
              <View style={styles.row}>
                <CardTitle>{complaint.title}</CardTitle>
                <Badge
                  label={COMPLAINT_STATUS_LABELS[complaint.status]}
                  tone={statusTone(complaint.status)}
                />
              </View>
              <Muted>
                {COMPLAINT_CATEGORY_LABELS[complaint.category]} · {complaint.createdAt.slice(0, 10)}
              </Muted>
            </Card>
          </Pressable>
        ))
      )}

      {composeOpen && <ComposeComplaint onClose={() => setComposeOpen(false)} />}
      {openId !== null && <ComplaintDetail id={openId} onClose={() => setOpenId(null)} />}
    </Screen>
  );
}

function ComposeComplaint({ onClose }: { readonly onClose: () => void }) {
  const theme = useTheme();
  const createComplaint = useCreateComplaint();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ComplaintCategoryName>('PLUMBING');
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    title.trim().length >= 3 && description.trim().length >= 5 && !createComplaint.isPending;

  async function submit(): Promise<void> {
    setError(null);
    try {
      await createComplaint.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        category,
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not send. Please try again.',
      );
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
  ];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: theme.canvas }}
        contentContainerStyle={styles.modalContent}
      >
        <PageHeading title="Raise a complaint" />

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>What is the problem?</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={inputStyle}
            placeholder="Tap leaking in bathroom"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Complaint title"
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
          <View style={styles.categories}>
            {COMPLAINT_CATEGORIES.map((value) => {
              const selected = value === category;
              return (
                <Pressable
                  key={value}
                  onPress={() => setCategory(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.category,
                    {
                      backgroundColor: selected ? theme.primary : theme.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryLabel,
                      { color: selected ? theme.textInverse : theme.textSecondary },
                    ]}
                  >
                    {COMPLAINT_CATEGORY_LABELS[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Details</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[...inputStyle, styles.textarea]}
            placeholder="It has been dripping since yesterday evening."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            accessibilityLabel="Complaint details"
          />
        </View>

        {error !== null && (
          <View
            accessibilityRole="alert"
            style={[styles.errorBox, { backgroundColor: theme.dangerSubtle }]}
          >
            <Text style={{ color: theme.danger }}>{error}</Text>
          </View>
        )}

        <Button
          label={createComplaint.isPending ? 'Sending…' : 'Send to the manager'}
          onPress={() => void submit()}
        />
        <Button label="Cancel" variant="secondary" onPress={onClose} />

        {!canSubmit && title !== '' && (
          <Muted>Add a short title and a little more detail before sending.</Muted>
        )}
      </ScrollView>
    </Modal>
  );
}

function ComplaintDetail({ id, onClose }: { readonly id: string; readonly onClose: () => void }) {
  const theme = useTheme();
  const { data, error, isPending } = useResidentComplaint(id);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: theme.canvas }}
        contentContainerStyle={styles.modalContent}
      >
        {isPending ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            message={error instanceof ApiRequestError ? error.message : 'Please try again.'}
            onRetry={onClose}
          />
        ) : (
          <>
            <PageHeading
              title={data.title}
              subtitle={`${COMPLAINT_CATEGORY_LABELS[data.category]} · raised ${data.createdAt.slice(0, 10)}`}
            />

            <Card>
              <View style={styles.row}>
                <CardTitle>Status</CardTitle>
                <Badge
                  label={COMPLAINT_STATUS_LABELS[data.status]}
                  tone={statusTone(data.status)}
                />
              </View>
              <Body>{data.description}</Body>
            </Card>

            <Card>
              <CardTitle>What has happened</CardTitle>
              {data.events.map((event) => (
                <View key={event.id} style={styles.event}>
                  <Text style={[styles.eventTitle, { color: theme.textPrimary }]}>
                    {event.toStatus === null
                      ? 'Note added'
                      : COMPLAINT_STATUS_LABELS[event.toStatus]}
                  </Text>
                  {event.note !== null && <Body>{event.note}</Body>}
                  <Muted>
                    {event.actorName ?? 'System'} · {event.createdAt.slice(0, 10)}
                  </Muted>
                </View>
              ))}
            </Card>
          </>
        )}

        <Button label="Close" variant="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[4],
  },
  modalContent: { padding: layout.spacing[5], gap: layout.spacing[5] },
  field: { gap: layout.spacing[2] },
  label: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  input: {
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    fontSize: layout.fontSize.md,
  },
  textarea: { minHeight: 120, paddingTop: layout.spacing[4] },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.spacing[2] },
  category: {
    borderRadius: layout.radius.full,
    paddingHorizontal: layout.spacing[5],
    paddingVertical: layout.spacing[3],
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  categoryLabel: { fontSize: layout.fontSize.sm, fontWeight: '600' },
  errorBox: { padding: layout.spacing[4], borderRadius: layout.radius.lg },
  event: { gap: layout.spacing[1], paddingVertical: layout.spacing[2] },
  eventTitle: { fontSize: layout.fontSize.md, fontWeight: '600' },
});
