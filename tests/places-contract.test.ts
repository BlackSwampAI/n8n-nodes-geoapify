import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type {
	IExecutePaginationFunctions,
	IExecuteSingleFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';
import {
	Geoapify,
	oneRequest,
	sanitizeGeoapifyResponse,
	validateGeoapifyRequest,
} from '../nodes/Geoapify/Geoapify.node';
import {
	PLACE_CATEGORIES,
	PLACE_CATEGORY_PROVENANCE,
	PLACE_CATEGORY_SET,
} from '../nodes/Geoapify/place-categories';

function context(values: Record<string, unknown>) {
	const getNodeParameter = (name: string, fallback?: unknown) => {
		if (name in values) return values[name];
		const nested = name
			.split('.')
			.reduce<unknown>(
				(v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
				values,
			);
		return nested === undefined ? fallback : nested;
	};
	return {
		getNodeParameter,
		getNode: () => ({
			name: 'Geoapify',
			type: 'geoapify',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getItemIndex: () => 3,
		getCredentials: async () => ({ apiKey: 'secret' }),
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
	filterRadius: 500,
	searchOptions: {
		pageSize: 20,
		maxResults: 20,
		maxRequests: 5,
		startOffset: 0,
		outputFormat: 'features',
	},
};

describe('Places and Place Details', () => {
	it('bundles the pinned searchable category catalog and validates categories from both entry paths', async () => {
		expect(PLACE_CATEGORIES).toHaveLength(833);
		expect(PLACE_CATEGORY_PROVENANCE).toMatchObject({
			version: '2.2.0',
			accessed: '2026-09-30',
			count: 833,
		});
		expect(createHash('sha256').update(JSON.stringify(PLACE_CATEGORIES)).digest('hex')).toBe(
			PLACE_CATEGORY_PROVENANCE.sha256JsonEnum,
		);
		expect(PLACE_CATEGORY_SET.has('commercial.supermarket')).toBe(true);
		const req = await validateGeoapifyRequest.call(
			context({
				...base,
				categoryMode: 'custom',
				customCategories: 'commercial, commercial.supermarket',
			}),
			{ url: '', qs: {} },
		);
		expect(req.qs).toMatchObject({
			categories: 'commercial,commercial.supermarket',
			filter: 'circle:0,0,500',
			limit: 20,
			offset: 0,
		});
		await expect(
			validateGeoapifyRequest.call(context({ ...base, categories: ['made.up'] }), {
				url: '',
				qs: {},
			}),
		).rejects.toThrow('valid Geoapify place categories');
	});

	it('serializes rectangle and place filters in longitude/latitude order; zero and boundary coordinates work', async () => {
		const rectangle = await validateGeoapifyRequest.call(
			context({
				...base,
				filterType: 'rectangle',
				southLatitude: -90,
				westLongitude: -180,
				northLatitude: 90,
				eastLongitude: 180,
			}),
			{ url: '', qs: {} },
		);
		expect(rectangle.qs).toMatchObject({ filter: 'rect:-180,-90,180,90' });
		const place = await validateGeoapifyRequest.call(
			context({ ...base, filterType: 'place', filterPlaceId: 'abc_123' }),
			{ url: '', qs: {} },
		);
		expect(place.qs).toMatchObject({ filter: 'place:abc_123' });
		const shortBoundary = await validateGeoapifyRequest.call(
			context({ ...base, filterType: 'place', filterPlaceId: 'ab' }),
			{ url: '', qs: {} },
		);
		expect(shortBoundary.qs).toMatchObject({ filter: 'place:ab' });
		await expect(
			validateGeoapifyRequest.call(
				context({ ...base, filterType: 'place', filterPlaceId: 'abc|circle:0,0,1' }),
				{ url: '', qs: {} },
			),
		).rejects.toThrow('single place identifier');
		await expect(
			validateGeoapifyRequest.call(
				context({
					...base,
					filterType: 'rectangle',
					southLatitude: 1,
					westLongitude: 0,
					northLatitude: 1,
					eastLongitude: 2,
				}),
				{ url: '', qs: {} },
			),
		).rejects.toThrow('south < north');
		await expect(
			validateGeoapifyRequest.call(context({ ...base, filterRadius: 0 }), { url: '', qs: {} }),
		).rejects.toThrow('positive finite');
	});

	it('keeps ranking bias separate from a spatial filter and bounds pagination', async () => {
		const req = await validateGeoapifyRequest.call(
			context({
				...base,
				filterType: 'none',
				useProximityBias: true,
				biasLatitude: 0,
				biasLongitude: 180,
				searchOptions: { pageSize: 500, maxResults: 5000, maxRequests: 20, startOffset: 12 },
			}),
			{ url: '', qs: {} },
		);
		expect(req.qs).toMatchObject({ bias: 'proximity:180,0', limit: 500, offset: 12 });
		await expect(
			validateGeoapifyRequest.call(context({ ...base, filterType: 'none' }), { url: '', qs: {} }),
		).rejects.toThrow('filter or enable proximity bias');
		await expect(
			validateGeoapifyRequest.call(context({ ...base, searchOptions: { pageSize: 501 } }), {
				url: '',
				qs: {},
			}),
		).rejects.toThrow('pageSize must be an integer');
	});

	it('aggregates overlapping raw pages with first-page metadata and cumulative offsets', async () => {
		const requests: Array<Record<string, unknown>> = [];
		const feature = (id: string) => ({
			type: 'Feature',
			id,
			properties: { place_id: id },
			geometry: null,
		});
		const mock = context({
			...base,
			searchOptions: {
				pageSize: 2,
				maxResults: 4,
				maxRequests: 5,
				startOffset: 7,
				outputFormat: 'raw',
			},
		});
		const ctx = Object.assign(mock, {
			continueOnFail: () => false,
			makeRoutingRequest: async (opts: { options: { qs: Record<string, unknown> } }) => {
				const offset = Number(opts.options.qs.offset);
				requests.push({ ...opts.options.qs });
				const features =
					offset === 7
						? [feature('p7'), feature('p8')]
						: offset === 9
							? [feature('p8'), feature('p9')]
							: [feature('p10')];
				return [
					{
						json: {
							type: 'FeatureCollection',
							properties: { source: 'first-page' },
							metadata: { page: offset },
							features,
						},
					},
				];
			},
		});
		const out = await oneRequest.call(
			ctx as unknown as IExecutePaginationFunctions,
			{ options: { url: '', qs: {} } } as never,
		);
		expect(requests).toHaveLength(3);
		expect(requests.map((q) => q.offset)).toEqual([7, 9, 11]);
		expect(requests.map((q) => q.limit)).toEqual([2, 2, 1]);
		expect(out).toHaveLength(1);
		expect(out[0].pairedItem).toEqual({ item: 3 });
		expect(out[0].json).toMatchObject({
			type: 'FeatureCollection',
			properties: { source: 'first-page' },
			metadata: { page: 7 },
		});
		expect(out[0].json.features).toHaveLength(4);
		expect(out[0].json._geoapifyPagination).toMatchObject({
			requests: 3,
			returned: 4,
			stopReason: 'maxResults',
		});
	});

	it('stops on empty and repeated pages, deduplicating stable place IDs despite changed properties', async () => {
		const page = (title: string) => [
			{
				json: {
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: { place_id: 'same', title }, geometry: null }],
				},
			},
		];
		let call = 0;
		const ctx = Object.assign(
			context({
				...base,
				searchOptions: {
					pageSize: 1,
					maxResults: 5,
					maxRequests: 5,
					startOffset: 0,
					outputFormat: 'raw',
				},
			}),
			{
				continueOnFail: () => false,
				makeRoutingRequest: async () => (call++ === 0 ? page('one') : page('changed')),
			},
		);
		const repeated = await oneRequest.call(
			ctx as unknown as IExecutePaginationFunctions,
			{ options: { url: '', qs: {} } } as never,
		);
		expect(call).toBe(2);
		expect(repeated[0].json.features).toHaveLength(1);
		expect(repeated[0].json._geoapifyPagination).toMatchObject({
			requests: 2,
			stopReason: 'repeatedPage',
		});
		const emptyContext = Object.assign(
			context({
				...base,
				searchOptions: {
					pageSize: 1,
					maxResults: 5,
					maxRequests: 5,
					startOffset: 0,
					outputFormat: 'raw',
				},
			}),
			{
				continueOnFail: () => false,
				makeRoutingRequest: async () => [{ json: { type: 'FeatureCollection', features: [] } }],
			},
		);
		const empty = await oneRequest.call(
			emptyContext as unknown as IExecutePaginationFunctions,
			{ options: { url: '', qs: {} } } as never,
		);
		expect(empty).toHaveLength(1);
		expect(empty[0].json.features).toEqual([]);
	});

	it('uses the request cap and returns a linked sanitized failure instead of partial pages on later-page errors', async () => {
		let calls = 0;
		const limited = Object.assign(
			context({
				...base,
				searchOptions: { pageSize: 1, maxResults: 5, maxRequests: 1, startOffset: 0 },
			}),
			{
				continueOnFail: () => false,
				makeRoutingRequest: async () => {
					calls++;
					return [{ json: { place_id: 'one' } }];
				},
			},
		);
		await oneRequest.call(
			limited as unknown as IExecutePaginationFunctions,
			{ options: { url: '', qs: {} } } as never,
		);
		expect(calls).toBe(1);
		let failingCalls = 0;
		const failing = Object.assign(
			context({
				...base,
				searchOptions: { pageSize: 1, maxResults: 5, maxRequests: 5, startOffset: 0 },
			}),
			{
				continueOnFail: () => true,
				makeRoutingRequest: async () => {
					if (failingCalls++)
						throw new Error('failed https://api.geoapify.com/v2/places?apiKey=secret');
					return [{ json: { place_id: 'first' } }];
				},
			},
		);
		const output = await oneRequest.call(
			failing as unknown as IExecutePaginationFunctions,
			{ options: { url: '', qs: {} } } as never,
		);
		expect(output).toHaveLength(1);
		expect(output[0].pairedItem).toEqual({ item: 3 });
		expect(JSON.stringify(output[0])).not.toContain('secret');
		expect(JSON.stringify(output[0])).not.toContain('api.geoapify.com');
	});

	it('exposes resource/operation choices and returns complete multi-geometry Place Details collections', async () => {
		const node = new Geoapify();
		const resources = node.description.properties.find((p) => p.name === 'resource')!;
		expect((resources.options as INodePropertyOptions[]).map((o) => o.value)).toEqual([
			'geocoding',
			'places',
			'placeDetails',
			'routing',
		]);
		const ctx = context({ resource: 'placeDetails', operation: 'get', placeId: 'place_abc' });
		const req = await validateGeoapifyRequest.call(ctx, { url: '', qs: {} });
		expect(req.qs).toEqual({ id: 'place_abc' });
		const collection = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'one',
					properties: { place_id: 'one', value: 1 },
					geometry: {
						type: 'Polygon',
						coordinates: [
							[
								[0, 0],
								[1, 0],
								[1, 1],
								[0, 0],
							],
						],
					},
				},
				{
					type: 'Feature',
					id: 'two',
					properties: { place_id: 'two' },
					geometry: {
						type: 'LineString',
						coordinates: [
							[0, 0],
							[1, 1],
						],
					},
				},
			],
		};
		const output = await sanitizeGeoapifyResponse.call(ctx, [], {
			statusCode: 200,
			body: collection,
		} as never);
		expect(output).toHaveLength(1);
		expect(output[0].json).toEqual(collection);
		const geometries = [
			{ type: 'Point', coordinates: [0, 0] },
			{
				type: 'LineString',
				coordinates: [
					[0, 0],
					[1, 1],
				],
			},
			{
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 0],
					],
				],
			},
			{
				type: 'MultiPoint',
				coordinates: [
					[0, 0],
					[1, 1],
				],
			},
			{
				type: 'MultiLineString',
				coordinates: [
					[
						[0, 0],
						[1, 1],
					],
				],
			},
			{
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[0, 0],
							[1, 0],
							[1, 1],
							[0, 0],
						],
					],
				],
			},
			{ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }] },
		];
		for (const geometry of geometries)
			await expect(
				sanitizeGeoapifyResponse.call(ctx, [], {
					statusCode: 200,
					body: {
						type: 'FeatureCollection',
						features: [{ type: 'Feature', properties: {}, geometry }],
					},
				} as never),
			).resolves.toHaveLength(1);
		for (const geometry of [
			{ type: 'Polygon', coordinates: 'bad' },
			{ type: 'Point', coordinates: [0, Infinity] },
			{ type: 'LineString', coordinates: [[0, 0]] },
			{ type: 'GeometryCollection', geometries: 'bad' },
			{ type: 'GeometryCollection', geometries: [null] },
		])
			await expect(
				sanitizeGeoapifyResponse.call(ctx, [], {
					statusCode: 200,
					body: {
						type: 'FeatureCollection',
						features: [{ type: 'Feature', properties: {}, geometry }],
					},
				} as never),
			).rejects.toThrow('unexpected response');
	});
});
