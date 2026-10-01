# Changelog

Notable user-facing changes are recorded here. This package is not yet published.

## Unreleased — Template 2.2.0

- Adopt the disposable local n8n port launcher and optional post-verification Discord release notification.

## Unreleased — Batch 1: Geocoding

- Replace the GitHub Issues template example with the Geoapify API credential and Geoapify geocoding node.
- Add forward geocoding with free-form and structured address input, and reverse geocoding with separate latitude/longitude controls.
- Return one item per GeoJSON match by default, preserve properties and geometry, offer the raw FeatureCollection output, and define zero-match behavior.
- Adopt the product identity, documentation, testing, and branding records for `@blackswampai/n8n-nodes-geoapify`.

## Unreleased — Batch 2: Places

- Add category-based Places Search with circle, rectangle, and place-boundary filters, optional proximity ranking bias, source-backed category choices, and bounded pagination.
- Add Place Details Get with complete FeatureCollection output that preserves identifiers, properties, related features, and supported geometry.

## Unreleased — Batch 3: Routing

- Add Routing Calculate for ordered latitude/longitude waypoints and Geoapify's documented travel modes.
- Return the complete route feature by default or the raw FeatureCollection, preserving route geometry, properties, and legs.

## Planned roadmap

The roadmap is recorded in [the Batch 1 handoff](docs/batch1-handoff.md). Batches 1 and 2 are merged; this change adds Batch 3. Each later batch is intended to start from freshly updated `main` after the preceding PR is merged.
