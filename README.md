<p align="center">
  <img src="public/icon.png" alt="Michigatari icon" width="128">
</p>

# Michigatari

**Michigatari** ("path + story" in Japanese) creates animated map sequences for travel vlogs: capture keyframes on an
interactive map, add animated markers, labels, routes, and region outlines,
and export the result as video. Runs entirely in the browser.

Built with [MapLibre GL JS](https://maplibre.org/) and
[OpenFreeMap](https://openfreemap.org/) tiles. Developed with Claude.

## Status

Camera animations are fully authorable: capture keyframes on the map,
arrange and time them, preview with scrubbing, and save/load projects.
Animated map elements (markers, labels, routes, region outlines) and video
export are in progress.

## Development

    npm install
    npm run dev    # the editor
    npm test       # engine unit tests
    npm run build  # production build

License: AGPL-3.0
