import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEV_PORT = '5690';

export function createDevProcessOptions(
	environment = process.env,
	arguments_ = process.argv.slice(2),
) {
	return {
		arguments: ['dev', ...arguments_],
		environment: { ...environment, N8N_PORT: DEV_PORT },
	};
}

export function runDev() {
	const cli = fileURLToPath(
		new URL('../node_modules/@n8n/node-cli/bin/n8n-node.mjs', import.meta.url),
	);
	const options = createDevProcessOptions();
	const child = spawn(process.execPath, [cli, ...options.arguments], {
		stdio: 'inherit',
		env: options.environment,
	});

	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.once(signal, () => child.kill(signal));
	}
	child.once('error', (error) => {
		console.error(`Unable to start the n8n development instance: ${error.message}`);
		process.exitCode = 1;
	});
	child.once('exit', (code, signal) => {
		if (signal) process.kill(process.pid, signal);
		else process.exitCode = code ?? 1;
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	runDev();
}
