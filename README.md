# Geoapify for n8n

An independent n8n community node for Geoapify geocoding, Places search, and Place Details.

> This is an independent Black Swamp AI community integration. It is not affiliated with, endorsed by, sponsored by, or maintained by Geoapify. Product names and marks belong to their respective owners and are used only to identify compatibility.

[Installation](#installation) · [Compatibility](#compatibility) · [Credentials](#credentials) · [Operations](#operations) · [Output](#output) · [Troubleshooting](#troubleshooting) · [Resources](#resources) · [Black Swamp AI](https://blackswampai.com/n8n-nodes/geoapify/)

## Installation

As of 2026-09-30, `@blackswampai/n8n-nodes-geoapify` is unpublished and unavailable for installation. It is not available through verified-node discovery or npm installation. Do not attempt an npm install until an authorized publication has completed and the package is available.

## Compatibility

| Surface      | Evidence                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| n8n          | Packed package loaded in disposable n8n 2.30.6 (core 2.30.3); editor switching/expression entry and local HTTPS-fixture routing were observed. See [testing notes](docs/testing.md). |
| Geoapify API | Contract design uses the official Geocoding API documentation and the OpenAPI specs pinned in [the API matrix](docs/api-matrix.md). Live API behavior has not been verified.         |
| Node.js      | Package requires Node.js 22.22.0 or newer; CI retains Node 22.22.0 and Node 24 lanes.                                                                                                |

## Credentials

Create one **Geoapify API** credential and enter your Geoapify API key in its password-masked field. The credential sends the key in the `x-api-key` request header. The node never asks for the key in a workflow parameter. Its credential test performs a documented forward-geocoding request for Berlin with a result limit of one. Geoapify's pricing documentation counts one credit per request, so the credential test consumes one credit.

## Operations

**Geocoding → Forward Geocoding** accepts either a free-form address/place name or a structured address. Structured fields are name, street, house number, postal code, city, state/region, and country. Enter at least one of name, street, postal code, city, state/region, or country; house number by itself is insufficient. Options include preferred language, Max Results (1–100; default 5), result type, and comma-separated ISO 3166-1 alpha-2 country codes. Country codes restrict the search area; they do not bias ranking by proximity.

**Geocoding → Reverse Geocoding** accepts decimal latitude and longitude in separate fields. Latitude is -90 to 90 and longitude is -180 to 180; zero is valid. Geoapify's reverse endpoint receives these as separate `lat` and `lon` query parameters. **Options → Max Results** defaults to 5 for both operations when no value is supplied.

**Place → Search** (Geoapify Places API) searches categories around a circle, within a rectangle, or inside a place boundary. These are spatial restrictions. The spatial filter can be set to None only when optional proximity bias is enabled; proximity ranks results and does not restrict them by itself. Categories come from the package's source-backed searchable catalog; use the custom category field for expressions or comma-separated values, which are validated against that catalog. Under **Search Options**, page size is 1–500 (default 20), maximum results 1–5000 (default 20), maximum requests 1–20 (default 5), and starting offset 0–1,000,000 (default 0). Retrieval is always bounded; there is no Return All control and pagination does not promise exhaustive results.

**Place Detail → Get** (Geoapify Place Details API) takes a documented Geoapify place identifier and returns the complete details FeatureCollection. It retains returned properties, identifiers, related features, and geometry, including non-Point geometry.

Autocomplete, batch APIs, Routing, and other Geoapify endpoints are outside this batch. The package registers the geocoding operations, Places Search, and Place Details Get. Depending on the n8n editor version, the host may also append its own **Custom API Call** entry for credentials with generic authentication; that host-provided affordance is not a Geoapify operation implemented by this package. Routing remains Batch 3; release-readiness work remains Batch 4. See the [Batch 2 handoff](docs/batch2-handoff.md).

## Output

For **Geocoding** and **Places Search**, the default **Output Format** is one item per feature. The feature's `properties` are placed at the top level and its `geometry` is retained as a top-level property. This keeps address/place fields, identifiers, coordinates, and returned rank or confidence fields accessible. Confidence and match metadata do not guarantee postal deliverability. Place Details always returns one complete FeatureCollection per input, including every related feature and its geometry.

For Geocoding select **Options → Output → Raw FeatureCollection**; for Places select **Search Options → Output → Raw FeatureCollection**. Geocoding returns the complete service FeatureCollection per input. Places returns a bounded aggregate: it keeps the first page's collection metadata, combines deduplicated features from retrieved pages, and adds `_geoapifyPagination` with request count, returned feature count, and stop reason. This aggregate is not a verbatim single service response. Empty per-feature search results produce zero items; raw outputs and Place Details return one collection item even when it has no features. Enable n8n's **Always Output Data** when using one-item-per-feature mode if the workflow should continue with an empty item after a no-match response. Multiple matches are returned; the node does not select a first match.

## Errors and limits

Invalid or blank required inputs are rejected before a request is sent. Requests use a 30-second timeout. The node does not retry automatically; if using n8n's **Retry On Fail**, choose a bounded retry count and respect service rate-limit guidance and your account plan. Authentication, quota, rate-limit, service, timeout, and unexpected-response errors should be handled through n8n's normal node error behavior. Never include API keys in workflow data, logs, screenshots, or support reports.

## Troubleshooting

- Check that the selected credential contains a valid Geoapify API key.
- Confirm latitude and longitude are in decimal degrees and have not been reversed.
- A successful zero-match response means the API returned no features for the supplied search; it is not an API error.
- Geoapify plan limits and rate-limit behavior can vary. Consult the official [Geoapify API documentation](https://apidocs.geoapify.com/docs/).
- Report reproducible defects at [GitHub Issues](https://github.com/BlackSwampAI/n8n-nodes-geoapify/issues) without including credentials or personal data.

## Resources

- [Geoapify API documentation](https://apidocs.geoapify.com/docs/)
- [Geoapify forward geocoding](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/)
- [Geoapify reverse geocoding](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/)
- [Geoapify Places](https://apidocs.geoapify.com/docs/places/)
- [Geoapify Place Details](https://apidocs.geoapify.com/docs/place-details/)
- [Compatibility and testing notes](docs/testing.md)
- [Changelog](CHANGELOG.md)
- [Black Swamp AI package page](https://blackswampai.com/n8n-nodes/geoapify/)

## License

[MIT](LICENSE.md)
