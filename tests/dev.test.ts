import { describe, expect, it } from 'vitest';
import { createDevProcessOptions, DEV_PORT } from '../scripts/dev.mjs';

describe('development launcher', () => {
	it('forces the disposable n8n port while preserving the environment', () => {
		const options = createDevProcessOptions({ PATH: '/bin', N8N_PORT: '5678' }, [
			'--custom-user-folder',
			'/tmp/example',
		]);
		expect(DEV_PORT).toBe('5690');
		expect(options.environment).toMatchObject({ PATH: '/bin', N8N_PORT: '5690' });
		expect(options.arguments).toEqual(['dev', '--custom-user-folder', '/tmp/example']);
	});
});
