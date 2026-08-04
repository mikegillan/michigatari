import { afterEach, expect, it } from 'vitest';
import { appConfig, configureApp } from './config';
import { blankProject } from './editor/store';

const originalStyleUrl = appConfig.defaultStyleUrl;
afterEach(() => configureApp({ defaultStyleUrl: originalStyleUrl }));

// Overlay builds swap providers/styles via configureApp before rendering;
// blankProject must read the config at call time, not snapshot it at import.
it('blankProject picks up a configured default style URL', () => {
  configureApp({ defaultStyleUrl: 'https://example.com/style.json' });
  expect(blankProject().settings.styleUrl).toBe('https://example.com/style.json');
});
