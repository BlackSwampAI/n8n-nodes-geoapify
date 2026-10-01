# Batch 1 handoff — Geoapify geocoding

## Scope

- Goal: prepare the independent `@blackswampai/n8n-nodes-geoapify` package and deliver forward/reverse geocoding as the first independently reviewable feature batch.
- Repository: `BlackSwampAI/n8n-nodes-geoapify`; homepage: <https://blackswampai.com/n8n-nodes/geoapify/>.
- Implementation in this batch: Geoapify API key credential, forward geocoding (free-form and structured), reverse geocoding (separate latitude and longitude), normalized feature output/raw collection option.
- Non-goals: publication, tagging, release creation, repository visibility changes, merge, and all later roadmap operations.
- Maintainer: Christopher J. Nelson. License: MIT.
- Distribution: the package is unpublished and unavailable as of 2026-09-30. It has not been verified for community discovery. No npm install command should be presented until authorized publication and actual availability.
- Implementation style: declarative routing for both REST operations.
- Style evidence: declarative operation routing chooses a fixed absolute URL expression. The node defines no `requestDefaults`; its absolute URL expression is independent of a shared base URL. n8n core may append a host-provided generic Custom API Call menu entry for credentials with generic authentication; this isn't implemented or registered as a Geoapify operation. A one-request `send.paginate` callback validates before `makeRoutingRequest` and catches transport errors; this is necessary because n8n core 2.30.3 `preSend` failures occurred outside that callback's catch, preventing a linked sanitized error item under Continue On Fail. `postReceive` validates and normalizes responses. The callback makes at most one request per input and does not implement API pagination, looping, or automatic retry. This remains declarative routing, with no `execute` method or custom transport. Expressions remain supported.

## Contract and output decisions

Official OpenAPI catalog checked first on 2026-09-30. Only forward and reverse specs from Geoapify OpenAPI commit `e8255e614648084d86bae2155c20347d5203ec1d` were loaded. Human documentation was compared; auth header/query examples, filter serialization, and reverse-only schema values differ, as detailed in [the API matrix](api-matrix.md). No live behavior is inferred from those schemas.

The credential sends `x-api-key` from n8n's credential mechanism. Its Berlin search test is a documented API request consuming one credit under Geoapify's one-request/one-credit pricing. In the disposable UI, the API Key field rendered as `type=password`; saving a placeholder credential generated a native authenticated `GET /geocode/search` with `limit=1` and `format=geojson` against the local fixture, and the dialog displayed **Connection tested successfully**. This verifies the credential UI/request against the local fixture only; it is not a live Geoapify check. Output defaults to one item per feature with `properties` promoted to the top-level JSON and `geometry` retained. A successful empty result produces zero items in this mode; n8n Always Output Data can supply an empty item. Raw mode returns one full FeatureCollection item per input, including `features: []` for an empty result. No result is silently selected as the sole match. Confidence and rank fields are kept when the service returns them; they are not a promise of postal deliverability.

## Roadmap

Only Batch 1 is implemented in this PR. Every later feature branch starts from freshly updated `main` after the preceding PR has merged; do not stack future batch branches on this unmerged branch.

| Batch | Planned branch                    | Scope                                                                                                                                                                                                                                                                    | Status       |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1     | `feat/geoapify-geocoding`         | Credential, forward and reverse geocoding                                                                                                                                                                                                                                | This PR only |
| 2     | `feat/geoapify-places`            | Category-based Places search with documented circle, rectangle, and place-boundary filters; optional proximity bias distinguished from spatial filtering; bounded pagination; Place Details; source-backed searchable category choices with expression/custom value path | Deferred     |
| 3     | `feat/geoapify-routing`           | Route calculation with ordered waypoints, supported travel modes, clear distance/time units, preserved geometry; advanced options deferred unless needed for a usable basic operation                                                                                    | Deferred     |
| 4     | `feat/geoapify-release-readiness` | Real n8n validation, usability/error review, packed install, two importable workflows (address cleanup with uncertainty routed for review; venue discovery with details enrichment), release evidence and manual checklist                                               | Deferred     |

Do not implement autocomplete, asynchronous batch APIs, route matrices/optimization, isolines, map matching, static maps, tiles, elevation, geometry operations, MCP, or triggers in Batch 1.

## Verification handoff

See [testing and verification](testing.md) for detailed evidence. The packed package was loaded in disposable n8n 2.30.6/core 2.30.3. The editor verified field visibility, required controls, expressions, credential password masking and successful/negative credential tests against a local HTTPS fixture. Node and credential icons passed light/dark inspection. Native routing verified request expressions, structured and reverse coordinates, per-item success/error linkage, empty/default and raw outputs, rate/service/malformed errors, and the final sanitized 30-second timeout message. These are local fixture/UI results; live Geoapify behavior remains unverified because no authenticated smoke with a real account key was performed.

Node 22.22.0 with npm 11.19.0 and Node 24.18.0 with pinned npm passed the full local package gates: format, lint, strict typecheck, 19 tests across three files, build, source and built-output scans, package audit, compiled load, isolated packed install, and `git diff --check`. The Node 24 package audit verified 12 files (14,856 packed bytes; 56,494 unpacked bytes). The `smoke:install` isolated consumer is separate from loading and exercising the packed node in real n8n. CI workflow order remains unchanged; these are local runs, not GitHub Actions results.

## Branding and limits

The node and credential use original neutral location icons; there is no verified grant to reuse Geoapify artwork as the product icon. Provenance, hashes, completed light/dark credential and node icon checks, and screenshot evidence are recorded in [branding](branding.md). Keep the independent integration notice in product-facing docs.

**Options → Max Results** defaults to 5 for both forward and reverse geocoding when not specified. Requests are bounded to a 30-second timeout and the single-request transport error guard does not loop or retry. The final fixture timeout check completed at 30.111 seconds and returned `Geoapify request timed out.` with description `The Geoapify request timed out after 30 seconds`. Do not assume a plan-specific rate limit. Any n8n Retry On Fail recommendation should remain bounded and account for service rate-limit signals.
