---
name: Release 0.1.0
about: Track the first provenance-backed npm release
title: 'Release v0.1.0'
labels: release
assignees: ''
---

- [ ] Final public repository and npm package names selected
- [ ] All template placeholders and unused examples removed
- [ ] README uses the correct verified-discovery, manual Community Nodes, or private/unavailable installation mode
- [ ] README compatibility, credentials, operations, troubleshooting, resources, independence notice, and license sections complete
- [ ] `npm ci`, format check, lint, strict production/test typecheck, Vitest, build, official source/built scanner preflight, release audit, and dry-run package checks pass
- [ ] Every compiled registration loads and the packed artifact installs in an isolated disposable project
- [ ] API credentials have harmless test metadata where supported and every intended node references its credential
- [ ] Temporary granular npm token stored only as GitHub Actions secret `NPM_TOKEN`
- [ ] Release commit is on `main` and CI is green
- [ ] User explicitly authorizes release and annotated immutable `v0.1.0` tag points to the reviewed release commit
- [ ] Publish job succeeds exactly once
- [ ] npm `latest` is `0.1.0` and SLSA provenance is present
- [ ] Official post-publication scanner prints the exact package/version success result (do not trust exit code alone)
- [ ] Separate `verify-published` job succeeds; a verifier retry cannot invoke npm publication
- [ ] GitHub release exists
- [ ] npm Trusted Publisher configured for `publish.yml`
- [ ] `NPM_TOKEN` secret deleted and temporary npm token revoked
