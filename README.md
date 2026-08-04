# Michigatari

**Michigatari** ("path + story" in Japanese) creates animated map sequences for travel vlogs: capture keyframes on an
interactive map, add animated markers, labels, routes, and region outlines,
and export the result as video. Runs entirely in the browser.

Built with [MapLibre GL JS](https://maplibre.org/) and
[OpenFreeMap](https://openfreemap.org/) tiles. Developed with Claude.

## Status

Engine + demo animation working; the interactive editor and video export are in progress.

## Development

    npm install
    npm run dev    # dev server with a looping demo animation
    npm test       # engine unit tests
    npm run build  # production build

License: AGPL-3.0
