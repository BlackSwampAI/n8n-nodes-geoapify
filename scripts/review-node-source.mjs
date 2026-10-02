import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function sourceFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFiles(path));
		else if (entry.isFile() && extname(entry.name) === '.ts' && !entry.name.endsWith('.test.ts'))
			files.push(path);
	}
	return files;
}

function isINodePropertiesArray(type) {
	if (!type) return false;
	if (ts.isArrayTypeNode(type)) return type.elementType.getText() === 'INodeProperties';
	return (
		ts.isTypeReferenceNode(type) &&
		type.typeName.getText() === 'Array' &&
		type.typeArguments?.length === 1 &&
		type.typeArguments[0].getText() === 'INodeProperties'
	);
}

function isEmptyArray(expression) {
	return Boolean(
		expression && ts.isArrayLiteralExpression(expression) && expression.elements.length === 0,
	);
}

function isExported(statement) {
	return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isEmptyPropertyExport(statement) {
	return (
		ts.isVariableStatement(statement) &&
		isExported(statement) &&
		statement.declarationList.declarations.length > 0 &&
		statement.declarationList.declarations.every(
			(declaration) =>
				isINodePropertiesArray(declaration.type) && isEmptyArray(declaration.initializer),
		)
	);
}

function isScaffolding(statement) {
	return (
		(ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly === true) ||
		(ts.isImportEqualsDeclaration(statement) && statement.isTypeOnly) ||
		ts.isInterfaceDeclaration(statement) ||
		ts.isTypeAliasDeclaration(statement) ||
		(ts.isExportDeclaration(statement) && statement.isTypeOnly) ||
		statement.kind === ts.SyntaxKind.EmptyStatement
	);
}

export function findEmptyPropertyPlaceholders(root = process.cwd()) {
	const nodesRoot = resolve(root, 'nodes');
	let files;
	try {
		files = sourceFiles(nodesRoot);
	} catch (error) {
		if (error && typeof error === 'object' && error.code === 'ENOENT') return [];
		throw error;
	}
	const findings = [];
	for (const path of files) {
		const source = ts.createSourceFile(
			path,
			readFileSync(path, 'utf8'),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		const statements = [...source.statements];
		const emptyExports = statements.filter(isEmptyPropertyExport);
		if (
			emptyExports.length > 0 &&
			statements.every((statement) => isScaffolding(statement) || isEmptyPropertyExport(statement))
		) {
			findings.push({
				path: relative(root, path),
				reason:
					'exports only empty INodeProperties arrays plus import/type scaffolding; remove the placeholder and its import/spread',
			});
		}
	}
	return findings;
}

export function reviewNodeSource(root = process.cwd()) {
	const findings = findEmptyPropertyPlaceholders(root);
	if (findings.length > 0) {
		throw new Error(
			`Node source review failed:\n${findings.map(({ path, reason }) => `- ${path}: ${reason}`).join('\n')}`,
		);
	}
	return { reviewedRoot: resolve(root), fileCount: sourceFiles(resolve(root, 'nodes')).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
	const result = reviewNodeSource(root);
	console.log(`Reviewed ${result.fileCount} TypeScript node source file(s)`);
}
