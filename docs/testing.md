# Testing and verification

This file records what has actually been checked for the current Batch 1 package. A test, compiled registration load, n8n UI inspection, local request mock, and live Geoapify request are different evidence tiers; passing one does not prove another.

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

| Runtime                                              | Checks and result                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node 22.22.0, npm 11.19.0, isolated nested workspace | Full local gate set passed: format, lint, strict typecheck, 19 tests across three files, build, source and built-output scanner, package audit (12 files), compiled load (one node/one credential), isolated packed install. This is local validation, not a GitHub Actions run.                       |
| Node 24.18.0, pinned npm                             | All local gates passed: format, lint, strict typecheck, 19 tests across three files, build, source and built-output scanner, package audit, compiled load, isolated packed install, and `git diff --check`. The package audit verified a 12-file tarball (14,856 packed bytes; 56,494 unpacked bytes). |

The packed-install smoke installs into an isolated consumer and resolves host-provided `n8n-workflow` through `NODE_PATH`; it is separate from the disposable real n8n editor/runtime check below. Separately, the 12-file tarball was loaded and exercised in n8n 2.30.6. The published-package scan is expected to report the package as unpublished; that is not source-scanner evidence.

### Disposable n8n 2.30.6 (core 2.30.3)

The disposable instance used the pinned image `n8nio/n8n@sha256:efe735b31f5d4ed35a057a56d9a803e42f933a2b028b69b8462d9c4a7c90fe5c`.

The packed package was loaded and exercised in the disposable n8n instance against a local HTTPS fixture, not Geoapify's service.

| Area         | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Credential   | API Key control rendered as `type=password`. Native credential test sent Berlin search with `limit=1`, `format=geojson`, and the `x-api-key` header (no key in query); fixture returned HTTP success and the dialog said **Connection tested successfully**. Negative credential test showed `Authorization failed - please check credentials`. No real key or stored credential update was used.                                                                        |
| Editor       | Friendly labels, forward/reverse switching, operation-relevant fields, required controls, expressions, and node/credential icon displays passed in light and dark themes. n8n may append a host-provided Custom API Call item for a generic-auth credential; the package itself registers only the two Geoapify operations.                                                                                                                                              |
| Requests     | Expression values for `options.maxResults`, `options.language`, `options.resultType`, and `forwardOptions.countryCodes` resolved to HTTP `limit=2`, `lang=en`, `type=city`, and `filter=countrycode:us,ca`. Structured request transmitted `name`, `street`, `housenumber`, `city`, `country`, `filter`, `limit`, `lang`, and `format=geojson`. Reverse requests used named `lat=0&lon=0` and `lat=90&lon=-180`. Blank/invalid required input sent no transport request. |
| Item linkage | Two inputs yielded four success items paired to inputs `0,0,1,1`. In native error-output mode, two successes were linked `1,1` on the main output and one error linked to input `0` on the error output. With legacy Continue On Fail, output linkage was `0,1,1`.                                                                                                                                                                                                       |
| Output       | Default mode kept one item per feature. Empty result returned zero items; Always Output Data added one empty item in that mode. The editor's **Add Option → Output → Raw FeatureCollection** selection returned one full collection per input, including an empty `features: []` collection. No match was fabricated or silently selected.                                                                                                                               |
| Errors       | Fixture authentication failure, 429 with `Retry-After: 2`, service 500, malformed response, and Continue On Fail produced linked, sanitized errors. Final 30-second timeout completed at 30.111 seconds with `Geoapify request timed out.` and description `The Geoapify request timed out after 30 seconds.`                                                                                                                                                            |

Screenshots reviewed for credential text: `/tmp/geoapify-runtime-smoke/credential-light.png`, `credential-dark.png`, `final-forward.png`, and `node-dark.png`. The credential icon was visible at about 26 px; the node dark icon resolved from the packed `dist/icons/location.dark.svg` through n8n's icon request (40 px canvas, 20 px mark). See [branding](branding.md) for hashes and asset notes.

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

CI retains Node 22.22.0 and Node 24 lanes with the repository's pinned npm 11.19.0. Local Node version and each command's actual result should be recorded in the batch handoff; do not infer the unrun CI lane from a local pass.

## Disposable n8n editor and runtime checklist

Use the pinned disposable image above and the packed tarball, with a fresh isolated n8n instance. The checks below were completed against a local HTTPS fixture; they do not substitute for live Geoapify verification:

1. The packed Geoapify registration loaded in disposable n8n. The API Key control rendered as `type=password`, and the native credential test succeeded against the local fixture.
2. The editor displayed friendly operation labels; switching forward/reverse showed relevant fields, and expression entry was confirmed. Required-state and display-visibility checks passed.
3. A local deterministic HTTPS fixture observed structured requests, reverse coordinates including zero and inclusive boundary values, option expressions, two inputs with four results, and empty result sets. The native credential test used an authenticated `GET /geocode/search`, `limit=1`, and `format=geojson`; the dialog displayed **Connection tested successfully**. These were local fixture requests, not live Geoapify calls.
4. Fixture authentication failure, 429 with Retry-After `2`, service 500, malformed responses, timeout, and both error-output and Continue On Fail linkage were observed. Distinguish fixture execution from Geoapify live behavior.
5. Raw mode returned one FeatureCollection item per input, including the empty FeatureCollection; per-match empty results returned zero items, and native **Always Output Data** produced one empty item in per-match mode. Multi-input results retained successful paired-item indexes `0,0,1,1`; Continue On Fail output carried indexes `0,1,1`. The node and credential icons were visually inspected in both light and dark themes.

Screenshots were reviewed for exposed credential text: `/tmp/geoapify-runtime-smoke/credential-light.png`, `/tmp/geoapify-runtime-smoke/credential-dark.png`, `/tmp/geoapify-runtime-smoke/final-forward.png`, and `/tmp/geoapify-runtime-smoke/node-dark.png`. UI metadata inspection alone does not prove the fields render correctly.

## Optional live smoke

Only run this when a Geoapify key is already securely available and live API use is explicitly opted into. Enter the key directly into the credential form of the disposable n8n instance; do not put it in source, workflow JSON, fixtures, command arguments, shell history, environment variables, logs, screenshots, or error output. A minimal smoke consists of the credential test (`/geocode/search?text=Berlin&limit=1`), one forward query for a known address with `limit=1`, and one reverse query using returned coordinates: three requests/credits according to Geoapify's one-credit-per-request pricing. Record the UTC date, package/API route, account plan if known, status/result shape, and usage implications without recording the key or personal account data. Any additional requests increase that budget; do not retry automatically. If no key/opt-in is available, leave live API evidence marked unverified.
