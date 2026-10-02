// Release-tool tests intentionally use Node built-ins and disposable Git repositories.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { execFileSync } from 'node:child_process';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyReleaseTag } from '../scripts/verify-release-tag.mjs';

const repositories: string[] = [];
const git = (repository: string, ...args: string[]) =>
	// eslint-disable-next-line @n8n/community-nodes/no-dangerous-functions -- fixed executable and test-owned arguments
	execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();

function createRepository() {
	const repository = mkdtempSync('/tmp/template-release-tag-');
	repositories.push(repository);
	git(repository, 'init', '-b', 'main');
	git(repository, 'config', 'user.name', 'Release Test');
	git(repository, 'config', 'user.email', 'release@example.test');
	writeFileSync(`${repository}/package.json`, '{"version":"0.1.0"}\n');
	writeFileSync(`${repository}/content.txt`, 'reviewed\n');
	git(repository, 'add', '.');
	git(repository, 'commit', '-m', 'reviewed release');
	git(repository, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
	git(repository, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');
	return repository;
}

afterEach(() => {
	for (const repository of repositories.splice(0)) rmSync(repository, { recursive: true });
});

describe('verifyReleaseTag', () => {
	it('accepts an annotated tag on reviewed main', () => {
		const repository = createRepository();
		expect(verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } })).toEqual({
			expectedRef: 'refs/tags/v0.1.0',
			taggedCommit: git(repository, 'rev-parse', 'HEAD'),
		});
	});

	it('accepts an older tagged commit in reviewed main history', () => {
		const repository = createRepository();
		writeFileSync(`${repository}/content.txt`, 'newer reviewed commit\n');
		git(repository, 'add', '.');
		git(repository, 'commit', '-m', 'advance main');
		git(repository, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
		git(repository, 'checkout', '--detach', 'v0.1.0^{}');
		expect(() =>
			verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } }),
		).not.toThrow();
	});

	it('rejects a tag on an unreviewed commit', () => {
		const repository = createRepository();
		git(repository, 'tag', '-d', 'v0.1.0');
		git(repository, 'checkout', '-b', 'release-candidate');
		writeFileSync(`${repository}/content.txt`, 'unreviewed\n');
		git(repository, 'add', '.');
		git(repository, 'commit', '-m', 'unreviewed release');
		git(repository, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');
		expect(() => verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } })).toThrow(
			'tagged commit is not an ancestor',
		);
	});

	it('rejects a ref that does not exactly match the package version', () => {
		const repository = createRepository();
		expect(() => verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.1' } })).toThrow(
			'GITHUB_REF must exactly match refs/tags/v0.1.0',
		);
	});

	it('rejects a missing tag ref', () => {
		const repository = createRepository();
		git(repository, 'tag', '-d', 'v0.1.0');
		expect(() => verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } })).toThrow(
			'release tag ref is missing',
		);
	});

	it('rejects when HEAD differs from the tag target', () => {
		const repository = createRepository();
		writeFileSync(`${repository}/content.txt`, 'different head\n');
		git(repository, 'add', '.');
		git(repository, 'commit', '-m', 'different head');
		expect(() => verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } })).toThrow(
			'release tag does not resolve to the checked-out HEAD',
		);
	});

	it('rejects when reviewed main is missing', () => {
		const repository = createRepository();
		git(repository, 'update-ref', '-d', 'refs/remotes/origin/main');
		expect(() => verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } })).toThrow(
			'reviewed main ref is missing',
		);
	});

	it('rejects lightweight release tags', () => {
		const repository = createRepository();
		git(repository, 'tag', '-d', 'v0.1.0');
		git(repository, 'tag', 'v0.1.0');
		expect(() => verifyReleaseTag({ repository, env: { GITHUB_REF: 'refs/tags/v0.1.0' } })).toThrow(
			'release tag must be annotated',
		);
	});
});
