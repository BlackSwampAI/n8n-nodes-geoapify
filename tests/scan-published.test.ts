import { describe, expect, it, vi } from 'vitest';
import { runPublishedScan } from '../scripts/scan-published.mjs';

const packageSpec = '@example/n8n-nodes-service@1.2.3';
const success = `Package ${packageSpec} has passed all security checks`;
const propagationFailure = `Package ${packageSpec} has failed security checks\nReason: No package metadata found for version 1.2.3`;

function runnerOptions(scan: ReturnType<typeof vi.fn>) {
	return {
		packageSpec,
		scan,
		delay: vi.fn().mockResolvedValue(undefined),
		writeOutput: vi.fn(),
		logError: vi.fn(),
	};
}

describe('published scanner runner', () => {
	it('waits for the default settling period before its first scan', async () => {
		let resolveSettling!: () => void;
		const settling = new Promise<void>((resolve) => {
			resolveSettling = resolve;
		});
		const options = runnerOptions(
			vi.fn().mockResolvedValue({ status: 0, stdout: success, stderr: '' }),
		);
		options.delay.mockReturnValueOnce(settling);
		const result = runPublishedScan(options);
		expect(options.delay).toHaveBeenCalledTimes(1);
		expect(options.delay).toHaveBeenCalledWith(60_000);
		expect(options.scan).not.toHaveBeenCalled();
		expect(options.logError).toHaveBeenCalledWith(
			'Published scan is allowing registry metadata to settle for 60 seconds before the first attempt.',
		);
		resolveSettling();
		await expect(result).resolves.toBe(0);
		expect(options.scan).toHaveBeenCalledOnce();
	});

	it('waits between a recognized propagation failure and a successful retry', async () => {
		const scan = vi
			.fn()
			.mockResolvedValueOnce({ status: 1, stdout: propagationFailure, stderr: '' })
			.mockResolvedValueOnce({ status: 0, stdout: success, stderr: '' });
		const options = runnerOptions(scan);
		await expect(runPublishedScan(options)).resolves.toBe(0);
		expect(options.delay.mock.calls).toEqual([[60_000], [30_000]]);
		expect(scan).toHaveBeenCalledTimes(2);
	});

	it('exhausts eleven propagation attempts without an extra final delay', async () => {
		const options = runnerOptions(
			vi.fn().mockResolvedValue({ status: 1, stdout: propagationFailure, stderr: '' }),
		);
		await expect(runPublishedScan(options)).resolves.toBe(1);
		expect(options.scan).toHaveBeenCalledTimes(11);
		expect(options.delay.mock.calls).toEqual([[60_000], ...Array(10).fill([30_000])]);
		expect(options.logError).toHaveBeenLastCalledWith(
			`Official scanner did not explicitly report success for ${packageSpec}.`,
		);
	});

	it('fails deterministic findings immediately, including mixed propagation output', async () => {
		const mixedFailure = `${propagationFailure}\nReason: ESLint violations found\nfile.ts:1:1 error`;
		const options = runnerOptions(
			vi.fn().mockResolvedValue({ status: 1, stdout: mixedFailure, stderr: '' }),
		);
		await expect(runPublishedScan(options)).resolves.toBe(1);
		expect(options.scan).toHaveBeenCalledOnce();
		expect(options.delay.mock.calls).toEqual([[60_000]]);
		expect(options.logError).toHaveBeenLastCalledWith(
			`Official scanner reported a deterministic security failure for ${packageSpec}.`,
		);
	});

	it('fails unrelated errors immediately', async () => {
		const options = runnerOptions(
			vi.fn().mockResolvedValue({
				status: 1,
				stdout: '',
				stderr: 'Request failed with status code 429',
			}),
		);
		await expect(runPublishedScan(options)).resolves.toBe(1);
		expect(options.scan).toHaveBeenCalledOnce();
		expect(options.delay.mock.calls).toEqual([[60_000]]);
	});

	it.each([
		['an exit-zero result without a success marker', { status: 0, stdout: '', stderr: '' }],
		[
			'a success marker for another package',
			{
				status: 0,
				stdout: 'Package @example/other@1.2.3 has passed all security checks',
				stderr: '',
			},
		],
	])('rejects %s', async (_label, result) => {
		const options = runnerOptions(vi.fn().mockResolvedValue({ ...result, status: 0 }));
		await expect(runPublishedScan(options)).resolves.toBe(1);
		expect(options.scan).toHaveBeenCalledOnce();
		expect(options.delay.mock.calls).toEqual([[60_000]]);
	});

	it.each([
		['a success marker with a nonzero process status', { status: 1, stdout: success, stderr: '' }],
		[
			'a success marker with a spawn error',
			{ status: 0, error: new Error('spawn failed'), stdout: success, stderr: '' },
		],
	])('rejects %s', async (_label, result) => {
		const options = runnerOptions(vi.fn().mockResolvedValue(result));
		await expect(runPublishedScan(options)).resolves.toBe(1);
		expect(options.scan).toHaveBeenCalledOnce();
	});
});
