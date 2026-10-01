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
	runUrl: 'https://github.com/owner/repository/actions/runs/42',
};

describe('Discord release notification', () => {
	it('builds links and prevents mentions', () => {
		expect(buildDiscordPayload(release)).toEqual({
			content:
				'Released **@example/n8n-nodes-demo@1.2.3** successfully.\nhttps://www.npmjs.com/package/%40example/n8n-nodes-demo/v/1.2.3\nhttps://github.com/owner/repository/tree/v1.2.3\nhttps://github.com/owner/repository/actions/runs/42',
			allowed_mentions: { parse: [] },
		});
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
