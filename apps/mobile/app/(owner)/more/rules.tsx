import type { RuleView } from '@heaven/contracts';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useCreateRule, useDeleteRule, useOwnerRules, useUpdateRule } from '../../../src/api/owner';
import {
  Accordion,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Muted,
  PageHeading,
  Screen,
} from '../../../src/components/ui';
import { ApiRequestError } from '../../../src/lib/apiClient';
import { layout } from '../../../src/theme';

/** What you ask of everyone who lives here — exactly what the public House rules page reads. */
export default function RulesScreen() {
  const rules = useOwnerRules();

  return (
    <Screen onRefresh={() => void rules.refetch()} refreshing={rules.isRefetching}>
      <PageHeading title="House rules" subtitle="What you ask of everyone who lives here." />

      {rules.isPending ? (
        <LoadingState />
      ) : rules.error ? (
        <ErrorState
          message={rules.error instanceof ApiRequestError ? rules.error.message : 'Please try again.'}
          onRetry={() => void rules.refetch()}
        />
      ) : (
        <>
          {rules.data.length === 0 ? (
            <Card>
              <EmptyState message="No rules listed yet." />
            </Card>
          ) : (
            rules.data.map((rule) => <RuleRow key={rule.id} rule={rule} />)
          )}

          <AddRuleForm />
        </>
      )}
    </Screen>
  );
}

function RuleRow({ rule }: { readonly rule: RuleView }) {
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  const [title, setTitle] = useState(rule.title);
  const [description, setDescription] = useState(rule.description);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setError(null);
    try {
      await updateRule.mutateAsync({ id: rule.id, title: title.trim(), description: description.trim() });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  function confirmDelete(): void {
    Alert.alert('Remove this rule?', `"${rule.title}" will no longer show on the public page.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteRule.mutateAsync(rule.id).catch((caught: unknown) => {
            Alert.alert('Could not remove', caught instanceof ApiRequestError ? caught.message : 'Please try again.');
          });
        },
      },
    ]);
  }

  return (
    <Accordion title={rule.title} subtitle={rule.isActive ? undefined : 'Hidden from the public page'}>
      <FormField label="Title" value={title} onChangeText={setTitle} />
      <FormField label="Description" value={description} onChangeText={setDescription} />

      <View style={{ gap: layout.spacing[2] }}>
        <Muted>Visible on the public page</Muted>
        <Button
          label={rule.isActive ? 'Hide' : 'Show'}
          variant="secondary"
          onPress={() => updateRule.mutateAsync({ id: rule.id, isActive: !rule.isActive }).catch(() => undefined)}
        />
      </View>

      {error !== null && <Muted>{error}</Muted>}

      <View style={{ flexDirection: 'row', gap: layout.spacing[2], justifyContent: 'flex-end' }}>
        <Button label="Remove" variant="secondary" onPress={confirmDelete} />
        <Button label={updateRule.isPending ? 'Saving…' : 'Save'} onPress={() => void save()} />
      </View>
    </Accordion>
  );
}

function AddRuleForm() {
  const createRule = useCreateRule();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (title.trim() === '' || description.trim() === '') return;
    setError(null);
    try {
      await createRule.mutateAsync({ title: title.trim(), description: description.trim() });
      setTitle('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add the rule.');
    }
  }

  return (
    <Card>
      <CardTitle>Add a rule</CardTitle>
      <FormField label="Title" value={title} onChangeText={setTitle} placeholder="No smoking indoors" />
      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="A sentence or two" />
      {error !== null && <Muted>{error}</Muted>}
      <Button label={createRule.isPending ? 'Adding…' : 'Add rule'} onPress={() => void submit()} />
    </Card>
  );
}
