import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUEST_TIMEOUT_MS = 10_000;

export function buildDiscordPayload({ packageName, version, repository, tag, runUrl }) {
	const encodedPackage = packageName.split('/').map(encodeURIComponent).join('/');
	const npmUrl = `https://www.npmjs.com/package/${encodedPackage}/v/${encodeURIComponent(version)}`;
	const tagUrl = `https://github.com/${repository}/tree/${encodeURIComponent(tag)}`;
	return {
		content: `Released **${packageName}@${version}** successfully.\n${npmUrl}\n${tagUrl}\n${runUrl}`,
		allowed_mentions: { parse: [] },
	};
}

export function webhookUrlWithWait(webhook) {
	const url = new URL(webhook);
	url.searchParams.set('wait', 'true');
	return url;
}

export async function notifyDiscord({
	webhook,
	packageName,
	version,
	repository,
	tag,
	runUrl,
	fetchImpl = fetch,
}) {
	if (!webhook) return { skipped: true };
	let response;
	try {
		response = await fetchImpl(webhookUrlWithWait(webhook), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(buildDiscordPayload({ packageName, version, repository, tag, runUrl })),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch {
		throw new Error('Discord webhook request failed');
	}
	if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);
	return { skipped: false };
}

async function main() {
	const packageJson = JSON.parse(
		await readFile(new URL('../package.json', import.meta.url), 'utf8'),
	);
	try {
		const result = await notifyDiscord({
			webhook: process.env.DISCORD_WEBHOOK,
			packageName: packageJson.name,
			version: packageJson.version,
			repository: process.env.GITHUB_REPOSITORY,
			tag: process.env.GITHUB_REF_NAME,
			runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
		});
		console.log(
			result.skipped
				? 'Discord notification skipped: DISCORD_WEBHOOK is not configured'
				: 'Discord release notification sent',
		);
	} catch {
		console.error(
			'Discord release notification failed; webhook details and response body were suppressed',
		);
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}
