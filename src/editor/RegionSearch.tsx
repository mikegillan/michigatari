import { useRef, useState } from 'react';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { RegionCandidate } from '../providers/nominatim';
import { appConfig } from '../config';
import { createRegion } from './elementDefaults';
import { errorMessage } from './errors';
import { useEditorStore } from './store';

export function RegionSearch() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const mode = useEditorStore((s) => s.mode);
  const addElement = useEditorStore((s) => s.addElement);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegionCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  // Tracks the latest query across renders so an in-flight search can tell
  // whether it's stale once it resolves (see runSearch below).
  const queryRef = useRef(query);
  queryRef.current = query;

  const runSearch = async () => {
    const q = query;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await appConfig.searchRegions(q);
      if (queryRef.current === q) setResults(r);
    } catch (err) {
      if (queryRef.current === q) {
        notifications.show({ color: 'red', title: 'Region search failed', message: errorMessage(err) });
      }
    } finally {
      if (queryRef.current === q) setSearching(false);
    }
  };

  const add = (candidate: RegionCandidate) => {
    const firstKf = useEditorStore.getState().project.keyframes[0]?.id;
    if (!firstKf) return;
    addElement(createRegion(candidate, firstKf));
    setQuery('');
    setResults([]);
  };

  const disabled = !hasKeyframes || mode === 'preview';

  return (
    <Stack gap={4}>
      <TextInput
        size="xs" label="Add region outline" placeholder="Search: Hokkaido, Osaka Prefecture…"
        value={query} onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
        disabled={disabled}
      />
      <Group gap={6}>
        <Button size="compact-xs" variant="default" loading={searching} disabled={disabled} onClick={runSearch}>
          Search
        </Button>
      </Group>
      {results.map((r) => (
        <Button key={`${r.osmType}:${r.osmId}`} size="compact-xs" variant="default" justify="flex-start" fullWidth onClick={() => add(r)}>
          <Text size="xs" truncate>{r.displayName}</Text>
        </Button>
      ))}
    </Stack>
  );
}
