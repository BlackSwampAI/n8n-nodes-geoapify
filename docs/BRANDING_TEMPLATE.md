# Branding and independence template

This integration must remain clearly independent from the compatible service.

Use wording equivalent to:

> This is an independent community integration and is not affiliated with, endorsed by, sponsored by, or maintained by `<SERVICE_OWNER>`. Product names and marks belong to their respective owners and are used only to identify compatibility.

For every vendor asset, record:

| Packaged path     | Asset purpose     | Official source URL       | Immutable commit/version        | Access date     | SHA-256    | Current app reference checked | License/trademark note                 |
| ----------------- | ----------------- | ------------------------- | ------------------------------- | --------------- | ---------- | ----------------------------- | -------------------------------------- |
| `<PACKAGED_PATH>` | `<ASSET_PURPOSE>` | `<VENDOR_CONTROLLED_URL>` | `<IMMUTABLE_COMMIT_OR_VERSION>` | `<ACCESS_DATE>` | `<SHA256>` | `<CURRENT_APP_REFERENCE>`     | `<VERIFIED_LICENSE_OR_TRADEMARK_NOTE>` |

Prefer the official square product glyph actually referenced by the current application. Do not redraw, trace, recolor, or generate vendor marks. Verify light/dark source and packed assets by hash. If licensing or current-product identity is unclear, retain a neutral original integration icon and document the blocker rather than claiming permission.

Prefer a square canvas for node-card legibility; document upstream exceptions rather than altering official assets. Verify light and dark rendering on contrasting backgrounds, every node and credential icon in the packed tarball, nonempty SVG/PNG files, SVG viewBox usability, immutable provenance, and hashes. After submitting the exact published version, visually record the Creator Portal card version and logo because portal metadata can remain stale independently.

Treat these as separate surfaces: source and packed icon files, the npm package README/homepage, and the n8n Creator Portal card. Passing one does not prove that another has refreshed. Do not redraw or AI-generate a vendor logo to compensate for stale portal metadata.
