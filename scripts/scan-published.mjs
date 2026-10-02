import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareNpmAuth } from './prepare-npm-auth.mjs';
import { isDeterministicSecurityFailure, isLikelyPropagationFailure } from './scan-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const INITIAL_SETTLING_DELAY_MS = 60_000;
const RETRY_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 11;

export async function runPublishedScan({
	packageSpec,
	scan,
	delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
	writeOutput = (output) => process.stdout.write(output),
	logError = (message) => console.error(message),
	initialSettlingDelayMs = INITIAL_SETTLING_DELAY_MS,
	retryDelayMs = RETRY_DELAY_MS,
	maxAttempts = MAX_ATTEMPTS,
}) {
	logError(
		`Published scan is allowing registry metadata to settle for ${initialSettlingDelayMs / 1_000} seconds before the first attempt.`,
	);
	await delay(initialSettlingDelayMs);
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const result = await scan(packageSpec);
		const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
		writeOutput(output);
		if (
			result.status === 0 &&
			!result.error &&
			output.includes(`Package ${packageSpec} has passed all security checks`)
		)
			return 0;
		if (isDeterministicSecurityFailure(output, packageSpec)) {
			logError(`Official scanner reported a deterministic security failure for ${packageSpec}.`);
			return 1;
		}
		if (!isLikelyPropagationFailure(output, packageSpec)) {
			logError(`Official scanner failed without a retryable propagation error for ${packageSpec}.`);
			return 1;
		}
		if (attempt < maxAttempts) {
			logError(
				`Published scan attempt ${attempt}/${maxAttempts} is awaiting propagation; retrying in ${retryDelayMs / 1_000} seconds.`,
			);
			await delay(retryDelayMs);
		}
	}

	logError(`Official scanner did not explicitly report success for ${packageSpec}.`);
	return 1;
}

async function main() {
	prepareNpmAuth(process.env);
	const { name, version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
	const packageSpec = `${name}@${version}`;
	process.exitCode = await runPublishedScan({
		packageSpec,
		scan: () =>
			spawnSync('npx', ['--yes', '@n8n/scan-community-package@0.38.0', packageSpec], {
				cwd: root,
				encoding: 'utf8',
			}),
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}
