import {
  formatIndianPhone,
  normalizeIndianPhone,
  type ResidentCandidateView,
} from '@heaven/contracts';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { searchResidentCandidates } from '../api/owner';
import { ApiRequestError } from '../lib/apiClient';
import { layout, useTheme } from '../theme';
import { Badge, FormField, Muted } from './ui';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 350;

interface ResidentSearchProps {
  readonly label?: string;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
  /** Shown when nobody matches. */
  readonly noMatchHint: string;
  /** The chosen person, or null once the choice is cleared by typing again. */
  readonly onSelect: (candidate: ResidentCandidateView | null) => void;
  /**
   * Called when a search finds nobody. The argument is the typed number in the
   * form the server stores it, or null when what was typed is not a full number.
   */
  readonly onNoMatch?: (phone: string | null) => void;
}

/**
 * Finds a person by name or phone number and lists everyone who matches, so the
 * right one can be picked by name and contact. Searches as you type.
 */
export function ResidentSearch({
  label = 'Name or phone number',
  placeholder = 'Type a name or number',
  autoFocus = false,
  noMatchHint,
  onSelect,
  onNoMatch,
}: ResidentSearchProps) {
  const theme = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResidentCandidateView[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The parent re-creates these every render; keeping the latest in a ref stops
  // that from restarting the search.
  const onNoMatchRef = useRef(onNoMatch);
  useEffect(() => {
    onNoMatchRef.current = onNoMatch;
  });

  useEffect(() => {
    const text = query.trim();
    if (selectedId !== null) return undefined;

    if (text.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setSearching(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(() => {
      searchResidentCandidates(text)
        .then((list) => {
          if (cancelled) return;
          setResults(list);
          setError(null);
          onNoMatchRef.current?.(list.length === 0 ? normalizeIndianPhone(text) : null);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setError(caught instanceof ApiRequestError ? caught.message : 'Could not search.');
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selectedId]);

  function handleChange(value: string): void {
    setQuery(value);
    if (selectedId !== null) {
      setSelectedId(null);
      onSelect(null);
    }
    onNoMatchRef.current?.(null);
  }

  function choose(candidate: ResidentCandidateView): void {
    setSelectedId(candidate.id);
    onSelect(candidate);
  }

  return (
    <View style={styles.wrapper}>
      <FormField
        label={label}
        value={query}
        onChangeText={handleChange}
        placeholder={placeholder}
        autoCapitalize="none"
        autoFocus={autoFocus}
      />

      {searching && <Muted>Searching…</Muted>}
      {error !== null && <Muted>{error}</Muted>}

      {results !== null && results.length === 0 && !searching && <Muted>{noMatchHint}</Muted>}

      {results !== null && results.length > 0 && (
        <View style={styles.list}>
          <Muted>
            {results.length === 1 ? '1 match — tap to choose' : `${String(results.length)} matches — tap one to choose`}
          </Muted>
          {results.map((person) => {
            const selected = person.id === selectedId;
            const contact = person.phone === null ? '' : formatIndianPhone(person.phone);
            return (
              <Pressable
                key={person.id}
                onPress={() => choose(person)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${person.fullName}, ${contact}`}
                style={[
                  styles.row,
                  {
                    backgroundColor: selected ? theme.surfaceSubtle : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: theme.textPrimary }]}>{person.fullName}</Text>
                  <Text style={[styles.contact, { color: theme.textSecondary }]}>{contact}</Text>
                  {person.email !== null && (
                    <Text style={[styles.email, { color: theme.textMuted }]}>{person.email}</Text>
                  )}
                </View>
                {person.activeTenancyId !== null && (
                  <Badge
                    label={person.hasBed ? 'Already a resident' : 'Needs a bed'}
                    tone={person.hasBed ? 'danger' : 'warning'}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: layout.spacing[3] },
  list: { gap: layout.spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layout.spacing[3],
    minHeight: layout.minTouchTarget,
    borderWidth: 1,
    borderRadius: layout.radius.lg,
    paddingHorizontal: layout.spacing[4],
    paddingVertical: layout.spacing[3],
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: layout.fontSize.md, fontWeight: '600' },
  contact: { fontSize: layout.fontSize.sm },
  email: { fontSize: layout.fontSize.xs },
});
