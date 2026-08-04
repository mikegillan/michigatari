import { useEffect, useState } from 'react';
import { Button, Loader, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { searchRegions, type RegionCandidate } from '../providers/nominatim';
import { createRegion } from './elementDefaults';
import { useEditorStore } from './store';

export function RegionSearch() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const addElement = useEditorStore((s) => s.addElement);
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 400);
  const [results, setResults] = useState<RegionCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    searchRegions(debounced)
      .then((r) => { if (!stale) setResults(r); })
      .catch((err) => {
        if (!stale) notifications.show({ color: 'red', title: 'Region search failed', message: String((err as Error).message) });
      })
      .finally(() => { if (!stale) setSearching(false); });
    return () => { stale = true; };
  }, [debounced]);

  const add = (candidate: RegionCandidate) => {
    const firstKf = useEditorStore.getState().project.keyframes[0]?.id;
    if (!firstKf) return;
    addElement(createRegion(candidate, firstKf));
    setQuery('');
    setResults([]);
  };

  return (
    <Stack gap={4}>
      <TextInput
        size="xs" label="Add region outline" placeholder="Search: Hokkaido, Osaka Prefecture…"
        value={query} onChange={(e) => setQuery(e.currentTarget.value)}
        disabled={!hasKeyframes}
        rightSection={searching ? <Loader size={12} /> : null}
      />
      {results.map((r) => (
        <Button key={`${r.osmId}`} size="compact-xs" variant="default" justify="flex-start" fullWidth onClick={() => add(r)}>
          <Text size="xs" truncate>{r.displayName}</Text>
        </Button>
      ))}
    </Stack>
  );
}
