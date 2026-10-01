# Builder handoff: Template 2.2.0 adoption

Adopted from upstream template commit `737e421` (the repository's prior tracked baseline was `2.1.1`).

## Scope

- Add the optional Discord notification after npm publication and published-package verification.
- Route `npm run dev` through a launcher that reserves port 5690, preserves the environment, and forwards arguments.
- Preserve Geoapify node APIs, package identity, dependency versions, and the declarative REST implementation.

## Implementation evidence

- The node remains declarative. Template 2.2.0 changes affect development tooling and release operations only; no Geoapify API behavior or node registration changed.
- `tests/dev.test.ts` covers the fixed port, inherited environment preservation, and forwarded custom-user-folder arguments.
- `tests/notify-discord.test.ts` covers release links, disabled mentions, missing-secret skipping, `wait=true` with preserved thread IDs, one bounded POST, and sanitized failures.
- The release audit checks that notification depends on both release jobs, has read-only permissions, uses the optional secret, and receives no npm or OIDC publishing credentials.

## Developer smoke procedure

Use `npm run dev -- --custom-user-folder /tmp/n8n-node-run` and open `http://localhost:5690` manually. If the port is occupied, record the conflict and explicitly use an alternate port such as `N8N_PORT=5692 npm exec -- n8n-node dev --custom-user-folder /tmp/n8n-node-run`. Record actual smoke results separately in this section after performing the smoke; documentation and launcher unit tests do not establish runtime/editor behavior.

## Validation record

On Node 24.18.0 with pinned npm 11.19.0, a fresh offline frozen install passed (744 packages; lockfile unchanged). `format:check`, `lint`, `typecheck`, all 115 Vitest tests across 9 files, `build`, `scan:source` (official source and built-package preflights), `release:check`, `package:check` (15 files; 39,164 packed bytes, 181,374 unpacked bytes), `smoke:load` (one compiled node and one wired credential), `smoke:install` (packed package installed and loaded successfully in an isolated consumer), and `git diff --check` passed. Vitest emitted missing-source-map warnings from `n8n-workflow` but exited successfully. The first sandboxed `smoke:install` attempt returned `EPERM` when its nested npm process spawned; the permitted outside-sandbox rerun passed and cleaned up its disposable consumer.

The orchestrator separately verified `npm run dev -- --help` forwards help to the pinned CLI and exits successfully, and verified that running the notification entrypoint with `DISCORD_WEBHOOK` unset exits successfully with a skip message. No n8n server/editor was started, no Discord request/message was sent, and these checks establish neither live editor discovery nor webhook delivery. No fresh Node 22 or GitHub Actions result is claimed. The node remains declarative, and this migration changes no Geoapify node/API behavior.

## Follow-up: Discord notification wording

- Scope: update only the Discord message to confirm npm publication and published-package verification succeeded, show repository/tag as plain text, and provide one encoded GitHub tag/source URL. npm and workflow-run URLs are removed. The unversioned marker remains `2.2.0`; the separate published-scanner settling/retry change is not adopted in this PR.
- Evidence: upstream template commit `4600a65`'s exact notification script and tests were adopted. Tests cover the message, exactly one encoded source URL, optional-secret skipping, no mentions, bounded single POST, and sanitized failures without retries.
- Validation: on Node 24.18.0 with pinned npm 11.19.0, `format:check`, `lint`, `typecheck`, all 116 Vitest tests, `build`, `scan:source`, `release:check`, `package:check`, `smoke:load`, `smoke:install`, and `git diff --check` passed. The sandboxed `smoke:install` attempt returned `EPERM` while spawning its nested npm process; the permitted outside-sandbox rerun installed and loaded one node and one credential in an isolated consumer, then cleaned it up. Running the notifier with `DISCORD_WEBHOOK` unset exited successfully and skipped without making a request. No live Discord message is sent. No changes were made to the running n8n instance or port 5678.
