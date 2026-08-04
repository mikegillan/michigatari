import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { waitForIdle } from './waitForIdle';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fakeIdleMap() {
  const handlers = new Set<() => void>();
  return {
    once: (_: 'idle', cb: () => void) => handlers.add(cb),
    off: (_: 'idle', cb: () => void) => handlers.delete(cb),
    fireIdle: () => {
      for (const h of [...handlers]) {
        handlers.delete(h);
        h();
      }
    },
    pending: () => handlers.size,
  };
}

it('resolves idle when the event fires before the timeout', async () => {
  const map = fakeIdleMap();
  const p = waitForIdle(map, 10_000);
  map.fireIdle();
  await expect(p).resolves.toBe('idle');
});

it('resolves timeout and detaches the listener when the event never fires', async () => {
  const map = fakeIdleMap();
  const p = waitForIdle(map, 10_000);
  vi.advanceTimersByTime(10_001);
  await expect(p).resolves.toBe('timeout');
  expect(map.pending()).toBe(0); // listener removed, no leak
});

it('cancels the timeout when idle fires first', async () => {
  const map = fakeIdleMap();
  const p = waitForIdle(map, 10_000);
  map.fireIdle();
  await p;
  vi.advanceTimersByTime(20_000); // must not throw or double-settle
});
