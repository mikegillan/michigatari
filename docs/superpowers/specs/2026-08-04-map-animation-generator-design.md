# Map Animation Generator — Requirements & Design

**Date:** 2026-08-04
**Status:** Approved design, pre-implementation
**License:** AGPL-3.0

## 1. Overview

A web-based tool for creating animated map sequences for travel vlogs. The user
manipulates an interactive map (pan, zoom, rotate, pitch), captures keyframes,
decorates the map with animated elements (markers, labels, routes, region
outlines), and exports the resulting animation as a video file for use in a
video editor.

Fully client-side static app: no backend, no accounts, no API keys required.
Deployable to GitHub Pages. Open source under AGPL-3.0.

## 2. Terminology

- **Keyframe** — a saved camera state (center, zoom, bearing, pitch).
- **Hold** — how long the camera pauses on a keyframe.
- **Transition / camera flight** — the animated camera move between two
  keyframes.
- **Easing** — the acceleration curve applied to a transition.
- **Element** — a map decoration: marker, label, route, or region outline.
- **Entrance / exit animation** — how an element appears/disappears (fade,
  pop, draw-on/trace-on).

## 3. Requirements

### Functional

1. Interactive map with free pan, zoom, rotate, and pitch.
2. Capture the current view as a keyframe; update an existing keyframe from
   the current view; reorder and delete keyframes.
3. Per keyframe: hold duration, transition duration to the next keyframe, and
   easing preset (linear, ease-in-out cubic, and similar presets — no custom
   curve editor).
4. Elements, each with configurable style and an entrance (and optional exit)
   bound to a keyframe with per-element delay and duration:
   - **Marker** — point pin; entrance: pop (scale + fade overshoot) or fade.
   - **Label** — text at a location; entrance: fade.
   - **Route** — line from A to B; modes: great-circle flight arc, or
     road-snapped driving route; entrance: draw from A to B.
   - **Region** — administrative boundary found by name search; entrance:
     outline trace (clockwise from northernmost point), optional fill fade
     after the trace. For MultiPolygon boundaries, the largest ring is
     traced; remaining rings fade in with the fill.

   Exit animation for all element types: fade.
5. Live preview: play/pause from any point, and a scrubber over the full
   timeline that shows the exact scene at any instant (including mid-flight
   camera and partially drawn routes).
6. Video export: MP4 (H.264) default, WebM (VP9) fallback; resolution
   selectable per project (1080p, 1440p, 4K); 30 or 60 fps; aspect ratio 16:9
   or 9:16. Frame-by-frame deterministic rendering — never realtime capture.
7. Projects save/load as self-contained JSON files. Autosave to browser
   localStorage recovers unsaved work.

### Non-functional

1. Exported frames are pixel-deterministic: same project file → same video.
2. Zero-setup: no API keys, no signup, no install beyond opening the URL (or
   `npm install && npm run dev` for contributors).
3. Network is required at author time only (tile fetching aside): fetched
   route/region geometries are baked into the project file.
4. External services sit behind provider interfaces so they can be swapped by
   configuration (see §5).

## 4. Architecture & Stack

Two decoupled halves:

1. **Editor** — React UI around a live MapLibre map. Produces and edits a
   plain-JSON Project.
2. **Engine** — pure functions: `(project, timeMs) → SceneState` (camera pose
   plus every element's animated properties at that instant). No React, no DOM
   knowledge. Drives live preview (requestAnimationFrame), scrubbing (slider),
   and export (fixed frame counter) through one code path.

**Stack:**

- Vite + React + TypeScript
- MapLibre GL JS — map rendering, camera, and all element rendering (elements
  are MapLibre layers, not DOM overlays, so they render into the captured
  canvas)
- Turf.js — great-circle arcs, line lengths, geometry slicing
- WebCodecs + mp4-muxer / webm-muxer — in-browser video encoding

## 5. External Services

Each behind a one-function provider interface (also how
tests inject fakes):

| Concern | Default provider | Notes |
| --- | --- | --- |
| Vector tiles + style | OpenFreeMap (Liberty style) | Free, no API key |
| Region boundaries | Nominatim | Name search → boundary polygon |
| Road routing | OSRM public server | Waypoints → road geometry |

Community-service usage policies (Nominatim, OSRM demo) permit light personal
use; a hosted commercial version must swap in commercial providers via these
interfaces.

**Baked geometry:** authoring a road route or region stores the fetched
geometry in the project file. Reopening, playback, and export make no
geocoding/routing calls. A "refresh geometry" action re-fetches on demand.

## 6. Data Model

One JSON file per project. `version` field from day one; future versions
migrate, unknown versions are rejected with a clear message.

```jsonc
{
  "version": 1,
  "settings": {
    "resolution": "4k",        // "1080p" | "1440p" | "4k"
    "fps": 30,                  // 30 | 60
    "aspect": "16:9",           // "16:9" | "9:16"
    "styleUrl": "..."           // basemap style URL (default: OpenFreeMap Liberty)
  },
  "keyframes": [
    {
      "id": "kf1",
      "camera": { "center": [135.5, 34.7], "zoom": 9.2, "bearing": -15, "pitch": 40 },
      "holdMs": 2000,
      "transition": { "durationMs": 3000, "easing": "easeInOutCubic" }
    }
  ],
  "elements": [
    {
      "id": "el1",
      "type": "marker",          // "marker" | "label" | "route" | "region"
      "style": {},                // per-type: color, size, font, line width…
      "data": {},                 // per-type, see below
      "enter": { "keyframeId": "kf1", "animation": "pop", "delayMs": 500, "durationMs": 400 },
      "exit":  { "keyframeId": "kf3", "animation": "fade", "delayMs": 0, "durationMs": 300 }
    }
  ]
}
```

Element `data` by type:

- **marker** — `{ lngLat }`
- **label** — `{ lngLat, text }`
- **route** — `{ mode: "arc" | "road", waypoints: [...], geometry: <baked LineString> }`
- **region** — `{ query, osmId, geometry: <baked Polygon> }`

**Timing model.** The timeline is derived, never stored:
`hold(kf1) → transition(kf1→kf2) → hold(kf2) → …`; total duration is the sum.
The last keyframe's `transition` is ignored. Element animations anchor to
arrival at their keyframe (the moment its hold starts) plus `delayMs`; an
animation may run past the hold into the following transition. `exit` is
optional — omitted means the element persists to the end.

## 7. Editor UI

- **Center: live map.** Free camera manipulation. A letterbox overlay marks
  the export frame for the chosen aspect ratio. "Capture keyframe" snapshots
  the camera; "Update" overwrites an existing keyframe from the current view.
- **Left sidebar: keyframe list.** Ordered cards (thumbnail, hold duration,
  transition duration, easing). Drag to reorder; click to jump the camera to
  that view.
- **Right sidebar: elements panel.** Add marker (click map), label (click +
  type), route (choose arc/road, click endpoints), region (name search →
  choose among Nominatim results). Each row: style controls, enter/exit
  keyframe binding, animation type, delay, duration.
- **Bottom: preview bar.** Play/pause from any point; scrubber across the
  computed timeline with keyframe tick marks.

Preview runs at screen refresh rate and screen resolution; export re-renders
at full output resolution with identical timing (same engine).

## 8. Animation Engine

- **Camera interpolation:** van Wijk–Nuij smooth zoom-out-then-in path (the
  math behind MapLibre's `flyTo`), reimplemented as a pure function of `t` so
  it is scrubbable and deterministic. Short moves degrade to direct
  interpolation. Bearing takes the shortest angular path; pitch lerps. The
  easing preset is applied to `t` before path evaluation.
- **Element evaluators:** per animation type, `(elementTiming, timeMs) →
  properties` — opacity for fades, scale for pop, and `progress` 0–1 for
  draw-on/trace-on. Draw-on slices the baked geometry at
  `progress × totalLength` (Turf), identical in preview and export.
- The React layer applies a `SceneState` to MapLibre (`jumpTo` + set layer
  properties/geometries). One code path for preview, scrub, and export.

## 9. Export Pipeline

1. Spawn a second, hidden MapLibre map at exact export resolution; the editor
   map is untouched.
2. Per frame `i`: `t = i × (1000 / fps)` → apply `SceneState(project, t)` →
   wait for the map **idle** event (all tiles loaded and rendered) → capture
   canvas → WebCodecs `VideoEncoder`.
3. Mux to MP4 (H.264) or WebM (VP9), streaming chunks to disk via the File
   System Access API so the full video never sits in memory.
4. Progress modal: frame counter, elapsed/ETA, cancel.

## 10. Error Handling

- **Capability probe:** on load, the export panel probes WebCodecs codec
  support and greys out unavailable options with a plain-language message.
- **Tile stalls during export:** idle-wait timeout (~10 s), one retry, then
  pause the export and surface the problem. Never silently emit frames with
  missing tiles.
- **Author-time service failures** (Nominatim/OSRM down or rate-limited):
  toast with retry; searches debounced.
- **Project load:** version checked; migrate known older versions, reject
  unknown with a clear message.
- **Autosave:** localStorage every few seconds; offer restore on reopen.

## 11. Testing

- Engine unit tests (pure functions, no browser): camera interpolation hits
  each keyframe exactly, bearing shortest-path, easing application; element
  timing windows open/close at the right times and clamp at 0/1; timeline
  arrival times and total duration; geometry slicing at progress 0/1;
  project JSON round-trip and version migration.
- Provider interfaces are faked for element-authoring logic tests.
- Export: one browser-based smoke test encoding a handful of frames through
  the WebCodecs + muxer path, plus a manual checklist per release.

## 12. Non-Goals (v1)

Audio; transparent-background (alpha) export; multi-track video-editor
timeline UI; accounts/cloud storage; server-side rendering; satellite/terrain
styles; custom easing curve editor; localization.

