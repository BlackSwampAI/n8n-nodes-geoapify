# Template migrations

GitHub creates a new repository from a snapshot of this template. Generated repositories do not inherit later template changes automatically.

The current reusable baseline and canonical source repository are recorded in `.blackswamp/template.json`. Keep that file after generation so maintainers can compare their adopted version with future template releases. Updating the marker alone is not a migration: review the template diff, adopt each relevant script, workflow, test, or documentation change, run every local gate, and then update the marker in the generated repository.

## Unversioned follow-up: Discord notification wording

- The Discord release message now confirms npm publication and published-package verification succeeded, shows repository/tag as plain text, and includes one encoded GitHub tag/source URL. It no longer includes npm or workflow-run URLs.
- This follow-up updates notification wording and its tests only. The separate published-scanner settling/retry change is not adopted here.

Generated repositories do not receive this follow-up automatically. Copy the notification script and tests, update the matching release guidance, and run the relevant validation. Keep the existing `.blackswamp/template.json` marker unchanged for this unversioned follow-up.

## Unversioned follow-up: release and source guards (2026-10-02)

- Adopted from the [pinned template commit](https://github.com/christopherjnelson/n8n-community-node-template/commit/596e784cfe69cd8894529b8a81c491921cde9773): an annotated-tag guard before setup/install/auth/publication, a source-review gate before build, exact registration-constructor checks, CI manual dispatch, bounded published-scanner settling, and read-only recovery guidance.
- The scanner waits 60 seconds before its first attempt and retries at most 10 times at 30-second intervals only for recognized propagation failures (360 seconds total wait, excluding scanner runtime). Success requires exit status zero, no spawn error, and the exact success marker.
- Manual dispatch applies to CI after the workflow reaches the default branch; publishing remains tag-only. The tag guard cannot prove human review, successful CI, or historical tag immutability. Keep human review and CI as release requirements and never move, delete, or replay tags.
- The source reviewer detects only its documented narrow AST shape; constructor matching is package hygiene, not runtime correctness. Recovery guidance cannot restore GitHub Actions state, permissions, secrets, npm trust configuration, or registry state; operators must inspect those external systems and current npm policy before acting.

Generated repositories adopting this follow-up should compare against the pinned template commit above, copy the scripts/workflow gates/tests/guidance, run the full local and CI checks, and preserve the existing template marker until a separately reviewed versioned migration.

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
