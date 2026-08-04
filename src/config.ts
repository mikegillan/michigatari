import { searchRegions as defaultSearchRegions } from './providers/nominatim';
import { roadRoute as defaultRoadRoute } from './providers/osrm';

export interface AppConfig {
  defaultStyleUrl: string;
  searchRegions: typeof defaultSearchRegions;
  roadRoute: typeof defaultRoadRoute;
  /** Burned into every exported frame; must credit the active tile provider. */
  exportAttribution: string;
}

export const appConfig: AppConfig = {
  defaultStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  searchRegions: defaultSearchRegions,
  roadRoute: defaultRoadRoute,
  exportAttribution: '© OpenStreetMap contributors · OpenFreeMap',
};

/**
 * Swap in alternative providers/styles (see README: community services are for
 * light personal use). Call from a module imported before the editor store —
 * the store reads `defaultStyleUrl` when its initial state is created.
 */
export function configureApp(patch: Partial<AppConfig>): void {
  Object.assign(appConfig, patch);
}
