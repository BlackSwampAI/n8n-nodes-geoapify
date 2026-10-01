# Changelog

Notable user-facing changes are recorded here. This package is not yet published.

## Unreleased — Batch 1: Geocoding

- Replace the GitHub Issues template example with the Geoapify API credential and Geoapify geocoding node.
- Add forward geocoding with free-form and structured address input, and reverse geocoding with separate latitude/longitude controls.
- Return one item per GeoJSON match by default, preserve properties and geometry, offer the raw FeatureCollection output, and define zero-match behavior.
- Adopt the product identity, documentation, testing, and branding records for `@blackswampai/n8n-nodes-geoapify`.

## Planned roadmap

The roadmap is recorded in [the Batch 1 handoff](docs/batch1-handoff.md). Only Batch 1 is included in this change. Each later batch is intended to start from freshly updated `main` after the preceding PR is merged.
