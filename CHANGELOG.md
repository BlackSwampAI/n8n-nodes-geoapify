# Changelog

Notable user-facing changes are recorded here.

## Unreleased — Template release guards

- Add fail-closed annotated release-tag validation before publish setup, narrow source-review gates before build, strict registered-constructor smoke checks, and bounded published-scan propagation retries. CI supports manual dispatch; publishing remains tag-only.

## 0.1.0

- Add forward and reverse geocoding with structured or free-form addresses and feature or raw FeatureCollection output.
- Add bounded Places search with spatial filters, category selection, proximity ranking, and pagination.
- Add Place Details retrieval with complete FeatureCollection output.
- Add routing for ordered waypoints and documented travel modes, with complete route-feature or raw FeatureCollection output.
