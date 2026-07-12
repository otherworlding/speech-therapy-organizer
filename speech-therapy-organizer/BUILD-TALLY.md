# Build Tally — Speech Therapy Organizer

A running record of the measurable footprint of building this app, so we can
track it, offset it, and learn to code more efficiently. Measured metrics are
reliable; the energy (kWh) figures are **honest estimates with wide error bars**,
not precise measurements.

_Last updated: 2026-07-12_

## Measured facts

| Metric | Value |
|---|---|
| Development span | 2026-06-18 → 2026-07-12 (~25 calendar days, part-time) |
| Feature commits | 28 |
| Hand-written source | ~7,300 lines across 35 files (JSX / JS / CSS) |
| Full DMG builds run | ~79–89 (both arches across feature rounds + iterative test builds) |
| Renderer-only builds | ~76 |
| Final app size | 118 MB (Apple Silicon) · 122 MB (Intel) |
| Dependency footprint | 461 MB node_modules |

### Round 4 (2026-07-12): In-person session tracking + unified library
Per-session (not per-client) online/in-person toggle set at the scheduler, session
start, and manual report; a per-client "In-Person" folder (Upcoming → Needs Review →
Archive, with a Skip option) for logging photos/notes tied to real appointments; and
a Digital/In-Person library split via tabs so drags can't land in the wrong one.

The in-person library itself went through two designs — a bespoke add-item form
first, then rebuilt to reuse the existing Finder component scoped to a real folder,
after user feedback that it should look and behave exactly like the Digital library
(folders, tags, icon/list, drop-then-describe). Two real bugs were caught and fixed
along the way: a disabled Save button with no visual disabled state, and a Chromium
dev-mode-only restriction blocking local image thumbnails (fixed via `webSecurity`
toggled off only in dev, packaged builds were never affected).

**Footprint note:** most of this round's cost was dev-mode verification (real
Finder-to-app drag tests, DevTools console inspection) rather than build cycles —
only one arm64 build plus the closing Intel build were needed, both smoke-tested
before calling it done.

### Round 3 (2026-07-12): Data safety — crash-safe saves, backups, and merge sync
Atomic writes + corruption recovery, automatic daily backups with restore, full
portable backup/restore (zip), a real merge-sync system (timestamped records +
tombstones, tested against 4 scenarios before any UI was built), a non-blocking
async folder import with a live progress bar, a top-level React error boundary,
and drop-to-recognize sync files with a saved-email quick-send flow.

**Footprint note:** this round front-loaded correctness — the merge algorithm
was unit-tested standalone (plain Node script, no Electron build needed) before
any UI work, which caught a real scoping bug for free. Only one arm64 build was
needed to verify the full round (smoke-tested every major screen via CDP) before
the single closing Intel build — the cheapest round yet per feature shipped.

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
