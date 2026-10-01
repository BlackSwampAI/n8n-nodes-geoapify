// Template invariant tests intentionally inspect repository files.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('raw template safety and tooling', () => {
	it('is private and keeps only the canonical declarative example registered', async () => {
		const packageJson = JSON.parse(await read('package.json')) as {
			private?: boolean;
			packageManager?: string;
			engines: { node: string };
			devDependencies: Record<string, string>;
			n8n: { nodes: string[]; credentials: string[] };
		};
		expect(packageJson.private).toBe(true);
		expect(packageJson.packageManager).toBe('npm@11.19.0');
		expect(packageJson.engines.node).toBe('>=22.22.0');
		expect(packageJson.devDependencies).toMatchObject({
			'@n8n/node-cli': '0.46.4',
			'@n8n/scan-community-package': '0.38.0',
			eslint: '9.39.4',
			prettier: '3.8.3',
			'release-it': '20.2.0',
			typescript: '5.9.3',
			vitest: '4.1.11',
		});
		expect(packageJson.n8n.nodes).toEqual(['dist/nodes/GithubIssues/GithubIssues.node.js']);
		expect(packageJson.n8n.credentials).toEqual([
			'dist/credentials/GithubIssuesApi.credentials.js',
			'dist/credentials/GithubIssuesOAuth2Api.credentials.js',
		]);
	});

	it('uses declarative routing for the default REST example', async () => {
		const [node, issue, issueComment] = await Promise.all([
			read('nodes/GithubIssues/GithubIssues.node.ts'),
			read('nodes/GithubIssues/resources/issue/index.ts'),
			read('nodes/GithubIssues/resources/issueComment/index.ts'),
		]);
		expect(node).toContain('requestDefaults:');
		expect(`${issue}\n${issueComment}`).toContain('routing:');
		expect(node).not.toMatch(/\bexecute\s*[=(:]/);
		for (const removedExamplePath of [
			'Example.node.ts',
			'Example.node.json',
			'example.svg',
			'example.dark.svg',
		]) {
			await expect(
				access(new URL(`../nodes/Example/${removedExamplePath}`, import.meta.url)),
			).rejects.toThrow();
		}
	});

	it('uses strict TypeScript and Vitest tests', async () => {
		const [testConfig, agents] = await Promise.all([read('tsconfig.test.json'), read('AGENTS.md')]);
		expect(testConfig).not.toMatch(/noImplicitAny.*false|noUnusedLocals.*false/);
		expect(agents).toContain('`*.test.ts`');
		expect(agents).toContain('Vitest');
	});

	it('tracks the adopted reusable template baseline', async () => {
		const marker = JSON.parse(await read('.blackswamp/template.json')) as {
			schemaVersion: number;
			templateVersion: string;
			sourceRepository: string;
		};
		expect(marker).toEqual({
			schemaVersion: 1,
			templateVersion: '2.1.1',
			sourceRepository: 'https://github.com/christopherjnelson/n8n-community-node-template',
		});
		const migrations = await read('docs/TEMPLATE_MIGRATIONS.md');
		expect(migrations).toContain('Generated repositories do not inherit later template changes');
		expect(migrations).toContain('## 2.1.1');
		expect(migrations).toContain('scanner 0.38.0');
		expect(migrations).toContain('declarative routing');
	});

	it('requires a documented exception before programmatic REST execution', async () => {
		const [agents, readme, apiMatrix, testing, handoff] = await Promise.all([
			read('AGENTS.md'),
			read('README.md'),
			read('docs/API_MATRIX_TEMPLATE.md'),
			read('docs/TESTING_TEMPLATE.md'),
			read('docs/BATCH_HANDOFF_TEMPLATE.md'),
		]);
		for (const policy of [agents, readme]) {
			expect(policy).toContain('declarative routing');
			expect(policy).toContain('`preSend`');
			expect(policy).toContain('`postReceive`');
			expect(policy).toContain('"weird JSON"');
		}
		expect(apiMatrix).toContain('Implementation style');
		expect(apiMatrix).toContain('Style justification or exception evidence');
		expect(testing).toContain('### Declarative routing contracts');
		expect(testing).toContain('### Programmatic execution responsibilities');
		expect(testing).toContain('does not mutate input items');
		expect(testing).toContain('paired-item lineage');
		expect(handoff).toContain('Implementation style:');
		expect(handoff).toContain('Style evidence:');
	});

	it('requires generated repositories to finalize documentation templates', async () => {
		const [releaseCheck, readme, readmeTemplate] = await Promise.all([
			read('scripts/release-check.mjs'),
			read('README.md'),
			read('README_TEMPLATE.md'),
		]);
		for (const path of ['docs/api-matrix.md', 'docs/testing.md', 'docs/branding.md']) {
			expect(releaseCheck).toContain(path);
			expect(readme).toContain(path);
		}
		expect(releaseCheck).toContain('still contains template placeholders');
		expect(releaseCheck).toContain('remove template source document');
		expect(releaseCheck).toContain('raw template must retain');
		expect(readmeTemplate).toContain('install-verified-community-nodes/');
		expect(readmeTemplate).toContain('installation-and-management/gui-installation/');
		expect(readmeTemplate).toContain('Private/unavailable:');
		expect(readmeTemplate).toContain('https://blackswampai.com/n8n-nodes/<PACKAGE_SLUG>/');
		expect(readmeTemplate).not.toContain('/community-nodes/installation/');
	});

	it('keeps release and publish safeguards', async () => {
		const [releaseCheck, publish, ci, packageJsonText] = await Promise.all([
			read('scripts/release-check.mjs'),
			read('.github/workflows/publish.yml'),
			read('.github/workflows/ci.yml'),
			read('package.json'),
		]);
		expect(releaseCheck).toContain('TEMPLATE_ORIGIN');
		expect(releaseCheck).toContain("templateMarker.templateVersion !== '2.1.1'");
		expect(releaseCheck).toContain(
			"const canonicalExample = 'dist/nodes/GithubIssues/GithubIssues.node.js'",
		);
		expect(releaseCheck).toContain('packageJson.n8n?.nodes?.length !== 1');
		expect(releaseCheck).not.toContain('dist/nodes/Example/Example.node.js');
		expect(releaseCheck).toContain("'nodes/Example/Example.node.ts'");
		expect(releaseCheck).toContain("'nodes/Example/Example.node.json'");
		expect(releaseCheck).toContain("'nodes/Example/example.svg'");
		expect(releaseCheck).toContain("'nodes/Example/example.dark.svg'");
		expect(releaseCheck).toContain(
			'template must not retain programmatic fixture ${removedExamplePath}',
		);
		expect(releaseCheck).toContain('replace(/^ssh:\\/\\/git@github\\.com\\//');
		expect(releaseCheck).toContain('/<[A-Z][A-Z0-9_ -]*>/');
		expect(releaseCheck).toContain('/\\b(?:TODO|CHANGEME)\\b/i');
		expect(releaseCheck).not.toContain('/TODO|CHANGEME/i');
		expect(releaseCheck).toContain('/YOUR[-_][A-Z0-9_-]+/');
		expect(releaseCheck).toContain(
			'id-token: write must be scoped to the publish job, not the workflow',
		);
		expect(releaseCheck).not.toContain('YOUR[-_ ][A-Z0-9_-]*');
		expect(releaseCheck).not.toContain('<[^>]+>');
		expect(releaseCheck).not.toContain('_[a-z][^_]*_');
		expect(publish).toContain('id-token: write');
		expect(publish).toContain("'v*.*.*'");
		const [publishJob, verifyPublishedJob = ''] = publish.split(/\n {2}verify-published:\s*\n/);
		expect(verifyPublishedJob).toMatch(/needs:\s*publish/);
		expect(verifyPublishedJob).toContain('npm ci');
		expect(verifyPublishedJob).toContain('npm run scan:published');
		expect(verifyPublishedJob).not.toContain('npm run release');
		expect(verifyPublishedJob).not.toContain('id-token: write');
		expect(publishJob).not.toContain('npm run scan:published');
		expect(ci).toMatch(/timeout-minutes:\s*20/);
		expect(publish).toMatch(/timeout-minutes:\s*30/);
		expect(publish).toContain('npm install --global npm@11.19.0');
		expect(ci).toContain('npm install --global npm@11.19.0');
		for (const workflow of [publish, ci]) {
			expect(workflow.indexOf('npm run build')).toBeLessThan(
				workflow.indexOf('npm run scan:source'),
			);
			expect(workflow.indexOf('npm run scan:source')).toBeLessThan(
				workflow.indexOf('npm run package:check'),
			);
			expect(workflow).toContain('npm run smoke:install');
		}
		expect(publish).toContain('node scripts/prepare-npm-auth.mjs');
		expect(packageJsonText).toContain('"scan:source"');
		expect(await read('scripts/node-load-smoke.mjs')).toContain(
			'Packaged SVG icon needs a usable viewBox',
		);
		expect(await read('docs/BRANDING_TEMPLATE.md')).toContain(
			'Creator Portal card version and logo',
		);
	});
});
