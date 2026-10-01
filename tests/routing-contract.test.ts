import { describe, expect, it } from 'vitest';
import {
	NodeHelpers,
	NodeConnectionTypes,
	type IExecutePaginationFunctions,
	type IExecuteSingleFunctions,
	type INodePropertyOptions,
} from 'n8n-workflow';
import { Geoapify, oneRequest, sanitizeGeoapifyResponse } from '../nodes/Geoapify/Geoapify.node';

const routeFeature = {
	type: 'Feature',
	id: 'route-1',
	bbox: [-72, 42, -71, 43],
	geometry: {
		type: 'MultiLineString',
		coordinates: [
			[
				[-71.2, 42.1],
				[-72, 43],
			],
		],
	},
	properties: {
		mode: 'drive',
		units: 'metric',
		distance: 1000,
		time: 120,
		waypoints: [{ location: [-71.2, 42.1] }, { location: [-72, 43] }],
		legs: [{ distance: 1000, time: 120, steps: [] }],
		custom: { preserved: true },
	},
};
const collection = {
	type: 'FeatureCollection',
	bbox: [-72, 42, -71, 43],
	properties: { mode: 'drive', units: 'metric', waypoints: [] },
	features: [routeFeature, { ...routeFeature, id: 'route-2' }],
};
function context(values: Record<string, unknown> = {}) {
	return {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in values
				? values[name]
				: (name
						.split('.')
						.reduce<unknown>(
							(v, k) =>
								v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined,
							values,
						) ?? fallback),
		getNode: () => ({
			name: 'Geoapify',
			type: 'geoapify',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getItemIndex: () => 4,
		getCredentials: async () => ({ apiKey: 'secret' }),
		continueOnFail: () => false,
	} as unknown as IExecuteSingleFunctions;
}

describe('Routing Calculate output and editor contract', () => {
	it('registers resource and operation, practical ordered waypoint controls and documented travel profiles', () => {
		const description = new Geoapify().description;
		expect(description.inputs).toEqual([NodeConnectionTypes.Main]);
		const resource = description.properties.find((p) => p.name === 'resource')!;
		expect((resource.options as INodePropertyOptions[]).map(({ value }) => value)).toContain(
			'routing',
		);
		const operation = description.properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('routing'),
		)!;
		expect((operation.options as INodePropertyOptions[]).map(({ value }) => value)).toEqual([
			'calculate',
		]);
		const waypoints = description.properties.find((p) => p.name === 'waypoints')!;
		expect(waypoints.type).toBe('fixedCollection');
		expect(waypoints.required).toBe(true);
		expect(waypoints.default).toEqual({ waypoint: [] });
		expect(waypoints.typeOptions?.multipleValues).toBe(true);
		expect(waypoints.displayOptions?.show).toMatchObject({ waypointMode: ['fields'] });
		const controls = (
			waypoints.options![0] as { values: Array<{ name: string; displayName: string }> }
		).values;
		expect(controls.map(({ name, displayName }) => [name, displayName])).toEqual([
			['latitude', 'Latitude'],
			['longitude', 'Longitude'],
		]);
		const modes = description.properties.find((p) => p.name === 'mode')!
			.options as INodePropertyOptions[];
		expect(modes.map(({ value }) => value)).toHaveLength(17);
		expect(modes.find(({ value }) => value === 'light_truck')?.name).toBe('Light Truck');
		const routeOptions = description.properties.find((p) => p.name === 'routeOptions')!;
		expect(routeOptions.default).toEqual({});
		expect(routeOptions.options?.[0]).toMatchObject({ name: 'outputFormat', default: 'features' });
		const waypointMode = description.properties.find((p) => p.name === 'waypointMode')!;
		expect(waypointMode.default).toBe('fields');
		expect(waypointMode.noDataExpression).toBe(true);
		expect(
			description.properties.find((p) => p.name === 'waypointsJson')?.displayOptions?.show,
		).toMatchObject({ waypointMode: ['json'] });
	});
	it('normalizes the native repeated waypoint shape, defaults, and routing visibility', () => {
		const description = new Geoapify().description;
		const parameters = NodeHelpers.getNodeParameters(
			description.properties,
			{
				resource: 'routing',
				operation: 'calculate',
				waypoints: {
					waypoint: [
						{ latitude: 0, longitude: 0 },
						{ latitude: 1, longitude: 2 },
					],
				},
			},
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(parameters).toMatchObject({
			resource: 'routing',
			operation: 'calculate',
			waypoints: {
				waypoint: [
					{ latitude: 0, longitude: 0 },
					{ latitude: 1, longitude: 2 },
				],
			},
			mode: 'drive',
			routeOptions: {},
		});
		const defaults = NodeHelpers.getNodeParameters(
			description.properties,
			{ resource: 'routing', operation: 'calculate' },
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(defaults).toMatchObject({
			mode: 'drive',
			waypoints: { waypoint: [] },
			routeOptions: {},
		});
		expect(defaults).not.toHaveProperty('address');
		const jsonExpression = '={{$json.points}}';
		const jsonParameters = NodeHelpers.getNodeParameters(
			description.properties,
			{
				resource: 'routing',
				operation: 'calculate',
				waypointMode: 'json',
				waypointsJson: jsonExpression,
			},
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(jsonParameters).toMatchObject({
			waypointMode: 'json',
			waypointsJson: jsonExpression,
			mode: 'drive',
		});
		expect(jsonParameters).not.toHaveProperty('waypoints');
		expect(
			description.properties.find((p) => p.name === 'waypoints')?.displayOptions?.show,
		).toMatchObject({
			resource: ['routing'],
			operation: ['calculate'],
		});
	});
	it('returns every complete route feature linked to the input with explicit metric units', async () => {
		const result = await sanitizeGeoapifyResponse.call(
			context({ resource: 'routing', routeOptions: { outputFormat: 'features' } }),
			[],
			{ statusCode: 200, headers: {}, body: collection } as never,
		);
		expect(result).toHaveLength(2);
		expect(result.map((item) => item.pairedItem)).toEqual([{ item: 4 }, { item: 4 }]);
		expect(result[0].json).toMatchObject({
			type: 'Feature',
			id: 'route-1',
			bbox: routeFeature.bbox,
			geometry: routeFeature.geometry,
			properties: routeFeature.properties,
			_geoapifyUnits: { distance: 'meters', duration: 'seconds' },
		});
	});
	it('returns a full raw collection and successful empty outputs without inventing routes', async () => {
		const raw = await sanitizeGeoapifyResponse.call(
			context({ resource: 'routing', routeOptions: { outputFormat: 'raw' } }),
			[],
			{ statusCode: 200, headers: {}, body: collection } as never,
		);
		expect(raw).toHaveLength(1);
		expect(raw[0].json).toEqual(collection);
		const empty = { ...collection, features: [] };
		expect(
			await sanitizeGeoapifyResponse.call(context({ resource: 'routing' }), [], {
				statusCode: 200,
				headers: {},
				body: empty,
			} as never),
		).toEqual([]);
		expect(
			(
				await sanitizeGeoapifyResponse.call(
					context({ resource: 'routing', routeOptions: { outputFormat: 'raw' } }),
					[],
					{ statusCode: 200, headers: {}, body: empty } as never,
				)
			)[0].json,
		).toEqual(empty);
	});
	it('rejects malformed or contradictory route responses instead of returning truncated data', async () => {
		for (const bad of [
			{
				...collection,
				features: [
					{ ...routeFeature, properties: { ...routeFeature.properties, units: 'imperial' } },
				],
			},
			{
				...collection,
				features: [{ ...routeFeature, geometry: { type: 'LineString', coordinates: [] } }],
			},
		])
			await expect(
				sanitizeGeoapifyResponse.call(context({ resource: 'routing' }), [], {
					statusCode: 200,
					headers: {},
					body: bad,
				} as never),
			).rejects.toThrow('unexpected response');
	});
	it('does not transport invalid normalized parameters and links sanitized Continue On Fail errors', async () => {
		let requests = 0;
		const requestContext = (values: Record<string, unknown>, continueOnFail: boolean) =>
			Object.assign(context(values), {
				continueOnFail: () => continueOnFail,
				makeRoutingRequest: async () => {
					requests++;
					throw new Error('unexpected transport');
				},
			});
		for (const values of [
			{ resource: 'routing', operation: 'calculate', waypoints: { unexpected: [] }, mode: 'drive' },
			{
				resource: 'routing',
				operation: 'calculate',
				waypoints: {
					waypoint: [
						{ latitude: 0, longitude: 0, extra: true },
						{ latitude: 1, longitude: 2 },
					],
				},
				mode: 'drive',
			},
			{
				resource: 'routing',
				operation: 'calculate',
				waypoints: {
					waypoint: [
						{ latitude: 0, longitude: 0 },
						{ latitude: 1, longitude: 2 },
					],
				},
				mode: 'invalid',
			},
			{
				resource: 'routing',
				operation: 'calculate',
				waypoints: {
					waypoint: [
						{ latitude: 0, longitude: 0 },
						{ latitude: 1, longitude: 2 },
					],
				},
				mode: 'drive',
				routeOptions: { outputFormat: 'other' },
			},
		]) {
			const out = await oneRequest.call(
				requestContext(values, true) as unknown as IExecutePaginationFunctions,
				{ options: { url: '', qs: {} } } as never,
			);
			expect(out).toHaveLength(1);
			expect(out[0].pairedItem).toEqual({ item: 4 });
			expect(out[0].error?.message).not.toContain('secret');
		}
		expect(requests).toBe(0);
	});
	it('returns paired, sanitized Continue On Fail timeout and quota errors', async () => {
		const values = {
			resource: 'routing',
			operation: 'calculate',
			waypoints: {
				waypoint: [
					{ latitude: 0, longitude: 0 },
					{ latitude: 1, longitude: 2 },
				],
			},
			mode: 'drive',
		};
		for (const [error, expected] of [
			[
				Object.assign(
					new Error('Request to https://api.geoapify.com/v1/routing?apiKey=secret timed out'),
					{ code: 'ETIMEDOUT' },
				),
				'timed out after 30 seconds',
			],
			[
				Object.assign(new Error('https://api.geoapify.com/v1/routing?apiKey=secret failed'), {
					statusCode: 429,
					headers: { 'retry-after': '4' },
					response: { data: { message: 'Quota reached with secret' } },
				}),
				'rate or quota limit',
			],
		] as const) {
			const ctx = Object.assign(context(values), {
				continueOnFail: () => true,
				makeRoutingRequest: async () => {
					throw error;
				},
			});
			const out = await oneRequest.call(
				ctx as unknown as IExecutePaginationFunctions,
				{ options: { url: '', qs: {} } } as never,
			);
			expect(out).toHaveLength(1);
			expect(out[0].pairedItem).toEqual({ item: 4 });
			expect(JSON.stringify(out)).not.toContain('secret');
			expect(JSON.stringify(out)).not.toContain('api.geoapify.com');
			expect(out[0].error?.description).toContain(expected);
		}
	});
});
