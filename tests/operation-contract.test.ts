import { describe, expect, it } from 'vitest';
import { GithubIssues } from '../nodes/GithubIssues/GithubIssues.node';
import {
	assertRequiredControls,
	normalizeResourceLocator,
	requireNonBlankDefaults,
} from './helpers/operation-contract';

describe('reusable node operation contracts', () => {
	it('checks required controls against actual display conditions', () => {
		const description = new GithubIssues().description;
		expect(() =>
			assertRequiredControls(description, {
				resource: 'issue',
				operation: 'create',
				requiredControls: ['title'],
			}),
		).not.toThrow();
		const title = description.properties.find(({ name }) => name === 'title');
		expect(title?.required).toBe(true);
		expect(title?.displayOptions?.show).toEqual({
			resource: ['issue'],
			operation: ['create'],
		});
	});

	it('normalizes manual and list-mode resource locator values', () => {
		expect(normalizeResourceLocator(' manual-id ', 'Example')).toBe('manual-id');
		expect(normalizeResourceLocator({ mode: 'list', value: ' listed-id ' }, 'Example')).toBe(
			'listed-id',
		);
		expect(() => normalizeResourceLocator({ mode: 'list' }, 'Example')).toThrow(
			'Example must contain a non-empty list or manual value',
		);
	});

	it('demonstrates a test-contract preflight before a mocked transport call', () => {
		let transportCalls = 0;
		const execute = () => {
			requireNonBlankDefaults({ name: '' }, ['name']);
			transportCalls += 1;
		};
		expect(execute).toThrow('name is required before transport');
		expect(transportCalls).toBe(0);
	});
});
