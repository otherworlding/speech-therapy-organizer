# Build Tally — Speech Therapy Organizer

A running record of the measurable footprint of building this app, so we can
track it, offset it, and learn to code more efficiently. Measured metrics are
reliable; the energy (kWh) figures are **honest estimates with wide error bars**,
not precise measurements.

_Last updated: 2026-07-10_

## Measured facts

| Metric | Value |
|---|---|
| Development span | 2026-06-18 → 2026-07-10 (~22 calendar days, part-time) |
| Feature commits | 13 |
| Auto-save commits | 10 |
| Hand-written source | ~4,900 lines across 30 files (JSX / JS / CSS) |
| Full DMG builds run | ~30–40 (both Intel + Apple Silicon across feature rounds + tests) |
| Renderer-only builds | ~20 |
| Final app size | 118 MB (Apple Silicon) · 122 MB (Intel) |
| Dependency footprint | 461 MB node_modules |

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
