import { describe, expect, it } from 'vitest';

import { parseLinkHeader } from '../nodes/GithubIssues/shared/utils';

describe('parseLinkHeader', () => {
	it('maps quoted and unquoted link relations', () => {
		expect(
			parseLinkHeader(
				'<https://api.github.com/issues?page=2>; rel="next", <https://api.github.com/issues?page=4>; rel=last',
			),
		).toEqual({
			next: 'https://api.github.com/issues?page=2',
			last: 'https://api.github.com/issues?page=4',
		});
	});

	it('returns an empty map for absent or malformed headers', () => {
		expect(parseLinkHeader()).toEqual({});
		expect(parseLinkHeader('not-a-link')).toEqual({});
	});
});
