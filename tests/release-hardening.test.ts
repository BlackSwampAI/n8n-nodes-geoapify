// Release-tool tests intentionally use Node built-ins and disposable local files.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { execFileSync } from 'node:child_process';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { tmpdir } from 'node:os';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { join } from 'node:path';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { cwd, execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareNpmAuth } from '../scripts/prepare-npm-auth.mjs';
import {
	isDeterministicSecurityFailure,
	isLikelyPropagationFailure,
} from '../scripts/scan-policy.mjs';
import { assertRegisteredCredentialsAreWired } from '../scripts/node-load-smoke.mjs';

describe('optional Discord release notification', () => {
	const workflow = readFileSync(
		new URL('../.github/workflows/publish.yml', import.meta.url),
		'utf8',
	);

	it('runs only after publication and verification with read-only permissions', () => {
		const job = workflow.split(/\n {2}notify-discord:\s*\n/)[1] ?? '';
		expect(job).toContain('needs: [publish, verify-published]');
		expect(job).toContain('contents: read');
		expect(job).toContain('secrets.DISCORD_WEBHOOK');
		expect(job).toContain('continue-on-error: true');
		expect(job).not.toMatch(/id-token:\s*write|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/);
	});
});

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function releaseAuditFixture() {
	const directory = mkdtempSync(join(tmpdir(), 'geoapify-release-audit-'));
	temporaryDirectories.push(directory);
	const repository = cwd();
	cpSync(repository, directory, {
		recursive: true,
		filter: (source) =>
			!source
				.slice(repository.length)
				.replace(/^\//, '')
				.split('/')
				.some((part) => ['.git', 'node_modules', 'dist', '.npm-cache'].includes(part)),
	});
	const worktreeGitDirectory = join(directory, '.git-worktrees', 'release-audit');
	const commonGitDirectory = join(directory, '.git-common');
	mkdirSync(worktreeGitDirectory, { recursive: true });
	mkdirSync(commonGitDirectory, { recursive: true });
	writeFileSync(join(directory, '.git'), 'gitdir: .git-worktrees/release-audit\n');
	writeFileSync(join(worktreeGitDirectory, 'commondir'), '../../.git-common\n');
	writeFileSync(
		join(commonGitDirectory, 'config'),
		'[remote "origin"]\n\turl = https://github.com/BlackSwampAI/n8n-nodes-geoapify.git\n',
	);
	return directory;
}

function runReleaseAudit(directory: string) {
	try {
		// eslint-disable-next-line @n8n/community-nodes/no-dangerous-functions -- fixed executable and disposable fixture
		return execFileSync(execPath, ['scripts/release-check.mjs'], {
			cwd: directory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	} catch (error) {
		const output = error as { message?: string; stderr?: string };
		// eslint-disable-next-line @n8n/community-nodes/require-node-api-error -- test helper reports subprocess diagnostics
		throw new Error(output.stderr || output.message || String(error));
	}
}

describe('release audit worktree and source-review safeguards', () => {
	it('reads the origin from a linked worktree common directory and passes the package audit', () => {
		const directory = releaseAuditFixture();
		expect(runReleaseAudit(directory)).toContain(
			'Release audit passed for @blackswampai/n8n-nodes-geoapify@0.1.0',
		);
	});

	it('requires source review in CI and publication before build', () => {
		const directory = releaseAuditFixture();
		const workflowPath = join(directory, '.github/workflows/ci.yml');
		const workflow = readFileSync(workflowPath, 'utf8');
		writeFileSync(
			workflowPath,
			workflow
				.replace('      - run: npm run review:source\n', '')
				.replace(
					'      - run: npm run build\n',
					'      - run: npm run build\n      - run: npm run review:source\n',
				),
		);
		expect(() => runReleaseAudit(directory)).toThrow(
			'CI and publish must review source before build',
		);
	});

	it('requires full history and an immediate immutable release-tag guard', () => {
		const directory = releaseAuditFixture();
		const workflowPath = join(directory, '.github/workflows/publish.yml');
		const workflow = readFileSync(workflowPath, 'utf8').replace('fetch-depth: 0', 'fetch-depth: 1');
		writeFileSync(workflowPath, workflow);
		expect(() => runReleaseAudit(directory)).toThrow(
			'publish must fetch full history and verify the release tag immediately after checkout',
		);
	});

	it('rejects a release-tag guard that is not the next step after checkout', () => {
		const directory = releaseAuditFixture();
		const workflowPath = join(directory, '.github/workflows/publish.yml');
		const workflow = readFileSync(workflowPath, 'utf8').replace(
			'      - name: Verify immutable release tag\n',
			'      - run: echo intervening step\n      - name: Verify immutable release tag\n',
		);
		writeFileSync(workflowPath, workflow);
		expect(() => runReleaseAudit(directory)).toThrow(
			'publish must fetch full history and verify the release tag immediately after checkout',
		);
	});

	it('requires manual dispatch for CI without making publication manually dispatchable', () => {
		const directory = releaseAuditFixture();
		const ciPath = join(directory, '.github/workflows/ci.yml');
		writeFileSync(ciPath, readFileSync(ciPath, 'utf8').replace('  workflow_dispatch:\n', ''));
		expect(() => runReleaseAudit(directory)).toThrow('CI must support manual dispatch');
	});

	it('requires the tag guard script and source-review package command', () => {
		const missingGuard = releaseAuditFixture();
		rmSync(join(missingGuard, 'scripts/verify-release-tag.mjs'));
		expect(() => runReleaseAudit(missingGuard)).toThrow(
			'scripts/verify-release-tag.mjs is required',
		);

		const missingReviewCommand = releaseAuditFixture();
		const packagePath = join(missingReviewCommand, 'package.json');
		const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
			scripts: Record<string, string>;
		};
		delete packageJson.scripts['review:source'];
		writeFileSync(packagePath, `${JSON.stringify(packageJson, null, '\t')}\n`);
		expect(() => runReleaseAudit(missingReviewCommand)).toThrow(
			'package.json script review:source is required',
		);
	});

	it('requires the publish source-review gate before build', () => {
		const directory = releaseAuditFixture();
		const workflowPath = join(directory, '.github/workflows/publish.yml');
		const workflow = readFileSync(workflowPath, 'utf8').replace(
			'      - run: npm run review:source\n',
			'',
		);
		writeFileSync(workflowPath, workflow);
		expect(() => runReleaseAudit(directory)).toThrow(
			'CI and publish must review source before build',
		);
	});
});

describe('npm authentication preparation', () => {
	it('preserves token bootstrap configuration', () => {
		const directory = mkdtempSync(join(tmpdir(), 'template-auth-test-'));
		temporaryDirectories.push(directory);
		const config = join(directory, '.npmrc');
		const contents = '//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nprovenance=true\n';
		writeFileSync(config, contents);
		expect(prepareNpmAuth({ NODE_AUTH_TOKEN: 'present', NPM_CONFIG_USERCONFIG: config })).toBe(
			'token',
		);
		expect(readFileSync(config, 'utf8')).toBe(contents);
	});

	it('removes only the empty setup-node placeholder for OIDC', () => {
		const directory = mkdtempSync(join(tmpdir(), 'template-auth-test-'));
		temporaryDirectories.push(directory);
		const config = join(directory, '.npmrc');
		writeFileSync(
			config,
			'registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nprovenance=true\n',
		);
		expect(prepareNpmAuth({ NODE_AUTH_TOKEN: '', NPM_CONFIG_USERCONFIG: config })).toBe('oidc');
		expect(readFileSync(config, 'utf8')).toBe(
			'registry=https://registry.npmjs.org/\nprovenance=true\n',
		);
	});
});

describe('published scanner retry policy', () => {
	const packageSpec = '@example/n8n-nodes-service@1.2.3';

	it('retries only observed propagation failures for the expected version', () => {
		const analysis404 = `Package ${packageSpec} has failed security checks\nReason: Analysis failed: Request failed with status code 404`;
		const missingVersion = `Package ${packageSpec} has failed security checks\nReason: No package metadata found for version 1.2.3`;
		const provenanceSource404 = `Package ${packageSpec} has failed security checks\nReason: Could not fetch the source repository recorded in the package's npm provenance (Request failed with status code 404).`;
		expect(isLikelyPropagationFailure(analysis404, packageSpec)).toBe(true);
		expect(isLikelyPropagationFailure(missingVersion, packageSpec)).toBe(true);
		expect(isLikelyPropagationFailure(provenanceSource404, packageSpec)).toBe(true);
		expect(
			isLikelyPropagationFailure(
				`Package ${packageSpec} has failed security checks\nReason: No package metadata found for version 1.2.2`,
				packageSpec,
			),
		).toBe(false);
	});

	it('fails deterministic scanner findings immediately', () => {
		const output = `Package ${packageSpec} has failed security checks\nReason: ESLint violations found\nfile.ts:1:1 error`;
		expect(isLikelyPropagationFailure(output, packageSpec)).toBe(false);
		expect(isDeterministicSecurityFailure(output, packageSpec)).toBe(true);
	});

	it('does not retry unrelated network, metadata, or security output', () => {
		for (const reason of [
			'Reason: Analysis failed: Request timed out',
			'Reason: Analysis failed: Request failed with status code 403',
			'Reason: Analysis failed: Request failed with status code 429',
			'Reason: Could not fetch source repository (Request failed with status code 404)',
			'Reason: Package metadata is invalid for version 1.2.3',
			'Reason: No package metadata found for version 1.2.2',
		]) {
			const output = `Package ${packageSpec} has failed security checks\n${reason}`;
			expect(isLikelyPropagationFailure(output, packageSpec)).toBe(false);
			expect(isDeterministicSecurityFailure(output, packageSpec)).toBe(true);
		}
	});
});

describe('compiled credential wiring invariant', () => {
	it('rejects a registered package credential that no loaded node references', () => {
		const nodes = [{ description: { credentials: [{ name: 'usedCredential' }] } }];
		const credentials = [{ name: 'usedCredential' }, { name: 'orphanedCredential' }];
		expect(() => assertRegisteredCredentialsAreWired(nodes, credentials)).toThrow(
			'Registered credential types are not referenced by a node: orphanedCredential',
		);
	});

	it('allows built-in node credential references while requiring package credentials', () => {
		const nodes = [
			{ description: { credentials: [{ name: 'packageCredential' }, { name: 'httpBasicAuth' }] } },
		];
		expect(() =>
			assertRegisteredCredentialsAreWired(nodes, [{ name: 'packageCredential' }]),
		).not.toThrow();
	});
});
