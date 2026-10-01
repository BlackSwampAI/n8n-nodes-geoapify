import { describe, expect, it } from 'vitest';
import { NodeHelpers, type IExecuteSingleFunctions, type INodeProperties } from 'n8n-workflow';
import { Geoapify, validateGeoapifyRequest } from '../nodes/Geoapify/Geoapify.node';
import { PLACE_CATEGORIES } from '../nodes/Geoapify/place-categories';

const node = new Geoapify();
const description = node.description;

function context(values: Record<string, unknown>) {
	return {
		getNodeParameter(name: string, fallback?: unknown) {
			if (name in values) return values[name];
			const nested = name
				.split('.')
				.reduce<unknown>(
					(value, key) =>
						value && typeof value === 'object'
							? (value as Record<string, unknown>)[key]
							: undefined,
					values,
				);
			return nested === undefined ? fallback : nested;
		},
		getNode: () => ({
			name: 'Geoapify',
			type: 'geoapify',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
	} as unknown as IExecuteSingleFunctions;
}

const base = {
	resource: 'places',
	operation: 'search',
	categoryMode: 'catalog',
	categories: ['commercial.supermarket'],
	filterType: 'circle',
	filterLatitude: 0,
	filterLongitude: 0,
	filterRadius: 0.001,
	searchOptions: { pageSize: 20, maxResults: 20, maxRequests: 5, startOffset: 0 },
};

function request(values: Record<string, unknown>) {
	return validateGeoapifyRequest.call(context(values), { url: '', qs: {} });
}

describe('Places parameter validation', () => {
	it.each([
		['blank catalog list', { categories: [] }],
		['blank custom list', { categoryMode: 'custom', customCategories: ' , ' }],
		['unknown catalog key', { categories: ['unknown.category'] }],
		['unknown custom key', { categoryMode: 'custom', customCategories: 'unknown.category' }],
		['non-string catalog entry', { categories: ['commercial', 3] }],
		['mixed valid and invalid catalog entries', { categories: ['commercial', false] }],
		[
			'unknown entry among valid custom keys',
			{
				categoryMode: 'custom',
				customCategories: 'commercial,unknown.category',
			},
		],
	])('rejects %s before request construction', async (_label, override) => {
		await expect(request({ ...base, ...(override as Record<string, unknown>) })).rejects.toThrow(
			'valid Geoapify place categories',
		);
	});

	it('accepts 100 unique catalog keys and rejects 101', async () => {
		const categories = PLACE_CATEGORIES.slice(0, 100);
		const accepted = await request({ ...base, categories });
		expect(accepted.qs).toMatchObject({ categories: categories.join(',') });
		await expect(request({ ...base, categories: PLACE_CATEGORIES.slice(0, 101) })).rejects.toThrow(
			'1 to 100 valid Geoapify place categories',
		);
	});

	it('accepts resolved expression values in the actual catalog and custom parameter shapes', async () => {
		const catalogParams = NodeHelpers.getNodeParameters(
			description.properties,
			{
				resource: 'places',
				operation: 'search',
				categoryMode: 'catalog',
				categories: ['commercial', 'commercial.supermarket'],
				filterType: 'circle',
				filterLatitude: 0,
				filterLongitude: 0,
				filterRadius: 2,
				searchOptions: { pageSize: 3, maxResults: 9, maxRequests: 4, startOffset: 7 },
			},
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(catalogParams).toMatchObject({
			categories: ['commercial', 'commercial.supermarket'],
			searchOptions: { pageSize: 3, maxResults: 9, maxRequests: 4, startOffset: 7 },
		});
		const catalogResult = await request(catalogParams as Record<string, unknown>);
		expect(catalogResult.qs).toMatchObject({
			categories: 'commercial,commercial.supermarket',
			limit: 3,
			offset: 7,
		});

		const customParams = NodeHelpers.getNodeParameters(
			description.properties,
			{
				resource: 'places',
				operation: 'search',
				categoryMode: 'custom',
				customCategories: 'commercial,commercial.supermarket',
				filterType: 'circle',
				filterLatitude: 0,
				filterLongitude: 0,
				filterRadius: 2,
				searchOptions: { pageSize: 3, maxResults: 9, maxRequests: 4, startOffset: 7 },
			},
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(customParams).toMatchObject({
			customCategories: 'commercial,commercial.supermarket',
			searchOptions: { pageSize: 3, maxResults: 9, maxRequests: 4, startOffset: 7 },
		});
		const customResult = await request(customParams as Record<string, unknown>);
		expect(customResult.qs).toMatchObject({
			categories: 'commercial,commercial.supermarket',
			limit: 3,
			offset: 7,
		});
	});

	it.each([
		['pageSize', 0],
		['pageSize', 501],
		['pageSize', 1.5],
		['pageSize', Number.NaN],
		['pageSize', Number.POSITIVE_INFINITY],
		['maxResults', 0],
		['maxResults', 5001],
		['maxResults', 2.5],
		['maxResults', Number.NaN],
		['maxResults', Number.NEGATIVE_INFINITY],
		['maxRequests', 0],
		['maxRequests', 21],
		['maxRequests', 1.2],
		['startOffset', -1],
		['startOffset', 1000001],
		['startOffset', 1.5],
		['startOffset', Number.NaN],
	])('rejects invalid %s value %s', async (name, value) => {
		await expect(
			request({ ...base, searchOptions: { ...base.searchOptions, [name]: value } }),
		).rejects.toThrow(`${name} must be an integer`);
	});

	it.each([
		['filterLatitude', -90],
		['filterLatitude', 90],
		['filterLongitude', -180],
		['filterLongitude', 180],
		['biasLatitude', -90],
		['biasLatitude', 90],
		['biasLongitude', -180],
		['biasLongitude', 180],
	])('accepts the inclusive %s boundary %s and preserves coordinate order', async (name, value) => {
		const bias = name.startsWith('bias');
		const values = {
			...base,
			...(bias ? { useProximityBias: true } : {}),
			...(bias ? { biasLatitude: 0, biasLongitude: 0 } : {}),
			[name]: value,
		};
		const result = await request(values);
		expect(result.qs).toHaveProperty(bias ? 'bias' : 'filter');
		if (bias) {
			expect(result.qs?.bias).toBe(
				name === 'biasLatitude' ? `proximity:0,${value}` : `proximity:${value},0`,
			);
		}
	});

	it.each([
		['filterLatitude', Number.NaN],
		['filterLongitude', Number.POSITIVE_INFINITY],
		['filterLatitude', -90.01],
		['filterLongitude', 180.01],
		['filterLatitude', '0'],
		['biasLatitude', Number.NaN],
		['biasLongitude', Number.NEGATIVE_INFINITY],
		['biasLatitude', 90.01],
		['biasLongitude', -180.01],
		['biasLongitude', '1'],
	])('rejects invalid coordinate %s=%s', async (name, value) => {
		await expect(request({ ...base, useProximityBias: true, [name]: value })).rejects.toThrow(
			'finite number',
		);
	});

	it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN, '10'])(
		'rejects circle radius %s',
		async (radius) => {
			await expect(request({ ...base, filterRadius: radius })).rejects.toThrow(
				'positive finite number',
			);
		},
	);

	it('accepts a tiny positive radius and validates None as ranking-only proximity', async () => {
		const circle = await request({ ...base, filterRadius: 0.000001 });
		expect(circle.qs?.filter).toBe('circle:0,0,0.000001');
		const noFilter = await request({
			...base,
			filterType: 'none',
			useProximityBias: true,
			biasLatitude: 0,
			biasLongitude: 0,
		});
		expect(noFilter.qs).toMatchObject({ bias: 'proximity:0,0' });
		expect(noFilter.qs).not.toHaveProperty('filter');
		await expect(request({ ...base, filterType: 'none' })).rejects.toThrow(
			'filter or enable proximity bias',
		);
	});

	it.each(['', ' ', 'a b', 'a,b', 'a|b', 'a:b', 'a/b', 'a?b', 'a#b', 'a&b', 123, false])(
		'rejects unsafe boundary identifier %s',
		async (placeId) => {
			await expect(
				request({ ...base, filterType: 'place', filterPlaceId: placeId }),
			).rejects.toThrow('Place boundary ID');
		},
	);

	it('accepts a safe documented boundary identifier', async () => {
		const result = await request({ ...base, filterType: 'place', filterPlaceId: 'ab' });
		expect(result.qs?.filter).toBe('place:ab');
	});
});

describe('Places and Place Details editor metadata', () => {
	function displayed(parameters: Record<string, unknown>, property: INodeProperties) {
		return NodeHelpers.displayParameter(
			parameters as never,
			property,
			{ typeVersion: 1 },
			description,
		);
	}

	function props(name: string) {
		return description.properties.filter((property) => property.name === name);
	}

	it('shows only one operation selector for each resource and the correct category entry mode', () => {
		for (const resource of ['geocoding', 'places', 'placeDetails']) {
			const params = { resource };
			const operationProperties = props('operation');
			expect(operationProperties.filter((property) => displayed(params, property))).toHaveLength(1);
		}
		const catalogParams = { resource: 'places', operation: 'search', categoryMode: 'catalog' };
		expect(displayed(catalogParams, props('categories')[0])).toBe(true);
		expect(displayed(catalogParams, props('customCategories')[0])).toBe(false);
		const customParams = { resource: 'places', operation: 'search', categoryMode: 'custom' };
		expect(displayed(customParams, props('categories')[0])).toBe(false);
		expect(displayed(customParams, props('customCategories')[0])).toBe(true);
	});

	it.each([
		['circle', ['filterLatitude', 'filterLongitude', 'filterRadius']],
		['rectangle', ['southLatitude', 'westLongitude', 'northLatitude', 'eastLongitude']],
		['place', ['filterPlaceId']],
	])('shows only required %s filter controls', (filterType, expected) => {
		const params = { resource: 'places', operation: 'search', filterType };
		const filterNames = [
			'filterLatitude',
			'filterLongitude',
			'filterRadius',
			'southLatitude',
			'westLongitude',
			'northLatitude',
			'eastLongitude',
			'filterPlaceId',
		];
		const visible = filterNames.filter((name) => displayed(params, props(name)[0]));
		expect(visible.sort()).toEqual([...(expected as string[])].sort());
		for (const name of expected as string[]) expect(props(name)[0].required).toBe(true);
	});

	it('requires only Place Details identifier and hides geocoding/search controls', () => {
		const params = { resource: 'placeDetails', operation: 'get' };
		expect(displayed(params, props('placeId')[0])).toBe(true);
		expect(props('placeId')[0].required).toBe(true);
		for (const name of [
			'categories',
			'filterType',
			'searchOptions',
			'address',
			'latitude',
			'options',
		])
			expect(displayed(params, props(name)[0])).toBe(false);
	});

	it('defines hard bounds, defaults, no Return All, and required category details', () => {
		const property = (name: string) => props(name)[0];
		const categories = property('categories');
		expect(categories.type).toBe('multiOptions');
		expect(categories.required).toBe(true);
		expect(categories.default).toEqual(['commercial']);
		expect(categories.options).toHaveLength(PLACE_CATEGORIES.length);
		const custom = property('customCategories');
		expect(custom.required).toBe(true);
		const searchOptions = property('searchOptions');
		expect(searchOptions.displayOptions?.show).toMatchObject({
			resource: ['places'],
			operation: ['search'],
		});
		const options = searchOptions.options as INodeProperties[];
		const byName = (name: string) => options.find((option) => option.name === name)!;
		for (const [name, min, max, value] of [
			['pageSize', 1, 500, 20],
			['maxResults', 1, 5000, 20],
			['maxRequests', 1, 20, 5],
			['startOffset', 0, 1000000, 0],
		] as const) {
			expect(byName(name)).toMatchObject({
				default: value,
				typeOptions: { minValue: min, maxValue: max },
			});
		}
		expect(options.some((option) => option.name.toLowerCase().includes('returnall'))).toBe(false);
		expect(categories.description).toContain('searchable');
		expect(
			categories.options?.some(
				(option) => 'value' in option && option.value === 'commercial.supermarket',
			),
		).toBe(true);
	});

	it('validates Place Details identifiers and ignores stale search parameters', async () => {
		for (const placeId of ['abc', 'x'.repeat(2048)]) {
			const result = await request({
				resource: 'placeDetails',
				operation: 'get',
				placeId,
				categories: [],
				filterType: 'invalid-stale-value',
				filterLatitude: 'stale',
				customCategories: 'unknown.hidden.category',
			});
			expect(result.qs).toEqual({ id: placeId });
		}

		for (const placeId of ['', '  ', 'ab', 'x'.repeat(2049), 'a b', 'a|b', 123, null]) {
			await expect(
				request({ resource: 'placeDetails', operation: 'get', placeId }),
			).rejects.toThrow('Place ID must contain 3 to 2048 characters.');
		}
	});
});
