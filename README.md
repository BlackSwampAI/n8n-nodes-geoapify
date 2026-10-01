# Black Swamp n8n community-node template

A fail-closed TypeScript starter for production-quality n8n community integrations. It uses a declarative GitHub Issues implementation as the canonical REST example and adds strict Vitest tests, release audits, and provenance-ready GitHub Actions.

> [!WARNING]
> This repository is a template, not a publishable integration. `private: true` intentionally blocks publication. The examples, identity, and this README must be removed or adapted after generating a project.

## Start from the template

1. Select **Use this template → Create a new repository** on GitHub.
2. Create the final public repository, then clone it.
3. Work in bounded, reviewed batches; do not create a version tag during initialization.

```sh
git clone https://github.com/YOUR-OWNER/YOUR-REPOSITORY.git
cd YOUR-REPOSITORY
npm ci
```

## Deterministic initialization checklist

- Choose the final GitHub repository and scoped or unscoped `n8n-nodes-*` npm name.
- Replace package name, description, author, homepage, repository, keywords, and node metadata URLs/categories. Black Swamp AI packages use `https://blackswampai.com/n8n-nodes/<slug>/` as their npm homepage.
- Choose and document exactly one distribution state: verified-node discovery, manual self-hosted **Settings → Community Nodes**, or private/unavailable. Verification status must come from the actual n8n distribution state, not package metadata.
- Replace this file with `README_TEMPLATE.md`, rename it to `README.md`, and resolve every placeholder.
- Replace or adapt the GitHub Issues node, credentials, icons, and registrations.
- Start ordinary REST API nodes with declarative routing. Evaluate routing, expressions, pagination, `preSend`, and `postReceive` before choosing programmatic execution, and document any exception in the API matrix.
- Replace or remove raw-template invariant tests, especially `tests/template.test.ts`, when removing `private: true` and the example registrations; add product-specific invariants in their place.
- Copy and complete `docs/API_MATRIX_TEMPLATE.md` as `docs/api-matrix.md`, `docs/TESTING_TEMPLATE.md` as `docs/testing.md`, and `docs/BRANDING_TEMPLATE.md` as `docs/branding.md`. Remove the uppercase template copies after migration; unresolved placeholders or missing final documents fail the generated repository's release audit.
- Register every intended compiled node and credential using stable `dist/` paths.
- Keep `private: true` until identity, documentation, tests, and registration are final; then remove it.
- Run `npm install` once after identity/tooling changes and commit the regenerated lockfile.
- Start follow-up/migration branches from the current post-squash `main`. Do not replay an already-squashed feature branch.
- Inspect inherited `.npmrc` files. `engine-strict=true` must not reject either the Node 22.22.0 or Node 24 CI lane.
- Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run package:check`.
- Install or load the dry-run package in a disposable n8n instance before release.
- Never tag early. Only an explicitly authorized, reviewed release commit receives an immutable version tag.

## Declarative-first implementation policy

`nodes/GithubIssues/` and `credentials/` are the sole canonical example. They demonstrate a declarative REST API node, list search, pagination, PAT, and OAuth credentials.

Use declarative routing by default for ordinary REST APIs. First evaluate routing, expressions, pagination, `preSend`, and `postReceive`; these cover many unusual request bodies, response wrappers, and pagination schemes without a custom `execute` method.

Choose programmatic style only when a specific requirement calls for it, such as a trigger, GraphQL or another non-REST protocol, an external runtime dependency, incoming-data transformation, full node versioning, or behavior declarative routing cannot safely express. Record that requirement and the rejected declarative options in the API matrix. Generic "weird JSON" is not sufficient evidence.

The GitHub Issues files are learning fixtures. Shipping their names, registrations, or credentials in an unrelated integration is a release-audit failure.

## Development commands

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Run the local n8n node development environment      |
| `npm run format:check`  | Check formatting                                    |
| `npm run lint`          | Run n8n community-node lint rules                   |
| `npm run typecheck`     | Strictly check production and test TypeScript       |
| `npm test`              | Run all `*.test.ts` files with Vitest               |
| `npm run build`         | Compile nodes and copy static assets                |
| `npm run scan:source`   | Apply the pinned official scanner to source/build   |
| `npm run release:check` | Validate template mode or final release identity    |
| `npm run package:check` | Audit and inspect the dry-run npm tarball boundary  |
| `npm run smoke:load`    | Load every compiled package registration            |
| `npm run smoke:install` | Install and load the tarball in an isolated project |

The tag workflow separates one-time npm publication from a dependent registry/provenance verifier. If npm publication succeeds and only verification fails, rerun only failed jobs; never rerun the successful publish job for that immutable version.

Read `RELEASING.md` before changing `private`, creating a tag, or configuring npm publishing.
Use `docs/BATCH_HANDOFF_TEMPLATE.md` to keep implementation work bounded and evidence-driven. Generated repositories do not inherit later template improvements; follow `docs/TEMPLATE_MIGRATIONS.md` and retain `.blackswamp/template.json` to track explicitly adopted migrations.

Reusable project templates:

- `docs/API_MATRIX_TEMPLATE.md`
- `docs/TESTING_TEMPLATE.md`
- `docs/BRANDING_TEMPLATE.md`

## Upstream resources

- [n8n node development](https://docs.n8n.io/integrations/creating-nodes/)
- [Choose a node-building style](https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-a-node-building-style)
- [Community-node verification](https://docs.n8n.io/integrations/creating-nodes/build/reference/verification-guidelines/)
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)

## License

[MIT](LICENSE.md)
