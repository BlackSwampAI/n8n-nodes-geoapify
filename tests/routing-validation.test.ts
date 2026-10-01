import { describe, expect, it } from 'vitest';
import type { IExecuteSingleFunctions } from 'n8n-workflow';
import { validateGeoapifyRequest } from '../nodes/Geoapify/Geoapify.node';

function context(values: Record<string, unknown>) {
	const getNodeParameter = (name: string, fallback?: unknown) => {
		if (name in values) return values[name];
		const nested = name
			.split('.')
			.reduce<unknown>(
				(value, key) =>
					value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
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
	} as unknown as IExecuteSingleFunctions;
}
const points = {
	waypoint: [
		{ latitude: 42.1, longitude: -71.2 },
		{ latitude: 43, longitude: -72 },
	],
};
const request = () => ({ url: '', qs: {} });

describe('Routing Calculate request contract', () => {
	it('serializes ordered latitude,longitude waypoints and fixed documented response units', async () => {
		const req = await validateGeoapifyRequest.call(
			context({ resource: 'routing', operation: 'calculate', waypoints: points, mode: 'drive' }),
			request(),
		);
		expect(req.qs).toEqual({
			waypoints: '42.1,-71.2|43,-72',
			mode: 'drive',
			units: 'metric',
			format: 'geojson',
		});
		expect(req.headers).toMatchObject({ Accept: 'application/geo+json' });
		expect(req.timeout).toBe(30000);
		const tiny = await validateGeoapifyRequest.call(
			context({
				resource: 'routing',
				operation: 'calculate',
				waypoints: {
					waypoint: [
						{ latitude: 1e-20, longitude: -1e-7 },
						{ latitude: 0, longitude: 0 },
					],
				},
				mode: 'drive',
			}),
			request(),
		);
		expect(tiny.qs).toMatchObject({ waypoints: '0.00000000000000000001,-0.0000001|0,0' });
	});
	it('accepts zero and inclusive coordinate bounds without coercing numeric strings', async () => {
		for (const waypoint of [
			[
				{ latitude: 0, longitude: 0 },
				{ latitude: 90, longitude: 180 },
			],
			[
				{ latitude: -90, longitude: -180 },
				{ latitude: 1, longitude: 2 },
			],
		])
			await expect(
				validateGeoapifyRequest.call(
					context({
						resource: 'routing',
						operation: 'calculate',
						waypoints: { waypoint },
						mode: 'walk',
					}),
					request(),
				),
			).resolves.toBeDefined();
		for (const waypoint of [
			[{ latitude: 1, longitude: 2 }],
			[
				{ latitude: 1, longitude: 2 },
				{ latitude: 91, longitude: 2 },
			],
			[
				{ latitude: 1, longitude: 2 },
				{ latitude: 2, longitude: 181 },
			],
			[
				{ latitude: '1', longitude: 2 },
				{ latitude: 2, longitude: 3 },
			],
			[
				{ latitude: NaN, longitude: 2 },
				{ latitude: 2, longitude: 3 },
			],
			[
				{ latitude: Infinity, longitude: 2 },
				{ latitude: 2, longitude: 3 },
			],
			[{ latitude: 1, longitude: 2 }, null],
		])
			await expect(
				validateGeoapifyRequest.call(
					context({
						resource: 'routing',
						operation: 'calculate',
						waypoints: { waypoint },
						mode: 'drive',
					}),
					request(),
				),
			).rejects.toThrow();
	});
	it('accepts ordered JSON text and resolved array expressions, and rejects malformed JSON entry modes', async () => {
		const jsonWaypoints = [
			{ latitude: 12.25, longitude: -98.5 },
			{ latitude: 14, longitude: -100 },
		];
		const fromText = await validateGeoapifyRequest.call(
			context({
				resource: 'routing',
				operation: 'calculate',
				waypointMode: 'json',
				waypointsJson: JSON.stringify(jsonWaypoints),
				mode: 'drive',
			}),
			request(),
		);
		expect(fromText.qs).toMatchObject({ waypoints: '12.25,-98.5|14,-100' });
		const fromResolvedExpression = await validateGeoapifyRequest.call(
			context({
				resource: 'routing',
				operation: 'calculate',
				waypointMode: 'json',
				waypointsJson: jsonWaypoints,
				mode: 'drive',
			}),
			request(),
		);
		expect(fromResolvedExpression.qs).toMatchObject({ waypoints: '12.25,-98.5|14,-100' });
		for (const [waypointMode, waypointsJson] of [
			['unknown', '[]'],
			['json', '[not json]'],
			['json', '{"latitude":1}'],
			['json', 'null'],
		] as const) {
			await expect(
				validateGeoapifyRequest.call(
					context({
						resource: 'routing',
						operation: 'calculate',
						waypointMode,
						waypointsJson,
						mode: 'drive',
					}),
					request(),
				),
			).rejects.toThrow();
		}
	});
	it('enforces 2 to 1000 waypoints and all official travel modes', async () => {
		for (const length of [2, 1000]) {
			const waypoint = Array.from({ length }, () => ({ latitude: 0, longitude: 0 }));
			await expect(
				validateGeoapifyRequest.call(
					context({
						resource: 'routing',
						operation: 'calculate',
						waypoints: { waypoint },
						mode: 'drive',
					}),
					request(),
				),
			).resolves.toBeDefined();
		}
		const tooMany = Array.from({ length: 1001 }, () => ({ latitude: 0, longitude: 0 }));
		await expect(
			validateGeoapifyRequest.call(
				context({
					resource: 'routing',
					operation: 'calculate',
					waypoints: { waypoint: tooMany },
					mode: 'drive',
				}),
				request(),
			),
		).rejects.toThrow('2 and 1000');
		for (const mode of [
			'walk',
			'hike',
			'scooter',
			'motorcycle',
			'drive',
			'light_truck',
			'bicycle',
			'mountain_bike',
			'road_bike',
			'bus',
			'medium_truck',
			'truck',
			'truck_dangerous_goods',
			'heavy_truck',
			'long_truck',
			'transit',
			'approximated_transit',
		])
			await expect(
				validateGeoapifyRequest.call(
					context({ resource: 'routing', operation: 'calculate', waypoints: points, mode }),
					request(),
				),
			).resolves.toBeDefined();
		await expect(
			validateGeoapifyRequest.call(
				context({ resource: 'routing', operation: 'calculate', waypoints: points, mode: 'custom' }),
				request(),
			),
		).rejects.toThrow('travel mode');
	});
});
