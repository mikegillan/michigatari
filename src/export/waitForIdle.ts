export interface IdleMap {
  once(ev: 'idle', cb: () => void): void;
  off(ev: 'idle', cb: () => void): void;
}

export function waitForIdle(map: IdleMap, timeoutMs: number): Promise<'idle' | 'timeout'> {
  return new Promise((resolve) => {
    const onIdle = () => {
      clearTimeout(timer);
      resolve('idle');
    };
    const timer = setTimeout(() => {
      map.off('idle', onIdle);
      resolve('timeout');
    }, timeoutMs);
    map.once('idle', onIdle);
  });
}
