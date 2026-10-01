# Template migrations

GitHub creates a new repository from a snapshot of this template. Generated repositories do not inherit later template changes automatically.

The current reusable baseline and canonical source repository are recorded in `.blackswamp/template.json`. Keep that file after generation so maintainers can compare their adopted version with future template releases. Updating the marker alone is not a migration: review the template diff, adopt each relevant script, workflow, test, or documentation change, run every local gate, and then update the marker in the generated repository.

## 2.2.0

- Added an optional, read-only Discord notification job after successful npm publication and published-package verification. Configure `DISCORD_WEBHOOK` as a repository Actions secret to enable it; notification failures remain isolated from the immutable release.
- Routed `npm run dev` through a cross-platform Node launcher that explicitly sets `N8N_PORT=5690`, preserving the CLI's isolated user folder and forwarded arguments while avoiding an existing n8n service on 5678.
- Documented manual browser navigation to `http://localhost:5690`, since the pinned CLI shortcut still opens 5678, and an explicit `N8N_PORT=5692 npm exec -- n8n-node dev --custom-user-folder /tmp/n8n-node-run` alternative when 5690 is occupied.

Generated repositories adopting this migration should copy the launcher, notification script, tests, and workflow job; add `DISCORD_WEBHOOK` only when notifications are desired; and update their local smoke instructions. Review workflow permissions and run the full validation suite before updating `.blackswamp/template.json` to `2.2.0`.

## 2.1.1

- Updated the pinned official n8n community-package scanner from 0.34.0 to 0.38.0 in package
  metadata, release invariants, tests, and the fail-closed published-package wrapper.
- Required codex manifests to use a category supported by scanner 0.38.0. Generated repositories
  using an unsupported category such as **Developer Tools** must select the supported category that
  accurately describes their integration; do not copy a category without reviewing product fit.
- Kept the scanner's aliased TypeScript 6 dependency nested beneath the scanner in the lockfile so it
  cannot replace the project's pinned TypeScript 5.9 `tsc` executable during `npm ci`.

Generated repositories adopting this migration should update each active scanner pin, regenerate the
lockfile without upgrading unrelated dependencies, inspect every `*.node.json` category against the
current supported vocabulary, and verify that `node_modules/.bin/tsc` resolves to the project's pinned
compiler after a fresh frozen install. Run the full validation suite before updating
`.blackswamp/template.json` to `2.1.1`.

## 2.1.0

- Made declarative routing the required starting point for ordinary REST API nodes, including an explicit evaluation of routing, expressions, pagination, `preSend`, and `postReceive`.
- Required a concrete, recorded exception before using programmatic execution; generic "weird JSON" is not sufficient justification.
- Removed the programmatic Example fixture and made GitHub Issues the sole registered, canonical declarative example.
- Added implementation-style evidence to the API matrix and builder handoff templates.
- Split testing guidance between declarative routing contracts and programmatic responsibilities such as input immutability and paired-item lineage.

Generated repositories adopting this migration should classify each existing operation in their API matrix. Convert ordinary REST operations when contract tests show declarative parity; retain programmatic implementations only where the documented exception remains necessary. Run the full validation suite before updating `.blackswamp/template.json` to `2.1.0`.

## 2.0.1

- Split immutable npm publication from post-publication registry/provenance verification. A failed verifier can now be rerun without attempting to republish an existing version.
- Added the exact transient provenance source-repository 404 to the bounded scanner propagation policy; 403, rate-limit, timeout, policy, lint, and unrelated failures still fail immediately.
- Replaced the sparse README starter with a canonical Black Swamp AI structure and explicit verified, manual Community Nodes, and private/unavailable distribution choices.
- Clarified that npm tarball icons, the npm homepage/README, and n8n Creator Portal cards are separately validated surfaces.
- Documented the Node 22/24 migration trap: do not carry forward `.npmrc` `engine-strict=true` with a package engine that excludes either CI lane.
- Require new migration branches to start from the current post-squash `main`, not the pre-merge feature history.

## 2.0.0

- Added official n8n source and built-output scanner preflight.
- Added explicit-success post-publication scanning with bounded propagation handling.
- Added token-bootstrap/OIDC npm-auth preparation and npm version verification.
- Added generic compiled-registration and isolated packed-install smoke tests.
- Added reusable API, testing, branding, operation-contract, PR, and batch-handoff guidance.
