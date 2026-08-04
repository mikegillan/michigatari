<p align="center">
  <img src="public/icon.png" alt="Michigatari icon" width="128">
</p>

# Michigatari

**Michigatari** ("path + story" in Japanese) creates animated map sequences for travel vlogs: capture keyframes on an
interactive map, add animated markers, labels, routes, and region outlines,
and export the result as video. Runs entirely in the browser.

Built with [MapLibre GL JS](https://maplibre.org/) and
[OpenFreeMap](https://openfreemap.org/) tiles. Developed with Claude.

Region search uses [Nominatim](https://nominatim.org/) and road routing uses
the public [OSRM](https://project-osrm.org/) demo server — community-run OSM
services suitable for light personal use only. If you host Michigatari for
others, swap in your own providers (the base URLs live in `src/providers/`).

## Status

The editor is feature-complete for authoring: keyframe camera animation plus
animated markers, labels, flight-arc and road routes, and region outlines,
with per-element styling and animation timing. Video export is in progress.

## Development

    npm install
    npm run dev    # the editor
    npm test       # engine unit tests
    npm run build  # production build

License: AGPL-3.0
