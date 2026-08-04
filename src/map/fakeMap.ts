// Minimal in-memory stand-in for the maplibre Map surface used by
// createElementLayers/applyElements/syncElementLayers. Not a structural
// match for maplibre-gl's Map type — cast with `as unknown as MapLibreMap`
// at call sites in tests.

export interface FakeLayer {
  id: string;
  type: string;
  source?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

export interface FakeSource {
  data: unknown;
  setData: (data: unknown) => void;
}

export function createFakeMap() {
  const layers: FakeLayer[] = [];
  const sources = new Map<string, FakeSource>();
  const calls: [op: string, id: string][] = [];
  const jumpToCalls: unknown[] = [];
  const findLayer = (id: string) => layers.find((l) => l.id === id);

  return {
    layers,
    sources,
    calls,
    jumpToCalls,
    getStyle: () => ({ layers }),
    addSource: (id: string, spec: Record<string, unknown> = {}) => {
      calls.push(['addSource', id]);
      const source: FakeSource = {
        data: spec.data,
        setData: (data) => { source.data = data; calls.push(['setData', id]); },
      };
      sources.set(id, source);
    },
    removeSource: (id: string) => {
      calls.push(['removeSource', id]);
      sources.delete(id);
    },
    getSource: (id: string) => sources.get(id),
    addLayer: (spec: FakeLayer) => {
      calls.push(['addLayer', spec.id]);
      layers.push({ ...spec });
    },
    removeLayer: (id: string) => {
      calls.push(['removeLayer', id]);
      const i = layers.findIndex((l) => l.id === id);
      if (i !== -1) layers.splice(i, 1);
    },
    getLayer: (id: string) => findLayer(id),
    setPaintProperty: (layerId: string, prop: string, value: unknown) => {
      calls.push(['setPaintProperty', layerId]);
      const layer = findLayer(layerId);
      if (layer) layer.paint = { ...layer.paint, [prop]: value };
    },
    setLayoutProperty: (layerId: string, prop: string, value: unknown) => {
      calls.push(['setLayoutProperty', layerId]);
      const layer = findLayer(layerId);
      if (layer) layer.layout = { ...layer.layout, [prop]: value };
    },
    jumpTo: (opts: unknown) => {
      calls.push(['jumpTo', '']);
      jumpToCalls.push(opts);
    },
  };
}

export type FakeMap = ReturnType<typeof createFakeMap>;
