import { readFileSync } from 'node:fs';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let report;
try {
	[report] = JSON.parse(input);
} catch {
	console.error('Package boundary check failed: npm pack did not return valid JSON');
	process.exit(1);
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = new Set((report?.files ?? []).map(({ path }) => path));
const failures = [];

for (const path of files) {
	if (!['LICENSE.md', 'README.md', 'package.json'].includes(path) && !path.startsWith('dist/')) {
		failures.push(`unexpected tarball file: ${path}`);
	}
}
for (const registration of [
	...(packageJson.n8n?.nodes ?? []),
	...(packageJson.n8n?.credentials ?? []),
]) {
	if (!files.has(registration))
		failures.push(`registered artifact missing from tarball: ${registration}`);
}
if (!files.has('package.json') || !files.has('README.md') || !files.has('LICENSE.md')) {
	failures.push('tarball must contain package.json, README.md, and LICENSE.md');
}

if (failures.length) {
	console.error('Package boundary check failed:\n');
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(
	`Package boundary passed: ${report.entryCount} files, ${report.size} packed bytes, ${report.unpackedSize} unpacked bytes`,
);
