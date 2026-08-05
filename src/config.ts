import { searchRegions as defaultSearchRegions } from './providers/nominatim';
import { roadRoute as defaultRoadRoute } from './providers/osrm';

export interface StyleOption {
  /** Stable key for overrides; projects persist the URL, not this. */
  id: string;
  label: string;
  url: string;
  /** Font for element labels; must exist on the style's glyph host. */
  fontStack: string[];
  /** Credit line burned into exports of projects using this style. */
  attribution: string;
}

// Hosted by OpenFreeMap (all bundled styles); the MapLibre default stack 404s there.
const NOTO = ['Noto Sans Regular'];
const OFM_ATTRIBUTION = '© OpenStreetMap contributors · OpenFreeMap';

export interface AppConfig {
  /** Selectable basemaps; the picker hides itself when there's only one. */
  styles: StyleOption[];
  defaultStyleUrl: string;
  searchRegions: typeof defaultSearchRegions;
  roadRoute: typeof defaultRoadRoute;
  /** Fallback attribution when a project's styleUrl isn't in `styles`. */
  exportAttribution: string;
  /**
   * Offer a "no burned-in attribution" export toggle. Off in the public build:
   * attribution must then travel in the video description instead (OSMF video
   * attribution guidance), which the dialog handles by handing the user the
   * credit line. Enabled by builds whose provider terms allow it.
   */
  allowCleanExport?: boolean;
}

export const appConfig: AppConfig = {
  styles: [
    { id: 'liberty', label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty', fontStack: NOTO, attribution: OFM_ATTRIBUTION },
    { id: 'bright', label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright', fontStack: NOTO, attribution: OFM_ATTRIBUTION },
    { id: 'positron', label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron', fontStack: NOTO, attribution: OFM_ATTRIBUTION },
  ],
  defaultStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  searchRegions: defaultSearchRegions,
  roadRoute: defaultRoadRoute,
  exportAttribution: OFM_ATTRIBUTION,
};

export function styleOptionFor(styleUrl: string): StyleOption | undefined {
  return appConfig.styles.find((s) => s.url === styleUrl);
}

/** Font stack for element labels under the given basemap. */
export function elementFontStack(styleUrl: string): string[] {
  return styleOptionFor(styleUrl)?.fontStack ?? NOTO;
}

/**
 * Swap in alternative providers/styles (see README: community services are for
 * light personal use). Call from a module imported before the editor store —
 * the store reads `defaultStyleUrl` when its initial state is created.
 */
export function configureApp(patch: Partial<AppConfig>): void {
  Object.assign(appConfig, patch);
}
