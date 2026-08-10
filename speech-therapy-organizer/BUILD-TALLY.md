# Build Tally — Speech Therapy Organizer

A running record of the measurable footprint of building this app, so we can
track it, offset it, and learn to code more efficiently. Measured metrics are
reliable; the energy (kWh) figures are **honest estimates with wide error bars**,
not precise measurements.

_Last updated: 2026-08-09_

## Measured facts

| Metric | Value |
|---|---|
| Development span | 2026-06-18 → 2026-08-09 (part-time) |
| Feature commits | 32 |
| Hand-written source | ~8,100 lines across 38 files (JSX / JS / CSS) |
| Full DMG builds run | ~92–102 (both arches across feature rounds + iterative test builds) |
| Renderer-only builds | ~90 |
| Final app size | 122 MB (Apple Silicon) · 127 MB (Intel) |
| Dependency footprint | 461 MB node_modules |

### Round 10 (2026-08-09): Client-page restructure, Library kind-sorting, Appearance presets
Three rounds bundled into one build. **(1)** Moved the per-client folder tree
(Main Collection, Session Materials, In-Person, Homework) off the shared
"Library & Planner" sidebar and onto each client's own Detail page as a new
"Materials & Sessions" tab — full page width instead of a 340px column meant to
hold every client at once, with an embedded Library panel alongside it for
dragging materials straight in (new `src/components/ClientMaterials.jsx`). The
old flat "Materials" tab, Assign Material modal, and Transfer-from-another-client
modal were retired as redundant. `Workspace.jsx`/the Library nav item is now a
pure general-materials browser, no client list. **(2)** Library gained a "Move
to…" flat folder picker (spans Library + every client's Main Collection, replaces
drag-across-tabs), auto-sort-on-import for PowerPoint→Games and video/YouTube→
Videos folders (general-Library-only, Settings toggle), a retroactive "Sort
existing" action for pre-existing files, and kind-aware search/quick-filter
chips. **(3)** Settings → Appearance: four color+font presets (Clinical Calm
default, Warm & Playful, Focused Dark, Professional Slate) switchable instantly
app-wide via CSS var overrides on `data-theme`.

**Footprint note:** dev-mode fix-and-verify throughout (vite dev server in the
Browser pane, real localStorage test data for FinderView/theme work; the
computer-use tool against a freshly built arm64 DMG for the client-page
restructure, against real production client data). Both arches built and
smoke-tested — arm64 first per usual, verified live (real client "dan", real
folders, all four Appearance presets switching correctly) before the Intel
build; Intel build launched and verified under Rosetta on the same machine,
confirmed shared userData state with the arm64 run.

### Round 9 (2026-08-09): Providers system + consolidated agency invoicing
Replaced the single global branding + ad hoc per-client-override design from Round 7
with a proper **Providers** collection — reusable billing identities (name, logo,
"bill from" address/contact/email/phone, currency, and a "consolidate all clients
onto one invoice" flag), managed in Settings. Each client now picks a Provider on
their Billing tab via a dropdown that's hidden entirely when only one exists (auto-
assigned) — replacing the old per-client custom-branding checkbox. A one-time
migration seeds a default Provider from the prior global appName/logoPath settings
so existing users don't lose their sidebar identity. Client billing also gained
`currency` (12 common codes via `Intl.NumberFormat`) and a third rate type,
**package** (flat price for a bundle of sessions — itemizes real sessions for the
record but prices as one flat line), alongside the existing session/hourly modes;
billing frequency trimmed to per-session/weekly/monthly now that package is a rate
type, not a frequency.

Biggest piece: **consolidated provider invoicing** — for a therapist subcontracted
by an agency, a new flow on the Invoice Tracker page bills the agency once per
period for every client assigned to that provider, itemized by client (bold
subheader per client) with each session's real date, a per-client subtotal, and a
grand total. Required the invoice PDF to support two shapes (single-client vs.
grouped-by-client) and a two-column FROM/BILL TO letterhead block (provider's
bill-from info vs. the invoice recipient). Shared billing math (`lineItemsFor`,
`computeTotal`, `resolveProvider`, currency formatting) was pulled out of
BillingTab.jsx into a new `src/utils/billing.js` so the per-client and consolidated
flows can't drift apart.

**Footprint note:** entirely dev-mode fix-and-verify, no build until this round's
close. Verified live end-to-end: migration (confirmed old branding carried over to
a seeded default provider), a second provider with bill-from data, assigning a
client to it, generating both a per-client and a consolidated multi-client invoice,
and reading the actual generated PDF bytes back to confirm layout (client subheader
grouping, subtotal/grand total math, FROM/BILL TO columns) — not just the on-screen
preview. Test provider/invoice cleaned up before commit so Settings doesn't carry
fake agency data.

### Round 8 (2026-08-08): Per-client billing & PDF invoicing
Added a "🧾 Billing" tab to the Client Detail page (moved there from an earlier plan
to put it in the Workspace tree, per user feedback): billing settings (flat-rate or
hourly, billing frequency, bill-to toggle between the client and a saved
insurance/agency contact), a "+ New Invoice" flow that pulls real session records
in a date range into itemized line items, and a polished PDF export via the new
`pdf-lib` dependency (letterhead uses the Settings branding logo/name from the
previous round). Invoices persist as a new store collection with Mark Paid/Unpaid,
re-export, and delete. Also added `contactName`/`mailingAddress` fields to the
client form, used as the invoice bill-to when billing the client directly.

Two real bugs caught during live verification, both fixed before commit: (1) a
timezone off-by-one — bare `YYYY-MM-DD` date strings parsed as UTC midnight and
displayed a day early in a timezone behind UTC; fixed by forcing local-midnight
parsing. (2) The first real PDF export showed long session descriptions visibly
overlapping the Duration/Rate/Amount columns — the column layout had no reserved
gap and no truncation; rebuilt with fixed column geometry, right-aligned numeric
columns, and width-aware ellipsis truncation on the description column, then
re-verified by reading the regenerated PDF directly.

Deferred: the quarterly/end-of-year tax summary report (totals per client/agency)
— spec kept in memory for a follow-up round.

### Round 7 (2026-07-26): Per-client Main Collection folder + custom branding
Two of three requested features (a third, per-client invoicing, was scoped and
deliberately deferred to its own round — spec saved to memory so it isn't
re-derived from scratch later). Both reuse existing patterns rather than adding
new architecture: (1) **Main Collection** — a real top-level folder auto-created
per client (same Finder component, same drag/drop, scoped by a new optional
`clientId` field on folder records) for dropping in a month-or-more of material
that weekly sessions/homework draw from by dragging, same mechanism already used
everywhere else. Excluded from the general Digital library tab by extending
`excludeFolderId` to accept an array (previously only excluded the single
In-Person folder). Cascade-deletes cleanly with the client, same BFS pattern as
folder deletion. (2) **Custom branding** — a Settings card for a practice name
and logo image, reusing the existing file-picker/copy-to-userData-folder IPC
pattern (new `branding:pick-logo`/`branding:clear-logo` handlers, dedicated
`branding/` folder so re-uploading cleanly replaces rather than accumulates
files), rendered in the sidebar in place of the default emoji/name. Caught one
real UX issue during live verification: the embedded Finder toolbar's fixed
220px search box didn't fit the narrow ~230px client-accordion column and got
clipped — fixed with a scoped narrower search width and `flex-wrap` on the
toolbar's right-hand button group.

**Footprint note:** dev-mode fix-and-verify only, no DMG build this round —
both features tested live in the already-running dev Electron app (folder
creation/scoping, file import into Main Collection, logo upload/preview/removal,
name change propagating to the sidebar, console checked clean). Will fold into
the next build when one is due.

### Round 6 (2026-07-24): Preview scroll/zoom fix + Finder back vs. delete clarity
User testing surfaced two real UX bugs: zoomed image/PDF previews couldn't be
scrolled to reach content past the visible middle, and the only visible "✕" while
browsing inside a folder was a per-item delete button, easily mistaken for a way
back. Root-caused the scroll bug through three layered issues, each necessary but
not sufficient alone: (1) the zoom slider used CSS `transform: scale()`, which only
repaints — it never grows the element's actual layout box, so there was never real
overflow to scroll into; switched to the (non-standard but Chromium-supported)
`zoom` property, which does affect layout size. (2) `.image-viewer` used flex
`align-items/justify-content: center`, a well-known browser limitation that blocks
scrolling into content past the centered midpoint; switched to block layout +
`margin: auto` centering (matching the pattern the already-working PDF viewer
uses). (3) The actual root cause: `.browse-preview`, the shared modal wrapper used
by all three preview call sites (FinderView, Workspace, MaterialsBrowser), was
never a flex container — so `.file-viewer`'s `flex: 1` never applied, and the
image viewer just grew to match its content instead of clipping at the visible
modal size. Confirmed via DevTools (`scrollHeight === clientHeight` on the
container even after fixes 1–2) before finding it. Fixed by making `.browse-preview`
`display: flex; flex-direction: column`, plus `min-height: 0` down the flex chain.
Verified live: zoomed image at 300% now shows real horizontal + vertical
scrollbars and mouse-wheel scroll actually reveals all corners of the image.
Also added a distinct "← Back" button in the Finder breadcrumb bar (returns to the
previous folder level or exits a smart view) and swapped the per-item delete "✕"
for a 🗑 trash icon — the existing delete confirmation dialog already covered the
"warning prompt" ask, no change needed there.

**Footprint note:** fix-and-verify happened entirely in dev mode (CSS/JSX edits,
`npx vite build` sanity checks, live DevTools inspection) before any packaging.
Once the fixes were confirmed working, one arm64 build was run and verified, then
the closing Intel build — both smoke-tested via `ls`/file-size sanity check, no
wasted rebuilds this round.

### Round 5 (2026-07-12): Performance on older hardware + Finder polish
A user report ("500-item folder freezes and won't scroll") traced back to two causes:
(1) a legacy pre-rewrite import path that bundled an entire folder into one
non-navigable, non-throttled preview — fixed with a one-click "Convert to real
folder" migration that reuses already-copied files, no need to re-locate the
original folder; (2) PDF thumbnails rendering with no concurrency limit, which
can stall the main thread on older/slower machines — fixed with a 2-at-a-time
render queue, smaller incremental-render batches, a tighter scroll-ahead margin,
and lazy-loading on all thumbnail images. Also fixed: dragging an item out of a
folder back to the library root had no path (drag targets now include the
breadcrumb trail, matching Finder's path-bar drag behavior), and the homework
WhatsApp/Email share was silently burying its "files ready" Finder window behind
the chat app instead of showing it on top.

**Footprint note:** internal (non-Finder) HTML5 drag interactions can't be
reliably driven by the automation used to verify these fixes — confirmed via
direct DOM event dispatch in DevTools instead of relying on synthetic mouse
drags, avoiding a wasted build/test cycle chasing a tooling limitation rather
than a real bug. One Intel build this round (user specifically needed Intel
first, tested via Rosetta), smoke-tested before closing out.

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
