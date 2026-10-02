/* eslint-disable @n8n/community-nodes/no-restricted-imports -- disposable source/package fixtures */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRegistration, runNodeLoadSmoke } from '../scripts/node-load-smoke.mjs';
import { findEmptyPropertyPlaceholders, reviewNodeSource } from '../scripts/review-node-source.mjs';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(prefix: string) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
}

function write(path: string, contents: string) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
}

function registrationFixture(nodeModule: string, credentialModule?: string) {
	const root = temporaryRoot('node-registration-review-');
	write(join(root, 'dist/nodes/TestNode.node.js'), nodeModule);
	write(
		join(root, 'dist/credentials/TestApi.credentials.js'),
		credentialModule ??
			`class TestApi { constructor() { this.name = 'testApi'; this.icon = 'file:test.svg'; } } module.exports = { TestApi };`,
	);
	write(join(root, 'dist/nodes/test.svg'), '<svg viewBox="0 0 32 32"></svg>');
	write(join(root, 'dist/credentials/test.svg'), '<svg viewBox="0 0 32 32"></svg>');
	write(
		join(root, 'package.json'),
		JSON.stringify({
			n8n: {
				nodes: ['dist/nodes/TestNode.node.js'],
				credentials: ['dist/credentials/TestApi.credentials.js'],
			},
		}),
	);
	return root;
}

const validNode = `class TestNode { constructor() { this.description = { name: 'testNode', displayName: 'Test Node', version: 1, icon: 'file:test.svg', credentials: [{ name: 'testApi' }] }; } } module.exports = { TestNode, metadata: { stable: true }, helper: () => true };`;

describe('compiled registration constructor contract', () => {
	it('loads valid filename-matching node and credential constructors', () => {
		const root = registrationFixture(validNode);
		expect(runNodeLoadSmoke(root)).toEqual({ nodeCount: 1, credentialCount: 1 });
	});

	it('rejects a module with no constructible exports', () => {
		const root = registrationFixture(`module.exports = { metadata: { stable: true } };`);
		expect(() => loadRegistration(root, 'dist/nodes/TestNode.node.js', 'node')).toThrow(
			'must export constructible TestNode; constructible exports: none',
		);
	});

	it('rejects a missing expected export despite a usable alternate node constructor', () => {
		const root = registrationFixture(validNode.replace(/TestNode/g, 'AlternateNode'));
		expect(() => loadRegistration(root, 'dist/nodes/TestNode.node.js', 'node')).toThrow(
			'must export constructible TestNode; constructible exports: AlternateNode',
		);
	});

	it('rejects a redundant alias even when it references the expected constructor', () => {
		const root = registrationFixture(
			`class TestNode {} module.exports = { TestNode, TestNodeAlias: TestNode };`,
		);
		expect(() => loadRegistration(root, 'dist/nodes/TestNode.node.js', 'node')).toThrow(
			'redundant or unrelated constructible exports: TestNodeAlias; export only TestNode',
		);
	});

	it('rejects an unrelated constructor without instantiating it', () => {
		const root = registrationFixture(
			`class TestNode {} class Explodes { constructor() { throw new Error('constructor ran'); } } module.exports = { TestNode, Explodes };`,
		);
		expect(() => loadRegistration(root, 'dist/nodes/TestNode.node.js', 'node')).toThrow(
			'redundant or unrelated constructible exports: Explodes',
		);
	});

	it('rejects wrong-case constructor names', () => {
		const root = registrationFixture(validNode.replace(/TestNode/g, 'Testnode'));
		expect(() => loadRegistration(root, 'dist/nodes/TestNode.node.js', 'node')).toThrow(
			'must export constructible TestNode; constructible exports: Testnode',
		);
	});

	it('enforces filename matching for usable credential constructors', () => {
		const root = registrationFixture(
			validNode,
			`class AlternateApi { constructor() { this.name = 'testApi'; this.icon = 'file:test.svg'; } } module.exports = { AlternateApi };`,
		);
		expect(() =>
			loadRegistration(root, 'dist/credentials/TestApi.credentials.js', 'credential'),
		).toThrow('must export constructible TestApi; constructible exports: AlternateApi');
	});

	it('rejects the expected constructor when it does not produce the registered kind', () => {
		const root = registrationFixture(`class TestNode {} module.exports = { TestNode };`);
		expect(() => loadRegistration(root, 'dist/nodes/TestNode.node.js', 'node')).toThrow(
			'export TestNode is not a usable node',
		);
	});
});

describe('node source placeholder review', () => {
	it('rejects the original empty property-only operation module shape', () => {
		const root = temporaryRoot('node-source-review-');
		write(
			join(root, 'nodes/Service/resources/comment/get.ts'),
			`import type { INodeProperties } from 'n8n-workflow';\nexport const commentGetDescription: INodeProperties[] = [];\n`,
		);

		expect(findEmptyPropertyPlaceholders(root)).toEqual([
			{
				path: 'nodes/Service/resources/comment/get.ts',
				reason:
					'exports only empty INodeProperties arrays plus import/type scaffolding; remove the placeholder and its import/spread',
			},
		]);
		expect(() => reviewNodeSource(root)).toThrow(
			'nodes/Service/resources/comment/get.ts: exports only empty INodeProperties arrays',
		);
	});

	it('also detects the Array<INodeProperties> spelling with type scaffolding', () => {
		const root = temporaryRoot('node-source-review-');
		write(
			join(root, 'nodes/Service/empty.ts'),
			`import type { INodeProperties } from 'n8n-workflow';\ntype Local = INodeProperties;\nexport const fields: Array<INodeProperties> = [];\n`,
		);
		expect(findEmptyPropertyPlaceholders(root)).toHaveLength(1);
	});

	it('allows imports-only modules, generic empty arrays, and meaningful modules', () => {
		const root = temporaryRoot('node-source-review-');
		write(
			join(root, 'nodes/Service/imports.ts'),
			`import type { IDataObject } from 'n8n-workflow';\n`,
		);
		write(join(root, 'nodes/Service/generic.ts'), `export const values: string[] = [];\n`);
		write(
			join(root, 'nodes/Service/logic.ts'),
			`import type { INodeProperties } from 'n8n-workflow';\nexport const fields: INodeProperties[] = [];\nexport function build() { return fields; }\n`,
		);
		write(
			join(root, 'nodes/Service/Service.node.ts'),
			`export class Service { description = { properties: [], options: [] }; }\n`,
		);

		expect(findEmptyPropertyPlaceholders(root)).toEqual([]);
		expect(reviewNodeSource(root).fileCount).toBe(4);
	});

	it('preserves modules with runtime imports or value re-exports', () => {
		const root = temporaryRoot('node-source-review-');
		write(
			join(root, 'nodes/Service/real-operation.ts'),
			`export const operation = { value: 'get' };\n`,
		);
		write(
			join(root, 'nodes/Service/reexport.ts'),
			`import type { INodeProperties } from 'n8n-workflow';\nexport const fields: INodeProperties[] = [];\nexport { operation } from './real-operation';\n`,
		);
		write(
			join(root, 'nodes/Service/side-effect.ts'),
			`import './register-runtime';\nimport type { INodeProperties } from 'n8n-workflow';\nexport const fields: INodeProperties[] = [];\n`,
		);

		expect(findEmptyPropertyPlaceholders(root)).toEqual([]);
	});
});
