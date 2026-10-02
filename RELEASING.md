# Releasing an n8n community node

For the current package-specific gates, owner actions, and deferred live smoke, see [release readiness for 0.1.0](docs/release-readiness-0.1.0.md).

Releases are user-authorized and publish only from `.github/workflows/publish.yml`. Never run `npm publish` locally for an n8n release.

## Finalize the generated repository

Finalize the generated repository's README with the exact package identity, truthful distribution status, credentials, implemented operations, output behavior, compatibility evidence, resources, changelog, and license. Do not retain template placeholders or installation steps for an unavailable package. `npm run release:check` enters template mode only when the normalized git origin is exactly this template repository. Every generated repository uses normal mode and must have final identity, no placeholders/examples, and no `private: true`.

Package preparation and npm publication are separate. A generated package may be configured for future public distribution while still unpublished and unavailable: state that honestly in its README, omit npm installation instructions and verified-node claims until those states are real, and do not infer public availability from package metadata. Removing `private: true` completes package preparation only. It does not authorize publication, tagging, or changes to GitHub repository visibility. Publication requires explicit user authorization and the procedure below.

## Prepublication gate

Run on the exact release commit:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run review:source
npm run build
npm run scan:source
npm run package:check
npm run smoke:load
npm run smoke:install
git diff --check
```

Inspect the dry-run tarball and install it in a disposable n8n instance. Verify node/credential loading, representative operations, error handling, and triggers where present. For editor-based packages, inspect actual field visibility, required controls, credential masking, operation switching, and expression entry in the disposable editor; compiled registration or metadata inspection is not UI evidence. CI must pass on Node 22.22.0 and Node 24. The pinned official scanner preflight checks both its source patterns and built JavaScript; inline ESLint disables do not replace compliance. Keep live-service evidence distinct from mocked execution and record when no live account/key was available.

The tag-only publish job fetches full branch and tag history and runs `scripts/verify-release-tag.mjs` immediately after checkout, before runtime setup, dependency installation, authentication, or publication. The guard requires `GITHUB_REF` to exactly match `refs/tags/v<package.json version>`, the tag to exist as annotated, to resolve to checked-out `HEAD`, and to point to a commit in fetched `origin/main` history. This Git-history check cannot prove human review, green CI, or that an older tag was never moved or deleted; require human review and CI on the exact release commit and never move, delete, or replay a release tag. CI also supports manual dispatch after the updated workflow reaches the default branch; publication remains tag-only.

`npm run review:source` uses the existing TypeScript compiler AST to detect the narrow shape of operation-property files that export only an empty typed `INodeProperties[]` array plus import/type scaffolding. It does not detect every possible alias or inline type import and is not a general source-quality or completeness review. Review assembled node properties and visibility before removing a placeholder. The compiled load smoke requires one case-exact filename-matching constructible export per registered node or credential module, rejects other constructors, and permits nonconstructible helpers; this is package hygiene, not proof of runtime correctness.

Every API credential should provide a harmless authenticated test request where the service supports one. Add a product-specific release invariant so the credential cannot remain registered but disconnected from every node.

## First publication only

npm requires a package to exist before Trusted Publisher configuration. For a genuinely new package, create a narrowly scoped, temporary granular token with publish access only to that package and store it only as the `NPM_TOKEN` Actions secret. After explicit user approval, tag the reviewed commit with an annotated immutable `v0.1.0` tag and let GitHub Actions publish with provenance.

Immediately after success, configure npm Trusted Publishing for the exact GitHub owner, repository, `publish.yml`, and no environment unless the workflow declares one. Delete the GitHub secret and revoke the token. Existing packages skip token bootstrap and use OIDC from the first release.

The workflow removes setup-node's literal empty `_authToken=${NODE_AUTH_TOKEN}` line before tokenless publishing. Do not remove this preparation: an empty auth placeholder can suppress OIDC.

## Verify and preserve history

Verify the workflow, npm version and `latest` tag, SLSA provenance attestation, package contents/load smoke, and matching GitHub release. The post-publication scanner accepts success only when the process exits with status zero and prints the exact `Package <name>@<version> has passed all security checks` output. It waits 60 seconds before its first attempt and makes at most 10 further attempts, with 30 seconds between attempts, only for recognized registry/provenance propagation failures. This caps waiting at 360 seconds plus scanner runtime. Deterministic findings, 403, rate limits, timeouts, and unrelated failures stop immediately. If publication succeeded but only verification failed, diagnose it and use GitHub Actions **Re-run failed jobs**; never rerun the successful publish job for an immutable npm version. Never reuse an npm version or move/delete a published tag. User-visible npm README or metadata corrections require a new version; workflow-only corrections do not.

Submit only that exact published version to Creator Portal, then visually inspect and record its card version and logo. A valid npm tarball can still appear stale or generic in the portal.

After both publication and published-package verification succeed, the dependent notification job posts the package/version, confirms both successful stages, and includes the GitHub tag/source link as its single URL when the optional `DISCORD_WEBHOOK` repository secret exists. Repository and tag are also shown as plain text. A missing secret skips cleanly. Notification failures are sanitized and isolated from the immutable release; the job has read-only repository permissions and makes one bounded request without retries or mentions.

Before adopting this baseline in an older repository, inspect `.npmrc` and `engines.node`. Do not keep `engine-strict=true` when the declared engine excludes a required Node 22.22.0 or Node 24 CI lane. Create the migration branch from the current post-squash `main`; rebasing an old pre-squash feature branch can replay already-merged work.

For recovery after repository or registry disruption, perform a read-only audit first: compare source, workflow history, tags, Actions permissions/secrets, branch protections, npm Trusted Publisher configuration, and registry package/version state. These files cannot restore external GitHub or npm state. Restore CI and verify it before considering a release; never replay publication manually. Check current official npm unpublish policy and registry state before planning package recovery, because name/version reuse may be blocked. Any exceptional token use or publication needs explicit authorization and a new immutable version.
