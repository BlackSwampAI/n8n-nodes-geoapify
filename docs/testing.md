# Testing and verification

This file records Batch 1 historical checks and current Batch 2 evidence. A test, compiled registration load, n8n UI inspection, local request mock, and live Geoapify request are different evidence tiers; passing one does not prove another.

## Contract and behavior cases

The Vitest suite should exercise TypeScript node and credential contracts with real n8n parameter shapes. Required Batch 1 cases:

- Credential registration, password masking, `x-api-key` injection, credential test request, registered-node credential reference, and secret sanitization.
- Forward free-form and structured requests, structured minimum validation, country restriction serialization, expressions, language/limit/type options, multi-result output, confidence fields, raw FeatureCollection, and successful empty results.
- Structured address requires at least one of name, street, postcode, city, state, or country; house number alone must be rejected.
- Reverse `lat`/`lon` query order, zero values, inclusive coordinate bounds, blank and invalid values, expression evaluation, and **Max Results** default 5 when omitted for both operations.
- Malformed FeatureCollections, malformed features, authentication failure, quota/rate-limit and other service failures, Retry-After details, timeouts, and Continue On Fail behavior.
- Multiple input items, output linkage, no first-result truncation, and no secret in output/errors.

Tests should run declarative routing through n8n's actual routing execution path when the host runtime is available. A test that only calls a locally reimplemented request builder is not equivalent evidence. Any error-handling test must distinguish the routing layer from n8n's node failure/Continue On Fail behavior.

## Evidence and results

The API catalog/specs and human documentation were reviewed as described in [the API matrix](api-matrix.md). The package was not validated against an authenticated Geoapify account; live API behavior remains unverified.

### Package gates

Batch 1's earlier Node 22.22.0 and Node 24.18.0 checks are historical and apply to its 19-test, 12-file package. Batch 2 was revalidated separately:

| Runtime                   | Batch 2 result                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node 24.18.0, npm 11.19.0 | Format, lint, strict typecheck, 96 tests across 5 files, build, official source and built-output scanner preflights, package check, compiled-load smoke, isolated packed-install smoke, and `git diff --check` passed. The packed package contains 15 files.                                                                                                             |
| Node 22.22.0, npm 11.19.0 | All required local gates passed in a disposable workspace nested at the CI checkout path, with `dist` removed before lint/build. An initial direct run at the `/work` filesystem root produced lint/scanner false positives because official plugin package discovery skips a package directly at that root; no repository code, dependencies, or configuration changed. |

The 24 reported npm audit advisories comprise 7 moderate and 17 high, with 0 critical, in the tool/peer dependency tree. Batch 2 adds no runtime dependency. The required package check passed. A separate ancillary release-policy audit exited 1 because it flags the README's truthful unpublished/unavailable statement and prerelease wording; the unpublished wording remains as instructed. This policy-audit finding is separate from the passing package check.

The packed-install smoke installs in an isolated consumer and resolves host-provided `n8n-workflow` through `NODE_PATH`; it is separate from disposable n8n. Batch 2's 15-file packed package passed compiled loading and isolated installation. The published-package scan is expected to report the package as unpublished; it is not source-scanner evidence.

### Disposable n8n 2.30.6 (core 2.30.3)

The disposable instance used the pinned image `n8nio/n8n@sha256:efe735b31f5d4ed35a057a56d9a803e42f933a2b028b69b8462d9c4a7c90fe5c`. Batch 2's packed package was loaded into a fresh container and its native routing was exercised against deterministic local HTTPS fixtures, not Geoapify's service.

Twenty-seven native fixture cases completed and their assertions passed. Coverage included circle/rectangle/place filters and coordinate order, proximity bias, expressions, categories, raw empty output, repeated and overlapping pages, request/result caps, offset progression, multi-input linkage, Continue On Fail and error output, authentication 401, 429 with Retry-After 2, delayed 500, malformed response, 30-second timeout, Place Details identifiers and multiple polygon/multipolygon features, confidence preservation, and Batch 1 geocoding regressions. Fixture results establish n8n routing behavior against the local fixture only.

The actual editor was exercised in a disposable n8n browser session. Observed category search and selection of `commercial.supermarket`, custom category entry, conditional Circle/Rectangle/Place Boundary controls, and Place Detail → Get with its required Place ID. Switching back to Geocoding selected Forward and showed its expected fields. The API Key rendered as a password control; native credential testing opened the success dialog against the local HTTPS fixture. An imported workflow populated expressions for `customCategories` (`{{$json.categories}}`), latitude/longitude, Max Results, and Page Size. The Details menu also showed n8n's host-provided Custom API Call entry; it is not a package operation. Node and credential UI screenshots were visually reviewed in light and dark themes, with masked credentials. Proximity controls appeared when enabled; an editor expression execution returned three linked fixture matches. Chrome DevTools was used with explicit user authorization after CUA browsers reported unavailable. Batch 1's additional screenshots below remain historical evidence.

The n8n host may append a Custom API Call menu entry for generic-auth credentials. The package itself registers only its listed operations; it does not remove this host-provided entry. Batch 2 screenshots: `/tmp/geoapify-batch2-runtime/category-search.png`, `credential-light.png`, and `node-dark.png`. The dark screenshot and `credential-dark.png` passed visual review.

### Live API status

No authenticated, opted-in smoke using a real Geoapify account key was performed. Mocked requests and the placeholder credential fixture do not establish live API behavior. Keep the optional live procedure below for a future authorized smoke.

## Local commands

Run the repository gates from the package root after the final implementation is integrated:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run scan:source
npm run package:check
npm run smoke:load
npm run smoke:install
git diff --check
```

CI retains Node 22.22.0 and Node 24 lanes with the repository's pinned npm 11.19.0. Node 22.22.0 local gates now pass in the nested CI-path workspace described above; GitHub CI results remain separate from local checks.

## Batch 1 historical disposable n8n editor and runtime checklist

Use the pinned disposable image above and the packed tarball, with a fresh isolated n8n instance. The checks below were completed against a local HTTPS fixture; they do not substitute for live Geoapify verification:

1. The packed Geoapify registration loaded in disposable n8n. The API Key control rendered as `type=password`, and the native credential test succeeded against the local fixture.
2. The editor displayed friendly operation labels; switching forward/reverse showed relevant fields, and expression entry was confirmed. Required-state and display-visibility checks passed.
3. A local deterministic HTTPS fixture observed structured requests, reverse coordinates including zero and inclusive boundary values, option expressions, two inputs with four results, and empty result sets. The native credential test used an authenticated `GET /geocode/search`, `limit=1`, and `format=geojson`; the dialog displayed **Connection tested successfully**. These were local fixture requests, not live Geoapify calls.
4. Fixture authentication failure, 429 with Retry-After `2`, service 500, malformed responses, timeout, and both error-output and Continue On Fail linkage were observed. Distinguish fixture execution from Geoapify live behavior.
5. Raw mode returned one FeatureCollection item per input, including the empty FeatureCollection; per-match empty results returned zero items, and native **Always Output Data** produced one empty item in per-match mode. Multi-input results retained successful paired-item indexes `0,0,1,1`; Continue On Fail output carried indexes `0,1,1`. The node and credential icons were visually inspected in both light and dark themes.

Screenshots were reviewed for exposed credential text: `/tmp/geoapify-runtime-smoke/credential-light.png`, `/tmp/geoapify-runtime-smoke/credential-dark.png`, `/tmp/geoapify-runtime-smoke/final-forward.png`, and `/tmp/geoapify-runtime-smoke/node-dark.png`. UI metadata inspection alone does not prove the fields render correctly.

## Optional live smoke

Only run when a Geoapify key is already securely available and live API use is explicitly opted into. Enter the key directly into the disposable n8n credential form; do not place it in source, workflow JSON, command arguments, shell history, environment variables, logs, screenshots, or error output. Do not retry automatically and do not record the key.

A bounded Places smoke consists of two operation requests (the credential form can also issue its one-request geocoding connection test; account for that additional request in the opt-in budget): run Place → Search with category `catering.cafe`, circle center latitude `48.8584` and longitude `2.2945`, radius `1000` meters, Page Size `1`, Maximum Results `1`, Maximum Requests `1`, and Start Offset `0`; if a result returns a `place_id`, run Place Detail → Get once with that identifier. Record only the UTC date, endpoint/operation, HTTP status, and whether the documented response shape was returned. Do not claim a credit count or account usage without authoritative account-specific evidence. If no secure key and explicit opt-in are available, leave live API behavior unverified.

## Batch 2 required cases and current evidence

Batch 2 adds coverage for category catalog provenance/search/custom values and expressions; actual n8n parameter shapes; each spatial filter with longitude/latitude ordering, zeros, boundaries, and invalid input; proximity ranking distinct from filtering; and pagination caps, offset, repeated/empty/short pages, no-progress handling, deduplication, result/request bounds, and linked multi-input outcomes. Place Details coverage must include valid/invalid identifiers, empty and multiple features, properties and IDs, related features, and all supported geometry shapes including GeometryCollection. Also verify confidence preservation when returned, raw/default output, Continue On Fail/error output, sanitized service/auth/quota errors, malformed responses, timeouts, and Batch 1 geocoding regressions/compiled registrations.

Batch 2 implementation and package gates are recorded in the handoff; light/dark UI review passed; Node 22.22.0 local gates passed. Do not convert test fixtures or metadata into live service claims. The source/API comparison is in [the API matrix](api-matrix.md); exact implementation and check outcomes belong in [the Batch 2 handoff](batch2-handoff.md). The optional live procedure is a bounded Place → Search with low `maxResults` and `maxRequests`, followed by Place Detail → Get for an identifier returned by that search, entered and executed in the disposable n8n UI. Run it only with a securely available key and explicit live-use opt-in. Do not ask for a key to begin or put it in source, workflow JSON, command arguments, environment variables, logs, screenshots, or fixtures. If no opted-in key is available, retain live API status as unverified.
