# Build Tally — Speech Therapy Organizer

A running record of the measurable footprint of building this app, so we can
track it, offset it, and learn to code more efficiently. Measured metrics are
reliable; the energy (kWh) figures are **honest estimates with wide error bars**,
not precise measurements.

_Last updated: 2026-07-11_

## Measured facts

| Metric | Value |
|---|---|
| Development span | 2026-06-18 → 2026-07-11 (~24 calendar days, part-time) |
| Feature commits | 21 |
| Hand-written source | ~5,800 lines across 32 files (JSX / JS / CSS) |
| Full DMG builds run | ~65–75 (both arches across feature rounds + iterative test builds) |
| Renderer-only builds | ~55 |
| Final app size | 118 MB (Apple Silicon) · 122 MB (Intel) |
| Dependency footprint | 461 MB node_modules |

### Round 2 (2026-07-11): Finder rebuild + dual-pane workspace
Materials rebuilt as a Finder (icon/list, recursive folder import, thumbnails,
sort, delete, copy/paste, marquee/shift/cmd selection), viewer upgrades
(continuous PDF scroll, zoom), homework share, YouTube-link materials, and a
two-pane clients+materials workspace with drag-to-assign.

**Footprint lesson this round:** the dominant cost was ~12 arm64 test rebuilds
driven by iterative last-minute fixes (marquee, list column, YouTube, tagging
decouple). Each arch build is ~1–3 min CPU. The "prompt before every build" +
single-arch-during-iteration rules held the expensive dual Intel build to a
single run at the very end. Next time, batching a few fixes before each test
build would cut the arm64 rebuild count roughly in half.

## Compute / energy estimate

- **Local builds:** roughly 1–1.5 hours of laptop CPU time total → very roughly
  **0.5–1 kWh** (≈ a microwave running 30–60 min, or one hot dishwasher cycle).
- **AI inference:** not reliably measurable and not fabricated here. It was a
  multi-day collaboration with many model calls; it almost certainly **dominated**
  the total energy over the local builds.

## Biggest footprint levers (what to reduce next time)

1. **Repeated dual-architecture rebuilds** — building both Intel + Apple Silicon
   every round. Fix: build one arch during iteration, do the dual build once at the end.
2. **Automated UI test build cycles** — each needed a fresh packaged build.
3. **Rework from late design changes** — mitigated by the propose-before-coding rule
   and the pre-final-build check-in for last-minute additions.

## Efficiency practices adopted

- Propose design before coding; discuss before building.
- Pause before the final (expensive) dual-arch build so late additions batch into one build.
- Prefer single-architecture builds while iterating.
