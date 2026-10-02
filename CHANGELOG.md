# Changelog

Notable user-facing changes are recorded here.

## 0.1.0

- Add forward and reverse geocoding with structured or free-form addresses and feature or raw FeatureCollection output.
- Add a forward-only Amenity / Place result type for explicitly filtering free-form place searches; Any continues to omit the type parameter.
- Add bounded Places search with spatial filters, category selection, proximity ranking, and pagination.
- Add Place Details retrieval with complete FeatureCollection output.
- Add routing for ordered waypoints and documented travel modes, with complete route-feature or raw FeatureCollection output.
- Add fail-closed annotated release-tag validation, source-review gates before build, strict registration-constructor smoke checks, bounded published-scan propagation retries, and manual CI dispatch while publication remains tag-only.
