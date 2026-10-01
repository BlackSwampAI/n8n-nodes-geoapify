import { describe, expect, it, vi } from 'vitest';
import {
	buildDiscordPayload,
	notifyDiscord,
	webhookUrlWithWait,
} from '../scripts/notify-discord.mjs';

const release = {
	packageName: '@example/n8n-nodes-demo',
	version: '1.2.3',
	repository: 'owner/repository',
	tag: 'v1.2.3',
};

describe('Discord release notification', () => {
	it('identifies the verified release with one source link and prevents mentions', () => {
		expect(buildDiscordPayload(release)).toEqual({
			content:
				'Released **@example/n8n-nodes-demo@1.2.3**: npm publication and published-package verification succeeded.\nRepository/tag: owner/repository @ v1.2.3\nhttps://github.com/owner/repository/tree/v1.2.3',
			allowed_mentions: { parse: [] },
		});
	});

	it('emits exactly one URL and encodes the tag in its source link', () => {
		const payload = buildDiscordPayload({ ...release, tag: 'release/1.2.3' });
		expect(payload.content.match(/https?:\/\/\S+/g)).toEqual([
			'https://github.com/owner/repository/tree/release%2F1.2.3',
		]);
		expect(payload.content).toContain('Repository/tag: owner/repository @ release/1.2.3');
	});

	it('adds wait=true without dropping a Discord thread', () => {
		const url = webhookUrlWithWait('https://discord.com/api/webhooks/1/token?thread_id=99');
		expect(url.searchParams.get('thread_id')).toBe('99');
		expect(url.searchParams.get('wait')).toBe('true');
	});

	it('skips cleanly when the optional secret is missing', async () => {
		const fetchMock = vi.fn();
		await expect(notifyDiscord({ webhook: '', fetchImpl: fetchMock, ...release })).resolves.toEqual(
			{ skipped: true },
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('posts JSON once with a bounded signal', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
		await expect(
			notifyDiscord({
				webhook: 'https://discord.com/api/webhooks/1/token',
				fetchImpl: fetchMock,
				...release,
			}),
		).resolves.toEqual({ skipped: false });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.searchParams.get('wait')).toBe('true');
		expect(options).toMatchObject({
			method: 'POST',
			headers: { 'content-type': 'application/json' },
		});
		expect(options.signal).toBeInstanceOf(AbortSignal);
		expect(timeoutSpy).toHaveBeenCalledWith(10_000);
		expect(JSON.parse(String(options.body))).toEqual(buildDiscordPayload(release));
	});

	it('reports only a sanitized status on HTTP failure', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
		await expect(
			notifyDiscord({
				webhook: 'https://discord.com/api/webhooks/1/SECRET',
				fetchImpl: fetchMock,
				...release,
			}),
		).rejects.toThrow('Discord webhook returned HTTP 429');
		await expect(
			notifyDiscord({
				webhook: 'https://discord.com/api/webhooks/1/SECRET',
				fetchImpl: fetchMock,
				...release,
			}),
		).rejects.not.toThrow('SECRET');
	});

	it('redacts transport failures and does not retry', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValue(new Error('request to https://discord.com/api/webhooks/1/SECRET failed'));
		await expect(
			notifyDiscord({
				webhook: 'https://discord.com/api/webhooks/1/SECRET',
				fetchImpl: fetchMock,
				...release,
			}),
		).rejects.toThrow('Discord webhook request failed');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
