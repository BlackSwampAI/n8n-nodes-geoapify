# Forward amenity result type handoff

This fix is being prepared for `fix/forward-geocoding-amenity`, based on current `origin/main` at `d96eb867c18b5bf05a38903288e7031e7f646a50` (PR #6 merged). The separate template-guards work remains in its own draft PR.

## Scope and implementation

Added a forward-only **Amenity / Place** option that sends Geoapify's documented `type=amenity` query parameter. The existing **Any** value remains the empty string, which omits `type`. Reverse geocoding retains its exact prior result-type choices and empty default, and the request validator rejects `amenity` for reverse before transport. Other resources continue through their existing validation paths.

The node remains declarative REST routing: it uses its existing fixed forward/reverse endpoint routing and request-validation callback. No custom execution or transport, dependency, automatic fallback, or retry was added. The forward and reverse Options collections are separately conditioned on operation so the editor only offers Amenity / Place for forward geocoding.

## Evidence and behavior

The current [Geoapify forward-geocoding documentation](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/) and [forward-geocoding OpenAPI specification](https://raw.githubusercontent.com/geoapify/geoapify-openapi-specs/main/api-specs/forward-geocoding/forward-geocoding-api-openapi-specs.json) support the amenity result type. A dated follow-up is recorded in the API matrix; it supplements, rather than rewrites, the earlier source review. Structured `name` input was already available and was not changed.

The user supplied this observed case: query text `Brandenburg Gate, Berlin, Germany`, unchanged, with the returned `expected_type` set to `street`. This is user-provided evidence of the parser result, not a live request performed or independently verified for this batch. Explicit `type=amenity` asks for amenity results; it cannot ensure a particular landmark result or guarantee accuracy. No live API request was made for this batch, so live result behavior remains unverified.

Tests use n8n's `NodeHelpers.getNodeParameters` and `NodeHelpers.displayParameter` to cover normalized metadata, visible forward-only selection, request serialization, Any/default omission, reverse's existing choices and serialization, structured `name` without a `text` query, and stale reverse amenity rejection before transport. Stale geocoding options are also shown to have no type effect on Places and Routing requests.

The primary's disposable editor smoke used n8n 2.41.6 at `http://localhost:5692`. Forward Result Type showed Amenity / Place and defaulted to Any. After switching an existing node to Reverse, the host retained the stored amenity value and showed a warning icon, while the Reverse dropdown contained exactly Any, City, Country, Postal Code, State, and Street. Selecting Any cleared the stale value. This confirms the local validator remains necessary; the editor does not automatically reset that parameter. Screenshots were reviewed at `/tmp/geoapify-amenity-forward-editor.png` and `/tmp/geoapify-amenity-reverse-menu.png`. No credential was configured and no API request was executed. This is evidence for that disposable editor instance, not a broad n8n compatibility claim.

The primary also passed `npm run smoke:install`: the isolated consumer loaded one compiled node and one wired credential type, then reported that the packed package installed and loaded successfully. The disposable n8n CLI was stopped after the editor check; temporary database and screenshots remain under `/tmp`.

The 2026-10-02 source/docs and tests audit across Forward Geocoding, Reverse Geocoding, Places Search, Place Details Get, and Routing Calculate found no additional confirmed control/serialization defect. The audit was limited to node metadata, existing tests, and current official contracts/docs; it is not live-service evidence. Existing scoped omissions remain: optional reverse selectors, advanced Places filters, Place Details enrichment/coordinate lookup, and advanced Routing selectors are not added by this fix. The existing reverse node default of five is intentional and documented; parity with the Geoapify upstream default was outside this assignment.

## Original implementation/editor verification (2026-10-02)

- `npm run format:check` — passed.
- `npm run lint` — passed; the direct ESLint check for the changed node and operation contract also passed.
- `npm run typecheck` — passed (production and test TypeScript projects).
- `npm test` — passed, 117 tests across 9 files in the original implementation worktree.
- `npm run build` — passed.
- `npm run package:check` — passed; package boundary accepted 15 files.
- `npm run smoke:load` — passed; loaded one compiled node and one wired credential type.
- `npm run smoke:install` — passed in the primary's isolated consumer smoke; the packed package installed and loaded successfully.
- `npm run scan:source` — passed official source and built-package preflights.
- This original editor/package evidence is preserved as historical evidence and is distinct from revalidation on the current PR branch below.

The primary reviewed the production diff and documentation scope. No authenticated Geoapify request or real credential was used. The reported street interpretation remains user-supplied evidence. The editor check validates UI behavior in one disposable n8n version; it does not establish live Geoapify behavior or wider n8n compatibility.

## Current PR branch verification (2026-10-02)

Starting worktree was clean on `fix/forward-geocoding-amenity` at `d96eb867c18b5bf05a38903288e7031e7f646a50`, equal to `origin/main`. The 744-package frozen install was completed by the primary with no dependency or lockfile edits.

- `npm run format:check`, `npm run lint`, and `npm run typecheck` — passed.
- `npm test` — passed, 117 tests across 9 files.
- `npm run build` — passed.
- `npm run scan:source` — passed official source and built-package preflights.
- `npm run smoke:load` — loaded one compiled node and one wired credential type.
- `git diff --check` — passed.
- `npm run package:check` — the feature worktree hit the existing `release:check` linked-worktree limitation: it tried to open `/home/chris/Projects/n8n-nodes-geoapify/.git/worktrees/geoapify-forward-geocoding-fix/config`, which does not exist, then reported that the repository URL did not match origin. The primary reran the exact scoped files and built output in an ordinary disposable local checkout at `/tmp/geoapify-amenity-package-validation`; release audit and package boundary passed (15 files, 39,682 packed bytes). No out-of-scope script or git metadata was changed in the feature worktree.
- `npm run smoke:install` — passed on this branch; the isolated consumer loaded one compiled node and one wired credential type.

Current-branch test/build/load checks are local evidence; no live API call was made. The UI smoke and user-reported `expected_type: street` remain specifically identified as historical editor and user-provided evidence above.
