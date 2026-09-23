import type { ApplicantView } from '@heaven/contracts';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOwnerApplicants } from '../../../src/api/owner';
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Muted,
  PageHeading,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout, useTheme } from '../../../src/theme';

/**
 * People who signed up and completed the admission form but hold no tenancy
 * yet — invisible to Residents, which lists tenancies, not accounts.
 */
export default function ApplicantsScreen() {
  const theme = useTheme();
  // No screen has a native header, so nothing else reserves this space — a
  // pushed Stack screen (unlike a Tab's own root) needs it added by hand.
  const insets = useSafeAreaInsets();
  const applicants = useOwnerApplicants();
  const rows = applicants.data ?? [];

  return (
    <FlatList
      data={rows}
      keyExtractor={(applicant) => applicant.userId}
      contentContainerStyle={[styles.screenContent, { paddingTop: insets.top + layout.spacing[5] }]}
      style={{ backgroundColor: theme.canvas }}
      refreshControl={
        <RefreshControl refreshing={applicants.isRefetching} onRefresh={() => void applicants.refetch()} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <PageHeading
            title="Applicants"
            subtitle={`${rows.length} completed the form and are waiting on a room.`}
          />
          {applicants.isPending && <LoadingState />}
          {applicants.error && (
            <ErrorState
              message={
                applicants.error instanceof ApiRequestError ? applicants.error.message : 'Please try again.'
              }
              onRetry={() => void applicants.refetch()}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        applicants.isPending || applicants.error ? null : (
          <Card>
            <EmptyState message="Nobody is waiting on a room right now." />
          </Card>
        )
      }
      renderItem={({ item }) => <ApplicantRow applicant={item} />}
    />
  );
}

function ApplicantRow({ applicant }: { readonly applicant: ApplicantView }) {
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/(owner)/more/applicant-details', params: { userId: applicant.userId } })
      }
      accessibilityRole="button"
      accessibilityLabel={`${applicant.fullName}. View submitted details.`}
    >
      <Card style={styles.card}>
        <CardTitle>{applicant.fullName}</CardTitle>
        <Muted>{applicant.phone ?? applicant.email ?? 'No contact details'}</Muted>
        {applicant.registration.completedAt !== null && (
          <Muted>Submitted {applicant.registration.completedAt.slice(0, 10)}</Muted>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: layout.spacing[5], gap: layout.spacing[5], paddingBottom: layout.spacing[10] },
  header: { gap: layout.spacing[5], marginBottom: layout.spacing[5] },
  card: { marginBottom: layout.spacing[5], gap: layout.spacing[2] },
});
