# Testing template

## Unit and contract tests

- Use strict TypeScript `*.test.ts` files under Vitest.
- Assert resource/operation visibility and every required control's display conditions.
- Test manual strings, expression values, and list-mode resource-locator objects.
- Execute blank/default state for list/history operations and invalid required state; prove validation occurs before transport.
- Mock observed API wrappers and identifier variants, not idealized shapes only.
- Cover destructive confirmations, redaction, and full-update preservation.

### Declarative routing contracts

- Assert `requestDefaults` and operation routing produce the expected method, URL, headers, query, and body for each visible parameter combination.
- Exercise expressions, pagination boundaries, `preSend`, and `postReceive`, including observed wrappers, empty pages, limits, and response normalization.
- Prove one request/output sequence per input item and verify automatic item lineage remains intact.

### Programmatic execution responsibilities

- For every documented programmatic exception, test the behavior that declarative routing cannot safely express.
- Prove execution does not mutate input items, preserves paired-item lineage, and handles multiple input items deterministically.
- Cover request-helper usage, pagination boundaries, `continueOnFail`, and conversion of transport or implementation failures into useful n8n errors without exposing credentials.

## Disposable service tests

- Pin the service version or image digest and document how it is refreshed.
- Fail closed unless the base URL and organization/account identify the disposable target.
- Use run-scoped, exact-owned names. Clean exact identifiers in dependency order and assert absence; never sweep prefixes or delete persistent volumes.
- Separate generated-contract claims from observed service behavior and keep suites independently runnable.

## Actual n8n and package smoke

- Build, run the official source/built scanner, inspect the dry-run tarball, load every compiled registration, and install that tarball in an isolated consumer.
- In disposable n8n, inspect credentials, node discovery, representative operation fields, dynamic selectors, hidden-field request behavior, execution, and trigger activation where present.
- Distinguish browser/network evidence from metadata inference. Bound unsupported UI automation attempts and report limitations.
- Never use production credentials or mutate hosted data without explicit authorization.
- Submit only the exact published package version, then visually record the Creator Portal card version and logo. This manual check is independent of tarball validation and catches stale portal state.

## Publication verification

- Keep `npm run release` in a single immutable `publish` job with OIDC permission.
- Run `npm run scan:published` only in a fresh, read-only `verify-published` job that depends on `publish` and performs its own checkout, Node setup, and `npm ci`.
- If only the verifier fails after npm publication, inspect npm first and rerun only failed jobs. Never rerun a successful publish job for an existing version.
- Treat only the exact documented metadata, analysis-404, and provenance source-repository 404 propagation messages as retryable. A generic HTTP status match is too broad.
