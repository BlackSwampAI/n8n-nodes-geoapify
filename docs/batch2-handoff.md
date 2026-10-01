# Batch 2 handoff — Geoapify Places

## Scope and status

- Goal: add independently usable Places category search and Place Details retrieval.
- Branch: `feat/geoapify-places`, based on freshly updated `main`.
- Included operations: Places → Search and Place Details → Get.
- Deferred: Routing (Batch 3), release-readiness work (Batch 4), autocomplete, asynchronous batch APIs, matrices, optimization, isolines, map matching, static maps, tiles, elevation, geometry operations, MCP, and triggers.
- Distribution: the package remains unpublished and unavailable for npm installation. No publication or release action is part of this batch.
- Current local evidence: Node 24.18.0/npm 11.19.0 package gates passed; 27 native fixture cases passed in disposable n8n 2.30.6/core 2.30.3. Light/dark UI review passed; Node 22.22.0 local gates passed. See [testing](testing.md); no live Geoapify behavior is claimed.

## Contract sources and discrepancies

The OpenAPI catalog was checked first on 2026-09-30 at Geoapify OpenAPI commit [`e8255e614648084d86bae2155c20347d5203ec1d`](https://github.com/geoapify/geoapify-openapi-specs/tree/e8255e614648084d86bae2155c20347d5203ec1d). Only the Batch 2 specs were loaded in this research pass: [Places API v2.2.0](https://github.com/geoapify/geoapify-openapi-specs/blob/e8255e614648084d86bae2155c20347d5203ec1d/api-specs/places/places-api-openapi-specs.json), `GET /v2/places`, SHA-256 `21eb86d0fb7c29fdfc15285001108a775fb1b914d764aeb5c21259c889456fb4`; and [Place Details API v2.1.1](https://github.com/geoapify/geoapify-openapi-specs/blob/e8255e614648084d86bae2155c20347d5203ec1d/api-specs/place-details/place-details-api-openapi-specs.json), `GET /v2/place-details`, SHA-256 `abc827ffde68143c1b6843c5b64642127e4293926f9005428db0940c2b63a433`. The checked catalog copy has SHA-256 `27527ab15df687642498b2b33860ed474b45a4efa1e0328d7abdc5ae291851f6`.

Current human pages reviewed 2026-09-30: [Places](https://apidocs.geoapify.com/docs/places/) and [Place Details](https://apidocs.geoapify.com/docs/place-details/). Official pagination guidance: [paginate place results](https://apidocs.geoapify.com/how-to/place-discovery/paginate-place-results/) and [retrieve places in a large area](https://apidocs.geoapify.com/how-to/place-discovery/retrieve-places-large-area/). These guides support bounded offset pagination and warn that pagination is not an exhaustive dataset export. OpenAPI schemas, mocked fixtures, and local n8n runs do not establish authenticated live API behavior.

Recorded contract/documentation differences:

- The Places schema has 833 category enum keys. Comparison with the captured human Places category table/text has 20 enum keys absent: `traffic_signals`, `natural.water.inland`, `natural.water.moat`, `continent`, `island`, `power.tower`, `power.pole`, `power.portal`, `power.switch`, `power.catenary_mast`, `power.cable`, `power.terminal`, `power.insulator`, `power.heliostat`, `power.connection`, `power.inverter`, `power.converter`, `power.compensator`, `power.circuit`, and `tourism.sights.square`. Category membership in the spec is not proof of live acceptance.
- The human Places prose says country filtering is coming soon although the schema models it. Country filtering is excluded from the UI.
- The Places GET filter is a generic string; the typed POST boundary schema uses hexadecimal IDs with length 2–2048. The GET UI accepts opaque identifiers within that length and rejects whitespace/control/filter delimiters; it does not impose the POST hexadecimal pattern or claim the fixture identifier is accepted live.
- Place Details schema describes `features` as pipe-separated; the human reference describes commas. No feature selector is exposed because the operation requests the documented default details set.
- The human Details page lists six geometry kinds while the response schema also includes GeometryCollection. The node preserves returned geometry without narrowing its shape.

## Decisions and output contracts

The n8n editor displays the singular resource labels **Place → Search** and **Place Detail → Get** to satisfy the official scanner’s resource naming convention. Workflow parameter values remain `places` and `placeDetails`; these wrap Geoapify’s Places and Place Details APIs.

Places Search uses required categories from a bundled catalog derived from the pinned schema. Searchable multi-select choices cover ordinary use; custom comma-separated input supports expressions and manually entered values. Values are validated against the catalog, 1–100 unique entries, before transport. A category can represent a hierarchy; parent categories include subcategories according to the human documentation.

Search takes exactly one spatial restriction: circle, rectangle, or place boundary; None is valid only when optional proximity bias is enabled. Parameters use `filterLatitude`, `filterLongitude`, and `filterRadius` for circle; `southLatitude`, `westLongitude`, `northLatitude`, and `eastLongitude` for rectangle; and `filterPlaceId` for place boundary. Coordinates serialize in the endpoint's longitude-first order. Circle serializes as `circle:lon,lat,radiusMeters`, with a positive radius. Rectangle serializes as `rect:westLon,southLat,eastLon,northLat`; west must be less than east and south less than north, so antimeridian crossing is rejected. Place boundary serializes as `place:<placeId>`. Optional `useProximityBias`, `biasLatitude`, and `biasLongitude` serialize independently as ranking bias and do not define the result boundary.

Categories use `categoryMode=catalog` with the `categories` array or `categoryMode=custom` with comma-separated `customCategories`; both support expressions and validate against the bundled catalog. Pagination is under `searchOptions`: pageSize 1–500 (default 20), maxResults 1–5000 (default 20), maxRequests 1–20 (default 5), startOffset 0–1,000,000, and outputFormat. There is no Return All control. The callback ends on request/result caps, an empty or short page, a repeated page, or no progress; it deduplicates returned places. A later-page failure fails that input instead of presenting an incomplete result as complete. Each request has a 30-second timeout and the node does not retry automatically. The 5,000-result, 20-request, and 1,000,000-offset ceilings are node safety guards, not asserted Geoapify account or API limits. The official GET contract supplies the 1–500 page limit and nonnegative offset.

Default search output follows Batch 1: one item per feature, with properties promoted to top-level JSON and geometry/identifiers retained; service-returned confidence/rank fields remain when present. Successful empty results produce zero items. Raw mode produces a bounded aggregate with first-page FeatureCollection metadata, deduplicated features from fetched pages, and `_geoapifyPagination` (`requests`, `returned`, `stopReason`). This is not a verbatim single service response. Empty raw search output still produces one collection item.

Place Details Get (`placeDetails` → `get`) requires `placeId`, a documented identifier obtained from Geoapify results. It returns one complete FeatureCollection per input, including an empty collection, and preserves returned identifiers, all properties, related features, and geometry. It does not assume Point geometry or expose advanced enrichment selectors.

## Implementation style

Both operations use declarative routing because they are ordinary GET REST endpoints supported by fixed operation URLs, expressions, `makeRoutingRequest`, pagination hooks, and `postReceive`. Places needs a bounded pagination callback for controlled multi-page retrieval and linked validation/transport errors; this remains the n8n routing mechanism, not a custom `execute` method or transport. Place Details requires one request per input. The callback-level validation/error catch follows Batch 1's observed n8n core 2.30.3 behavior where `preSend` errors bypassed its callback catch. Do not claim that n8n's host-provided Custom API Call menu entry has been removed.

## Verification handoff

### Builder and package evidence

Implementation and tests were completed by the configured GPT-6-Luna Medium builder. The orchestrator reviewed the complete source diff and the implementation handoff. A prior documentation helper was interrupted after its model configuration could not be guaranteed; no recursive delegation was used for implementation. The reviewed node source SHA-256 is `c6c957e7bfea707a8220f43b3ec59133608e8cd40aab164b151b82d10323b4b5`.

On Node 24.18.0 with npm 11.19.0, formatting, lint, strict typecheck, all 96 Vitest tests across 5 files, build, official source and built-output scanner preflights, package check, compiled-load smoke, isolated packed-install smoke, and `git diff --check` passed. The tarball has 15 files. No runtime dependency was added. `npm audit` reported 24 advisories in the tool/peer dependency tree (7 moderate, 17 high, 0 critical). The required package check passed. An ancillary release-policy audit exited 1 after flagging truthful unpublished-package wording and prerelease wording; the unpublished/unavailable statement is retained, as required.

Node 22.22.0/npm 11.19.0 local gates passed in a disposable workspace nested at the CI checkout path, with `dist` removed before lint/build. An initial direct run at the `/work` filesystem root produced lint/scanner false positives because the official plugin package discovery skips a package directly at that root; no repository code, dependencies, or configuration changed. GitHub CI results must still be reported separately from local checks. The required changed-file allowlist reviewed by the orchestrator contains 11 files: `CHANGELOG.md`, `README.md`, `docs/api-matrix.md`, `docs/testing.md`, `docs/batch2-handoff.md`, `nodes/Geoapify/Geoapify.node.json`, `nodes/Geoapify/Geoapify.node.ts`, `nodes/Geoapify/place-categories.ts`, `tests/operation-contract.test.ts`, `tests/places-contract.test.ts`, and `tests/places-validation.test.ts`.

### Packed package in disposable n8n

A fresh disposable n8n 2.30.6 container with core 2.30.3 loaded the packed package from the pinned image recorded in [testing](testing.md). Twenty-seven native fixture cases completed and passed. The fixture suite covered pagination, filters, bias, expressions, raw empty output, repeated/overlapping pages, request caps, linkage, Continue On Fail/error output, 401, 429/Retry-After 2, delayed 500, malformed responses, timeout, Details IDs and multiple polygon/multipolygon features, confidence, and geocoding regressions. These were deterministic local HTTPS responses, not live Geoapify responses.

The actual editor was exercised in a disposable n8n browser session. Observed category search and selection of `commercial.supermarket`, custom category entry, conditional Circle/Rectangle/Place Boundary controls, and Place Detail → Get with its required Place ID. Switching back to Geocoding selected Forward and showed expected fields. The API Key rendered as a password control; native credential testing opened the success dialog against the local HTTPS fixture. An imported workflow populated expressions for `customCategories` (`{{$json.categories}}`), latitude/longitude, Maximum Results, and Page Size. The Details menu also showed n8n’s host-provided Custom API Call entry; it is not a package operation. Light and dark node/credential screenshots were visually reviewed; no credential text was exposed. Proximity controls appeared when enabled, and expression execution in the editor returned three linked fixture matches. Chrome DevTools was used with explicit user authorization after the CUA browsers reported unavailable. Screenshots: `/tmp/geoapify-batch2-runtime/category-search.png`, `credential-light.png`, `node-dark.png`, and `credential-dark.png`.

### Live status

Live authenticated Geoapify behavior remains unverified. No real key was available or opted into. The exact optional two-request smoke is in [testing](testing.md); it uses one low-cap cafe search and, if returned, one Place Details request. It does not assert a credit count. Do not request a key to complete local integration checks.

## Final review record

- Builder model: configured GPT-6-Luna Medium. The orchestrator reviewed the implementation diff and recorded the allowlist and local validation above.
- Integration fixture evidence: 27 native cases passed. Light/dark UI review passed; Node 22.22.0 local gates passed.
- Live API: unverified unless separately and explicitly opted into.
- PR URL, actual state, and branch head SHA belong in the external orchestrator handoff after the unmerged PR is opened.
- An ancillary release-policy audit script exited 1 because it flagged the README's unpublished/unavailable statement as stale and warned about prerelease claims in RELEASING/testing documentation. The unpublished wording is retained as required by this batch's distribution instructions. This is a release-policy audit finding, not a package-check result; the required package check is reported separately by the orchestrator.
