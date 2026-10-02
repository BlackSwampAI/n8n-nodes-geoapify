import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const TEMPLATE_ORIGIN = 'https://github.com/christopherjnelson/n8n-community-node-template';
const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const normalizeGitHubUrl = (value = '') =>
	String(value)
		.trim()
		.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
		.replace(/^git@github\.com:/, 'https://github.com/')
		.replace(/^git\+/, '')
		.replace(/\.git\/?$/, '')
		.replace(/\/$/, '');
const hasPlaceholder = (value) =>
	typeof value === 'string' &&
	(/<[A-Z][A-Z0-9_ -]*>/.test(value) ||
		/\b(?:TODO|CHANGEME)\b/i.test(value) ||
		/YOUR[-_][A-Z0-9_-]+/.test(value));

const packageJson = JSON.parse(read('package.json'));
const readme = read('README.md');
const releasing = read('RELEASING.md');
const sourceScanner = read('scripts/scan-source.mjs');
const publishedScanner = read('scripts/scan-published.mjs');
const publishWorkflow = read('.github/workflows/publish.yml');
const ciWorkflow = read('.github/workflows/ci.yml');
const brandingTemplate = read(
	existsSync(resolve(root, 'docs/branding.md')) ? 'docs/branding.md' : 'docs/BRANDING_TEMPLATE.md',
);
let origin = '';
try {
	const dotGit = resolve(root, '.git');
	const gitDirectory = statSync(dotGit).isDirectory()
		? dotGit
		: resolve(
				root,
				readFileSync(dotGit, 'utf8')
					.replace(/^gitdir:\s*/, '')
					.trim(),
			);
	const commonDirectoryFile = resolve(gitDirectory, 'commondir');
	const commonDirectory = existsSync(commonDirectoryFile)
		? resolve(gitDirectory, readFileSync(commonDirectoryFile, 'utf8').trim())
		: gitDirectory;
	const gitConfig = readFileSync(resolve(commonDirectory, 'config'), 'utf8');
	const originSection = gitConfig.match(/\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? '';
	origin = normalizeGitHubUrl(originSection.match(/^\s*url\s*=\s*(.+)$/m)?.[1]);
	if (!origin) throw new Error('origin URL is missing');
} catch (error) {
	fail(
		`unable to verify the GitHub origin: ${error instanceof Error ? error.message : 'unknown error'}`,
	);
}
const isTemplateMode = origin === TEMPLATE_ORIGIN;

for (const path of [
	'LICENSE.md',
	'CHANGELOG.md',
	'RELEASING.md',
	'vitest.config.mts',
	'tsconfig.test.json',
	'.github/workflows/ci.yml',
	'.github/workflows/publish.yml',
	'.github/pull_request_template.md',
	'docs/BATCH_HANDOFF_TEMPLATE.md',
	'docs/TEMPLATE_MIGRATIONS.md',
	'.blackswamp/template.json',
]) {
	if (!existsSync(resolve(root, path))) fail(`${path} is required`);
}
for (const script of [
	'format',
	'format:check',
	'lint',
	'lint:fix',
	'typecheck',
	'test',
	'test:unit',
	'review:source',
	'build',
	'release:check',
	'package:check',
	'release',
	'prepublishOnly',
	'scan:source',
	'scan:published',
	'smoke:load',
	'smoke:install',
]) {
	if (!packageJson.scripts?.[script]) fail(`package.json script ${script} is required`);
}
if (packageJson.scripts?.release !== 'n8n-node release') fail('release must use n8n-node release');
if (packageJson.scripts?.prepublishOnly !== 'n8n-node prerelease')
	fail('prepublishOnly must use n8n-node prerelease');
if (packageJson.scripts?.test !== 'vitest run') fail('test must run Vitest');
if (!packageJson.scripts?.typecheck?.includes('tsconfig.test.json'))
	fail('typecheck must include strict test TypeScript');
if (packageJson.devDependencies?.vitest !== '4.1.11') fail('Vitest must be pinned to 4.1.11');
if (packageJson.devDependencies?.['@n8n/scan-community-package'] !== '0.38.0')
	fail('official community scanner must be pinned to 0.38.0');
if (packageJson.packageManager !== 'npm@11.19.0') fail('packageManager must pin npm@11.19.0');
try {
	const templateMarker = JSON.parse(read('.blackswamp/template.json'));
	if (
		templateMarker.schemaVersion !== 1 ||
		templateMarker.templateVersion !== '2.2.0' ||
		templateMarker.sourceRepository !== TEMPLATE_ORIGIN
	)
		fail('.blackswamp/template.json must identify template baseline 2.2.0');
} catch {
	fail('.blackswamp/template.json must contain valid JSON');
}
for (const [dependency, version] of [
	['@n8n/node-cli', '0.46.4'],
	['eslint', '9.39.4'],
	['prettier', '3.8.3'],
	['release-it', '20.2.0'],
	['typescript', '5.9.3'],
	['vitest', '4.1.11'],
]) {
	if (packageJson.devDependencies?.[dependency] !== version) {
		fail(`${dependency} must be pinned to ${version}`);
	}
}
if (packageJson.engines?.node !== '>=22.22.0') fail('engines.node must be >=22.22.0');
if (packageJson.allowScripts?.['eslint-plugin-n8n-nodes-base'] !== false)
	fail('eslint-plugin install scripts must be denied');
if (Object.keys(packageJson.dependencies ?? {}).length)
	fail('runtime dependencies are not allowed');
if (packageJson.peerDependencies?.['n8n-workflow'] !== '*')
	fail('n8n-workflow must remain a host-provided peer');
if (packageJson.n8n?.strict !== true) fail('n8n.strict must be true');
if (packageJson.files?.length !== 1 || packageJson.files[0] !== 'dist')
	fail('package files must expose only dist');
if (!publishWorkflow.includes("- 'v*.*.*'")) fail('publish must be tag-only');
for (const guidance of [
	'contrasting backgrounds',
	'packed tarball',
	'Creator Portal card version and logo',
])
	if (!brandingTemplate.includes(guidance)) fail(`branding guidance is missing: ${guidance}`);
if (!/timeout-minutes:\s*20/.test(ciWorkflow)) fail('CI must have a 20-minute job timeout');
if (!/timeout-minutes:\s*30/.test(publishWorkflow))
	fail('publish must have a 30-minute job timeout');
const [publishJob, verifyPublishedJob = ''] = publishWorkflow.split(/\n {2}verify-published:\s*\n/);
const publishWorkflowPreamble = publishJob.slice(0, publishJob.indexOf('\njobs:'));
const checkout = publishJob.indexOf('actions/checkout@v6');
const fullHistory = publishJob.indexOf('fetch-depth: 0');
const releaseTagGuard = publishJob.indexOf('node scripts/verify-release-tag.mjs');
if (
	checkout < 0 ||
	fullHistory <= checkout ||
	releaseTagGuard <= fullHistory ||
	!/actions\/checkout@v6\n\s+with:\n\s+fetch-depth: 0\n\s+- name: Verify immutable release tag\n\s+run: node scripts\/verify-release-tag\.mjs/.test(
		publishJob,
	) ||
	releaseTagGuard >= publishJob.indexOf('actions/setup-node@v6') ||
	releaseTagGuard >= publishJob.indexOf('npm ci') ||
	releaseTagGuard >= publishJob.indexOf('node scripts/prepare-npm-auth.mjs') ||
	releaseTagGuard >= publishJob.indexOf('npm run release')
)
	fail('publish must fetch full history and verify the release tag immediately after checkout');
if (/id-token:\s*write/.test(publishWorkflowPreamble))
	fail('id-token: write must be scoped to the publish job, not the workflow');
if (!/id-token:\s*write/.test(publishJob) || !/contents:\s*read/.test(publishJob))
	fail('publish job permissions are incomplete');
if (
	!/needs:\s*publish/.test(verifyPublishedJob) ||
	!verifyPublishedJob.includes('actions/checkout@v6') ||
	!verifyPublishedJob.includes('actions/setup-node@v6') ||
	!verifyPublishedJob.includes('npm install --global npm@11.19.0') ||
	!verifyPublishedJob.includes('npm run scan:published') ||
	!verifyPublishedJob.includes('npm ci') ||
	!/contents:\s*read/.test(verifyPublishedJob) ||
	!/timeout-minutes:\s*30/.test(verifyPublishedJob)
)
	fail('verify-published must be a fresh, read-only, bounded job that depends on publish');
if (publishJob.includes('npm run scan:published') || verifyPublishedJob.includes('npm run release'))
	fail('publication and published-package verification must remain separate jobs');
if (/id-token:\s*write/.test(verifyPublishedJob))
	fail('verify-published must not receive id-token: write');
if (!publishWorkflow.includes('secrets.NPM_TOKEN'))
	fail('publish must retain bootstrap token support');
const notifyDiscordJob = publishWorkflow.split(/\n {2}notify-discord:\s*\n/)[1] ?? '';
if (
	!notifyDiscordJob.includes('needs: [publish, verify-published]') ||
	!notifyDiscordJob.includes('contents: read') ||
	!notifyDiscordJob.includes('node scripts/notify-discord.mjs') ||
	!notifyDiscordJob.includes('secrets.DISCORD_WEBHOOK') ||
	!notifyDiscordJob.includes('continue-on-error: true') ||
	/id-token:\s*write/.test(notifyDiscordJob) ||
	/NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/.test(notifyDiscordJob)
)
	fail('Discord notification must be optional, read-only, and depend on both release jobs');
if (packageJson.scripts?.dev !== 'node scripts/dev.mjs')
	fail('dev must launch the port-pinned wrapper');
for (const path of [
	'scripts/prepare-npm-auth.mjs',
	'scripts/verify-release-tag.mjs',
	'scripts/review-node-source.mjs',
	'scripts/verify-npm-version.mjs',
	'scripts/scan-source.mjs',
	'scripts/scan-published.mjs',
	'scripts/dev.mjs',
	'scripts/notify-discord.mjs',
	'scripts/node-load-smoke.mjs',
	'scripts/package-install-smoke.mjs',
]) {
	if (!existsSync(resolve(root, path))) fail(`${path} is required`);
}
if (
	!sourceScanner.includes('SOURCE_FILE_PATTERNS') ||
	!sourceScanner.includes("'dist/**/*.js'") ||
	!sourceScanner.includes("'package.json'")
) {
	fail('scanner preflight must inspect official source and built-package patterns');
}
if (!publishedScanner.includes('has passed all security checks'))
	fail('published scan must require the official explicit-success message');
for (const [label, workflow] of [
	['CI', ciWorkflow],
	['publish', publishWorkflow],
]) {
	if (!workflow.includes('npm install --global npm@11.19.0')) {
		fail(`${label} workflow must install npm 11.19.0 before npm ci`);
	}
}
for (const gate of ['format:check', 'lint', 'typecheck', 'test', 'build', 'package:check']) {
	if (
		!ciWorkflow.includes(`npm run ${gate}`) &&
		!(gate === 'test' && ciWorkflow.includes('npm test'))
	) {
		fail(`CI must run npm run ${gate}`);
	}
}
if (!ciWorkflow.includes('workflow_dispatch:')) fail('CI must support manual dispatch');
if (
	!packageJson.scripts?.['review:source']?.includes('scripts/review-node-source.mjs') ||
	!ciWorkflow.includes('npm run review:source') ||
	!publishJob.includes('npm run review:source') ||
	ciWorkflow.indexOf('npm run review:source') >= ciWorkflow.indexOf('npm run build') ||
	publishJob.indexOf('npm run review:source') >= publishJob.indexOf('npm run build')
)
	fail('CI and publish must review source before build');
for (const [label, workflow] of [
	['CI', ciWorkflow],
	['publish', publishWorkflow],
]) {
	const build = workflow.indexOf('npm run build');
	const scan = workflow.indexOf('npm run scan:source');
	const pack = workflow.indexOf('npm run package:check');
	if (build < 0 || scan < build || pack < scan)
		fail(`${label} must scan source and built output after build and before packaging`);
	for (const command of ['npm run smoke:load', 'npm run smoke:install']) {
		if (!workflow.includes(command)) fail(`${label} must run ${command}`);
	}
}
for (const command of [
	'node scripts/verify-npm-version.mjs',
	'node scripts/prepare-npm-auth.mjs',
]) {
	if (!publishJob.includes(command)) fail(`publish must run ${command}`);
}
if (/currently (?:a )?release candidate|has not been published|not published yet/i.test(readme))
	fail('README contains transient release-state wording');
if (/currently (?:a )?release candidate|has not been published|not published yet/i.test(releasing))
	fail('RELEASING contains transient release-state wording');

if (process.env.GITHUB_REF_TYPE === 'tag') {
	const expectedTag = `v${packageJson.version}`;
	if (process.env.GITHUB_REF_NAME !== expectedTag)
		fail(`release tag must exactly match package version (${expectedTag})`);
}

if (isTemplateMode) {
	for (const path of [
		'docs/API_MATRIX_TEMPLATE.md',
		'docs/TESTING_TEMPLATE.md',
		'docs/BRANDING_TEMPLATE.md',
	]) {
		if (!existsSync(resolve(root, path))) fail(`raw template must retain ${path}`);
	}
	if (packageJson.private !== true) fail('raw template must remain private');
	if (packageJson.name !== 'n8n-nodes-community-template') fail('template package name changed');
	if (normalizeGitHubUrl(packageJson.repository?.url) !== TEMPLATE_ORIGIN)
		fail('template repository URL must match origin');
	const canonicalExample = 'dist/nodes/GithubIssues/GithubIssues.node.js';
	if (packageJson.n8n?.nodes?.length !== 1 || packageJson.n8n.nodes[0] !== canonicalExample) {
		fail(`template must retain only the canonical declarative example ${canonicalExample}`);
	}
	for (const removedExamplePath of [
		'nodes/Example/Example.node.ts',
		'nodes/Example/Example.node.json',
		'nodes/Example/example.svg',
		'nodes/Example/example.dark.svg',
	]) {
		if (existsSync(resolve(root, removedExamplePath)))
			fail(`template must not retain programmatic fixture ${removedExamplePath}`);
	}
	if (!readme.includes('Use this template'))
		fail('template README must explain GitHub template use');
} else {
	for (const path of ['docs/api-matrix.md', 'docs/testing.md', 'docs/branding.md']) {
		if (!existsSync(resolve(root, path))) {
			fail(`${path} is required in generated repositories`);
			continue;
		}
		if (hasPlaceholder(read(path))) fail(`${path} still contains template placeholders`);
	}
	for (const path of [
		'docs/API_MATRIX_TEMPLATE.md',
		'docs/TESTING_TEMPLATE.md',
		'docs/BRANDING_TEMPLATE.md',
	]) {
		if (existsSync(resolve(root, path))) fail(`remove template source document ${path}`);
	}
	if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?n8n-nodes-[a-z0-9][a-z0-9._-]*$/.test(packageJson.name ?? ''))
		fail('name must be a final scoped or unscoped n8n-nodes-* name');
	for (const [label, value] of [
		['name', packageJson.name],
		['description', packageJson.description],
		['homepage', packageJson.homepage],
		['repository.url', packageJson.repository?.url],
		['author.name', packageJson.author?.name],
		['author.email', packageJson.author?.email],
	]) {
		if (!value || hasPlaceholder(value)) fail(`package.json ${label} is missing or a placeholder`);
	}
	if (packageJson.private === true)
		fail('remove private:true only after finalizing release identity');
	if (packageJson.license !== 'MIT' || packageJson.publishConfig?.access !== 'public')
		fail('normal mode requires MIT and public publish config');
	if (!packageJson.keywords?.includes('n8n-community-node-package'))
		fail('community keyword is required');
	if (!packageJson.n8n?.nodes?.length) fail('register at least one compiled node');
	if (normalizeGitHubUrl(packageJson.repository?.url) !== origin)
		fail('repository.url must match origin');
	for (const heading of [
		'## Installation',
		'## Compatibility',
		'## Credentials',
		'## Operations',
		'## Troubleshooting',
		'## Resources',
		'## License',
	]) {
		if (!readme.includes(heading)) fail(`README is missing ${heading}`);
	}
	if (hasPlaceholder(readme)) fail('README still contains template placeholders');
	if (/## Version history/i.test(readme))
		fail('README must link CHANGELOG.md instead of duplicating version history');
	if (/nodes\/Example|nodes\/GithubIssues|GithubIssuesApi/.test(JSON.stringify(packageJson.n8n)))
		fail('remove or replace template example registrations');
}

if (failures.length) {
	console.error('Release audit failed:\n');
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}
console.log(
	isTemplateMode
		? 'Template audit passed in fail-closed private mode'
		: `Release audit passed for ${packageJson.name}@${packageJson.version}`,
);
