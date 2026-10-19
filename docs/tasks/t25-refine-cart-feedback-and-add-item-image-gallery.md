# T25 — Refine cart feedback and add item image gallery

Status: **Complete**

Depends on: T24, T18

[Task index](README.md)

## Scope and acceptance criteria

- Cart comments have a visible Comment: label; the cart heading counts quantities. Header Cart links show a top-right count only for nonempty carts, on desktop and mobile.
- Cart cards and the mobile Menu cart footer have equal horizontal padding. The footer retains visible View cart text. Remove space reserved for the old corner connection control.
- Discount starts empty with a 0.00 placeholder; an empty draft estimates and checks out as zero while invalid nonempty drafts remain errors.
- Combine connection feedback into a clickable status row: green/red dot, Connected/Disconnected, and existing update-check text. Open the existing connection dialog; remove the floating corner indicator.
- Item create/edit dialogs show a top image preview with an overlaid edit button, opening a nested fixed gallery of the 12 bundled images. The first option clears the image; a disabled final plus tile explains prototype upload/removal restrictions. Gallery has 3–4 columns.
- Reuse ItemImage everywhere with a blue food-icon placeholder for absent or failed images; preserve existing image presentation and revision-safe editor behavior.
- Feature/browser checks and pinned pnpm check pass: frontend/backend/contracts unit tests, lint, strict typechecking, and both production builds. All database verification is isolated from development data.

## Completion record

Completed 2026-10-19. Implemented the requested cart presentation, navigation counts, combined connection feedback and fixed image gallery. The pinned root check passes with 585 unit/contract tests and both production builds. All 38 standard Chromium scenarios pass, followed by a 2/2 focused rerun verifying the final desktop/mobile badge placement and gallery behavior.

## Verification

Verified on 2026-10-19 with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**.

### Demonstrated acceptance criteria

- Cart headings and badges sum valid item quantities using a shared helper, with singular/plural headings and no badge for an empty cart. Counts remain available to assistive technology through link descriptions. The badge is positioned against the whole Material button rather than its projected text label.
- Cart comments show a bold Comment: label above the retained text. Cards use equal 1.25rem horizontal padding, reserving remove-button space only beside the item copy. Menu footer padding is equal on both sides at desktop/mobile widths, and View cart stays visible beside its icon on mobile.
- New/cleared carts store an empty discount draft; empty drafts estimate as zero and quote requests send discountMinor: 0. Old persisted zero drafts also display an empty field with a 0.00 placeholder, without rewriting pending checkout recovery data. Invalid nonempty drafts still fail validation. Browser coverage checks clearing an applied discount restores the full total.
- A single keyboard-accessible button contains the green/red dot, Connected/Disconnected label and existing timestamp/check messages, and opens the existing connection dialog. Offline/reconnect coverage verifies dot colors and retained timestamps. The old fixed indicator and footer right-side space reservation are removed.
- Create/edit previews use a reactive image draft, with Edit image over the preview. The nested gallery shows the 12 bundled images in four desktop or three mobile columns, with No image first and a disabled plus tile last. A visible explanation and accessible description state that adding/removing images is unavailable in the prototype. Escape/Cancel restore focus and preserve the draft; cancelling the parent does not save changes. Saving a selection or clearing it survives reopening/reload.
- Clearing an image uses the existing nullable backend field and omitted response property; no schema migration is needed. Menu cards now use ItemImage too. Every item-image surface shares the blue food-icon placeholder for absent/failed images, retains existing dimensions, normalizes legacy image paths, and recovers when a new valid URL arrives.
- Added unit coverage for missing/broken-image fallback and source recovery, gallery draft/cancel/clear behavior, quantity counts and empty discounts. Existing checkout coverage now explicitly verifies a blank discount quotes as zero. New browser scenarios cover mobile/desktop layouts, gallery image loading, selection/cancellation/clearing/creation and persisted zero-discount display.

### Checks

- **Passed:** uncached `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all lint/typecheck targets, **155 frontend + 353 backend + 77 shared-contract tests (585 total)** and both production builds. Final `CI=true NX_DAEMON=false NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` after badge styling also passes; Nx reused valid backend/contracts results.
- **Passed:** full standard Chromium suite using `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **38/38**. **Passed:** final focused `cart-and-image-gallery.spec.ts` rerun — **2/2**, including bounding-box assertions for top-right badge placement on desktop/mobile and the gallery flows.
- Browser screenshots inspected at **1440px and 375px**, including cart padding/comments, visible footer button text, missing-image placeholders and gallery grids. Gallery captures wait for opening animations to finish.
- The first full browser run passed 37/38 and exposed Menu's separate salad fallback renderer; replacing it with ItemImage resolves that mismatch. Initial focused attempts also caught outdated comment-dialog locators and gallery button accessible names, both corrected.
- **Passed:** `git diff --check`, including final task documentation.
- Collaborative preview opened but snapshot failed twice with `Preview automation snapshot timed out after 15000ms.` Visual verification uses the repository Playwright workflow instead.

All database tests use temporary SQLite databases; browser servers use independent in-memory databases on **3100/4300**. No development data is read, seeded, reset or changed. The existing import-order edit in catalog.page.ts is preserved. Dependencies, lockfile, database schema and migrations are unchanged.

### Practical limits

The frontend initial bundle is **590.57 kB**, below the unchanged 600 kB error limit, with the existing warning over 550 kB. Image uploads/removal remain intentionally disabled. Large-menu performance and container smoke suites are outside this UI task.
