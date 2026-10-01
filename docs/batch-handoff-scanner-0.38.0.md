# Scanner 0.38.0 template migration handoff

## Scope

- Goal: Update the reusable community-node template to the official scanner 0.38.0 baseline.
- Allowed changes: Scanner pins and assertions, lockfile scanner subtree, template migration guidance,
  testing evidence, this handoff, and the reviewed template baseline marker.
- Non-goals: Example runtime behavior, public APIs, workflows, package identity/version, runtime
  dependencies, publishing, tagging, pushing, pull requests, or merging.
- Implementation style: The canonical GitHub Issues example remains declarative.
- Style evidence: Its existing REST operations continue to use declarative routing, expressions,
  pagination, `preSend`, and `postReceive`; no runtime implementation files change.

## Evidence and tests

- The package, published scanner wrapper, release invariant, and tests pin scanner 0.38.0.
- The scanner's internal TypeScript 6 compiler remains nested under the scanner dependency, preserving
  the project's TypeScript 5.9 `tsc` executable after `npm ci`.
- The canonical example codex category must pass scanner 0.38.0 without an unreviewed category change.
- Required validation: frozen install, format, lint, strict typecheck, Vitest, build, source and built
  scanner checks, package boundary, compiled load, isolated packed install, release audit, diff check,
  and allowlist review.

## Handoff

- Contract/runtime discrepancies: None expected; this migration changes release tooling only.
- Package and scanner evidence: A fresh `npm ci` preserved project TypeScript 5.9.3 and scanner
  TypeScript 6.0.3 in their separate dependency trees. Formatting, lint, strict typecheck, all 22
  Vitest tests, build, scanner 0.38.0 source and built-package checks, package boundary, compiled load,
  and isolated packed install/load passed. The private template tarball contained 51 files, 14,660
  packed bytes, and 61,098 unpacked bytes; its one compiled node and two wired credential types loaded.
- Cleanup: No external services or fixtures are created by this batch.
- Limitations: No browser, hosted-runtime, published-package, provenance, or Creator Portal evidence is
  claimed. The generic release audit was run and correctly rejected the raw template as private and
  uninitialized: it requires generated-repository `docs/api-matrix.md`, `docs/testing.md`, and
  `docs/branding.md` and requires removal of their uppercase template sources. The template-specific
  fail-closed release audit passed; converting the raw starter into a generated repository is outside
  this migration.
- Remaining decisions: Orchestrator diff review and user-controlled commit, push, pull request, and
  merge actions.
