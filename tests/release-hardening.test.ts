// Release-tool tests intentionally use Node built-ins and disposable local files.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { tmpdir } from 'node:os';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareNpmAuth } from '../scripts/prepare-npm-auth.mjs';
import {
	isDeterministicSecurityFailure,
	isLikelyPropagationFailure,
} from '../scripts/scan-policy.mjs';
import { assertRegisteredCredentialsAreWired } from '../scripts/node-load-smoke.mjs';

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
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
