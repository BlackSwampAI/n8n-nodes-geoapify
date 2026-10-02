# Template release-guards migration handoff

## Scope and source

This unversioned follow-up adopts the release and source safeguards from pinned template commit `596e784cfe69cd8894529b8a81c491921cde9773`. It leaves `.blackswamp/template.json` at 2.2.0 because these follow-ups are not a versioned template release. The branch is based on post-squash `origin/main` at `c3545529b8f4bb856d6a7d655c44c5010076f5e3`.

The changes add a tag guard immediately after full-history checkout, source review before build in CI and publication, case-exact constructor registration smoke, manual CI dispatch, and a bounded scanner settling policy. Publication remains tag-only. `release-check` also resolves linked-worktree `.git` indirection and its common directory while retaining branding-document fallback for generated repositories.

## Evidence and verification

The guard verifies the tag name against package version, annotated tag object, checked-out commit, and fetched `origin/main` ancestry. The source-review AST check is intentionally narrow: direct empty `INodeProperties[]`/`Array<INodeProperties>` declarations with whole type imports; aliases and inline type imports can escape it. Constructor matching is package hygiene and does not prove runtime behavior.

The published scanner waits 60 seconds before its first invocation, then permits up to 10 additional attempts separated by 30 seconds, and only retries recognized propagation failures. Maximum delay is 360 seconds excluding scanner runtime. Success requires exit status zero, no spawn error, and the exact success marker.

Manual dispatch runs CI after the updated workflow is merged to the default branch; it does not make publication manually dispatchable. The tag guard cannot prove human review, green CI, or historical tag immutability. Never move, delete, or replay release tags.

## Validation record

- `npm ci --cache /tmp/geoapify-release-npm-cache --prefer-offline`: passed before implementation; 744 packages installed, with the baseline 24 audit advisories (7 moderate, 17 high); no dependency or lockfile change.
- `npm run format:check`: passed.
- `npm run lint`: passed (n8n CLI v0.46.4; cloud-compatibility checks emitted only environment warnings).
- `npm run typecheck`: passed for package and test TypeScript.
- `npm test`: passed, 12 test files / 152 tests.
- `npm run review:source`: passed; reviewed 2 TypeScript node source files.
- `npm run build`: passed.
- `npm run scan:source`: official source and built-package scanner preflights passed.
- `npm run package:check`: passed release audit and package boundary (15 files, 39,173 packed bytes).
- `npm run smoke:load`: loaded 1 compiled node and 1 wired credential type.
- `npm run smoke:install`: root/orchestrator passed; isolated consumer loaded 1 node and 1 wired credential.
- Supplemental Node 22.23.2 Vitest run passed, 152 tests / 12 files. The exact Node 22.22.0 lane remains a GitHub CI check.
- Independent Luna audit found no blocking findings.
- `git diff --check`: passed; tracked and untracked files were reviewed against the explicit allowlist.
- GitHub Actions Node 22/24 and repository workflow results are external and must be recorded separately when available.

## Operational recovery and limitations

If repository history is restored or migrated, inspect source, workflow history, tags, Actions permissions/secrets, branch policies, npm Trusted Publisher configuration, and registry state independently. This repository cannot restore those external states. Restore CI first and verify it before considering an immutable release workflow; never manually replay publication. If an npm package/version may have been removed, verify the live registry and current official npm unpublish policy before deciding what remains possible. Package-name reuse and version immutability rules may prevent recovery. Any exceptional credential bootstrap or publication requires explicit authorization and a new immutable version.

No release tag was created, no registry publication occurred, and npm trust configuration, credentials, secrets, or services were not changed. Branch push and draft-PR creation are separately authorized and handled by the root orchestrator. Scanner and audit checks establish repository/package behavior only; they cannot establish external account state or guarantee that propagation will complete within the bounded wait.

## Final review

- `git diff --name-only` for tracked files plus `git status --short` for new files: all changes are within the assignment allowlist.
- Root completed final diff review, packed-install smoke, and supplemental Node 22.23.2 Vitest verification. Exact Node 22.22.0 CI remains outstanding.

No disposable n8n UI session, live Geoapify/API request, or published-package scanner invocation was performed as part of this migration.
