import { describe, expect, it } from 'vitest';
import {
	NodeHelpers,
	NodeApiError,
	NodeOperationError,
	type IExecutePaginationFunctions,
	type IExecuteSingleFunctions,
	type INodePropertyOptions,
} from 'n8n-workflow';
import {
	Geoapify,
	oneRequest,
	sanitizeGeoapifyResponse,
	validateGeoapifyRequest,
} from '../nodes/Geoapify/Geoapify.node';
import { GeoapifyApi } from '../credentials/GeoapifyApi.credentials';

function context(values: Record<string, unknown>, extras: Record<string, unknown> = {}) {
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
			type: 'n8n-nodes-geoapify.geoapify',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getItemIndex: () => 2,
		continueOnFail: () => false,
		getCredentials: async () => ({ apiKey: 'SECRET-KEY-123' }),
		...extras,
	} as unknown as IExecuteSingleFunctions;
}
const feature = {
	type: 'Feature',
	properties: {
		formatted: '12 Main St',
		lat: 1,
		lon: 2,
		rank: { confidence: 0.93 },
		place_id: 'p1',
	},
	geometry: { type: 'Point', coordinates: [2, 1] },
};

describe('Geoapify credential and declarative routing contract', () => {
	it('declares one password-masked API key and x-api-key injection, tests a documented endpoint, and is referenced by the node', () => {
		const credential = new GeoapifyApi();
		expect(credential.name).toBe('geoapifyApi');
		expect(credential.properties[0]).toMatchObject({
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
		});
		expect(credential.authenticate.properties.headers).toEqual({
			'x-api-key': '={{$credentials.apiKey}}',
		});
		expect(credential.test.request).toMatchObject({
			url: '/geocode/search',
			method: 'GET',
			qs: { text: 'Berlin', limit: 1, format: 'geojson' },
		});
		expect(new Geoapify().description.credentials).toEqual([
			{ name: 'geoapifyApi', required: true },
		]);
		const operation = new Geoapify().description.properties.find(
			({ name }) => name === 'operation',
		);
		expect(
			(operation?.options as INodePropertyOptions[] | undefined)?.map(({ value }) => value),
		).toEqual(['forward', 'reverse']);
		const allOperations = new Geoapify().description.properties.filter(
			(property) => property.name === 'operation',
		);
		expect((allOperations[1].options as INodePropertyOptions[]).map(({ value }) => value)).toEqual([
			'search',
		]);
		expect((allOperations[2].options as INodePropertyOptions[]).map(({ value }) => value)).toEqual([
			'get',
		]);
		expect(
			(operation?.options as INodePropertyOptions[] | undefined)?.every(
				({ routing }) => routing?.send?.paginate === true,
			),
		).toBe(true);
	});

	it('constructs free-form and structured queries from evaluated node parameters and actual nested Options values', async () => {
		const freeform = context({
			operation: 'forward',
			addressMode: 'freeform',
			address: ' Boston Common ',
			options: { maxResults: 8, language: 'en', resultType: '' },
			forwardOptions: { countryCodes: 'US, ca' },
		});
		const request = await validateGeoapifyRequest.call(freeform, {
			url: 'https://api.geoapify.com/v1/geocode/search',
			qs: {},
		});
		expect(request.qs).toEqual({
			text: 'Boston Common',
			filter: 'countrycode:us,ca',
			limit: 8,
			lang: 'en',
			format: 'geojson',
		});
		const structured = context({
			operation: 'forward',
			addressMode: 'structured',
			street: 'Main St',
			housenumber: '4',
			city: 'Boston',
			options: { maxResults: 5, language: '', resultType: '' },
			forwardOptions: { countryCodes: '' },
		});
		expect(
			(
				await validateGeoapifyRequest.call(structured, {
					url: 'https://api.geoapify.com/v1/geocode/search',
					qs: {},
				})
			).qs,
		).toMatchObject({ street: 'Main St', housenumber: '4', city: 'Boston', limit: 5 });
	});

	it('rejects blank, mistyped, incomplete and malformed parameters before transport', async () => {
		const blank = context({ operation: 'forward', addressMode: 'freeform', address: '  ' });
		await expect(
			validateGeoapifyRequest.call(blank, {
				url: 'https://api.geoapify.com/v1/geocode/search',
				qs: {},
			}),
		).rejects.toThrow('non-empty address');
		const structured = context({ operation: 'forward', addressMode: 'structured' });
		await expect(
			validateGeoapifyRequest.call(structured, {
				url: 'https://api.geoapify.com/v1/geocode/search',
				qs: {},
			}),
		).rejects.toThrow('requires at least one');
		const country = context({
			operation: 'forward',
			addressMode: 'freeform',
			address: 'Rome',
			forwardOptions: { countryCodes: 'USA' },
		});
		await expect(
			validateGeoapifyRequest.call(country, {
				url: 'https://api.geoapify.com/v1/geocode/search',
				qs: {},
			}),
		).rejects.toThrow('ISO alpha-2');
		const badLimit = context({
			operation: 'forward',
			addressMode: 'freeform',
			address: 'Rome',
			options: { maxResults: 101 },
		});
		await expect(
			validateGeoapifyRequest.call(badLimit, {
				url: 'https://api.geoapify.com/v1/geocode/search',
				qs: {},
			}),
		).rejects.toThrow('integer from 1 to 100');
		for (const values of [
			{ resource: 'customApiCall', operation: 'forward', addressMode: 'freeform', address: 'Rome' },
			{ resource: 'geocoding', operation: 'forward', addressMode: 'other', address: 'Rome' },
			{
				resource: 'geocoding',
				operation: 'forward',
				addressMode: 'freeform',
				address: 'Rome',
				options: { outputFormat: 'unknown' },
			},
		]) {
			await expect(
				validateGeoapifyRequest.call(context(values), {
					url: 'https://api.geoapify.com/v1/geocode/search',
					qs: {},
				}),
			).rejects.toThrow();
		}
	});

	it('keeps reverse coordinates in lat/lon order, accepts zero and documented inclusive bounds', async () => {
		for (const [latitude, longitude] of [
			[0, 0],
			[-90, -180],
			[90, 180],
		]) {
			const ctx = context({
				operation: 'reverse',
				latitude,
				longitude,
				options: { maxResults: 1 },
			});
			const qs = (
				await validateGeoapifyRequest.call(ctx, {
					url: 'https://api.geoapify.com/v1/geocode/search',
					qs: {},
				})
			).qs;
			expect(qs).toMatchObject({ lat: latitude, lon: longitude, limit: 1 });
		}
		for (const [latitude, longitude] of [
			[-90.01, 0],
			[0, 180.01],
			[true, 1],
			[NaN, 1],
			[Infinity, 1],
			['', 1],
			[' ', 1],
			[0, null],
			[0, {}],
		]) {
			const ctx = context({
				operation: 'reverse',
				latitude,
				longitude,
				options: { maxResults: 1 },
			});
			await expect(
				validateGeoapifyRequest.call(ctx, {
					url: 'https://api.geoapify.com/v1/geocode/search',
					qs: {},
				}),
			).rejects.toThrow();
		}
	});

	it('normalizes matches, returns zero default items for no matches, and preserves raw collections per input', async () => {
		const ctx = context({ options: { outputFormat: 'features' } });
		const secondFeature = {
			...feature,
			properties: { ...feature.properties, formatted: '13 Main St', rank: { confidence: 0.71 } },
		};
		const result = await sanitizeGeoapifyResponse.call(ctx, [], {
			statusCode: 200,
			headers: {},
			body: { type: 'FeatureCollection', features: [feature, secondFeature] },
		});
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			json: {
				formatted: '12 Main St',
				rank: { confidence: 0.93 },
				place_id: 'p1',
				geometry: feature.geometry,
			},
			pairedItem: { item: 2 },
		});
		const empty = await sanitizeGeoapifyResponse.call(ctx, [], {
			statusCode: 200,
			headers: {},
			body: { type: 'FeatureCollection', features: [] },
		});
		expect(empty).toEqual([]);
		const raw = context({ options: { outputFormat: 'raw' } });
		expect(
			await sanitizeGeoapifyResponse.call(raw, [], {
				statusCode: 200,
				headers: {},
				body: { type: 'FeatureCollection', features: [feature] },
			}),
		).toMatchObject([{ json: { type: 'FeatureCollection' }, pairedItem: { item: 2 } }]);
		const emptyRaw = context({ options: { outputFormat: 'raw' } });
		expect(
			await sanitizeGeoapifyResponse.call(emptyRaw, [], {
				statusCode: 200,
				headers: {},
				body: { type: 'FeatureCollection', features: [] },
			}),
		).toEqual([
			{
				json: { type: 'FeatureCollection', features: [] },
				pairedItem: { item: 2 },
			},
		]);
		await expect(
			sanitizeGeoapifyResponse.call(ctx, [], {
				statusCode: 429,
				headers: { 'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT' },
				body: { message: 'Quota exceeded' },
			}),
		).rejects.toMatchObject({
			description: expect.stringContaining('Wed, 21 Oct 2015 07:28:00 GMT'),
		});
		await expect(
			sanitizeGeoapifyResponse.call(ctx, [], {
				statusCode: 400,
				headers: {},
				body: { message: 'Invalid address component' },
			}),
		).rejects.toMatchObject({ description: expect.stringContaining('Invalid address component') });
		await expect(
			sanitizeGeoapifyResponse.call(ctx, [], {
				statusCode: 200,
				headers: {},
				body: {
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: [], geometry: null }],
				},
			}),
		).rejects.toThrow('unexpected response');
		const rawWithMalformedFeature = context({ options: { outputFormat: 'raw' } });
		await expect(
			sanitizeGeoapifyResponse.call(rawWithMalformedFeature, [], {
				statusCode: 200,
				headers: {},
				body: {
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: [], geometry: null }],
				},
			}),
		).rejects.toThrow('unexpected response');
	});

	it('turns authentication, quota and service errors into useful sanitized n8n API errors', async () => {
		const ctx = context({});
		for (const [statusCode, message] of [
			[401, 'Check that the API key'],
			[429, 'rate or quota'],
			[503, 'service error'],
		] as const) {
			await expect(
				sanitizeGeoapifyResponse.call(ctx, [], {
					statusCode,
					headers: { 'retry-after': '5' },
					body: { message: 'SECRET-KEY-123 bad key' },
				}),
			).rejects.toMatchObject({ httpCode: String(statusCode) });
			try {
				await sanitizeGeoapifyResponse.call(ctx, [], {
					statusCode,
					headers: { 'retry-after': '5' },
					body: { message: 'SECRET-KEY-123 bad key' },
				});
			} catch (error) {
				expect(
					(error as Error).message + String((error as NodeApiError).description),
				).not.toContain('SECRET-KEY-123');
				expect(String((error as NodeApiError).description)).toContain(message);
			}
		}
		await expect(
			sanitizeGeoapifyResponse.call(ctx, [], {
				statusCode: 200,
				headers: {},
				body: { type: 'bad', features: [] },
			}),
		).rejects.toBeInstanceOf(NodeOperationError);
	});

	it('wraps native timeout/network failures without retaining raw request metadata or secrets', async () => {
		const ctx = context(
			{
				operation: 'forward',
				addressMode: 'freeform',
				address: 'Boston',
				options: { maxResults: 5 },
			},
			{
				makeRoutingRequest: async () => {
					throw Object.assign(
						new Error('timeout https://api.geoapify.com/v1/geocode?apiKey=SECRET-KEY-123'),
						{ config: { headers: { 'x-api-key': 'SECRET-KEY-123' } } },
					);
				},
			},
		);
		await expect(
			oneRequest.call(ctx as unknown as IExecutePaginationFunctions, {
				options: { url: '/geocode/search' },
				preSend: [],
				postReceive: [],
			}),
		).rejects.toMatchObject({ message: 'Geoapify request timed out.' });
		const continueContext = context(
			{
				operation: 'forward',
				addressMode: 'freeform',
				address: 'Boston',
				options: { maxResults: 5 },
			},
			{
				continueOnFail: () => true,
				makeRoutingRequest: async () => {
					throw Object.assign(
						new Error('ECONNABORTED timeout https://api.geoapify.com/?key=SECRET-KEY-123'),
						{ code: 'ECONNABORTED' },
					);
				},
			},
		);
		const continued = await oneRequest.call(
			continueContext as unknown as IExecutePaginationFunctions,
			{
				options: { url: 'https://api.geoapify.com/v1/geocode/search' },
				preSend: [],
				postReceive: [],
			},
		);
		expect(continued).toMatchObject([
			{ json: {}, pairedItem: { item: 2 }, error: { message: 'Geoapify request timed out.' } },
		]);
		expect(JSON.stringify(continued)).not.toContain('SECRET-KEY-123');
		try {
			await oneRequest.call(ctx as unknown as IExecutePaginationFunctions, {
				options: { url: '/geocode/search' },
				preSend: [],
				postReceive: [],
			});
		} catch (error) {
			expect(JSON.stringify(error)).not.toContain('SECRET-KEY-123');
			expect(JSON.stringify(error)).not.toContain('api.geoapify.com');
		}
		const native = new NodeApiError(
			context({}).getNode(),
			{ message: 'native request failed', code: 'ECONNABORTED' },
			{ message: 'Request failed', description: 'Request failed', httpCode: 'none' },
		);
		native.message = 'Geoapify request failed.';
		native.messages = [
			'connect ETIMEDOUT timed out at https://api.geoapify.com/?key=SECRET-KEY-123',
		];
		const nativeContext = context(
			{
				operation: 'forward',
				addressMode: 'freeform',
				address: 'Boston',
				options: { maxResults: 5 },
			},
			{
				makeRoutingRequest: async () => {
					throw native;
				},
			},
		);
		await expect(
			oneRequest.call(nativeContext as unknown as IExecutePaginationFunctions, {
				options: { url: 'https://api.geoapify.com/v1/geocode/search' },
				preSend: [],
				postReceive: [],
			}),
		).rejects.toMatchObject({
			message: 'Geoapify request timed out.',
			description: expect.stringContaining('timed out after 30 seconds'),
		});
	});
});

describe('n8n parameter normalization', () => {
	it('resolves the actual resource, operation, collection, and structured field shapes for both routes', () => {
		const description = new Geoapify().description;
		const forward = NodeHelpers.getNodeParameters(
			description.properties,
			{
				resource: 'geocoding',
				operation: 'forward',
				addressMode: 'structured',
				street: 'Main St',
				city: 'Boston',
				forwardOptions: { countryCodes: 'us' },
				options: { language: 'en', maxResults: 8, resultType: 'city' },
			},
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(forward).toMatchObject({
			addressMode: 'structured',
			street: 'Main St',
			city: 'Boston',
			forwardOptions: { countryCodes: 'us' },
			options: { language: 'en', maxResults: 8, resultType: 'city' },
		});
		const reverse = NodeHelpers.getNodeParameters(
			description.properties,
			{
				resource: 'geocoding',
				operation: 'reverse',
				latitude: 0,
				longitude: 0,
				options: { outputFormat: 'raw' },
			},
			true,
			false,
			{ typeVersion: 1 },
			description,
		);
		expect(reverse).toMatchObject({ latitude: 0, longitude: 0, options: { outputFormat: 'raw' } });
	});
});

describe('generated package identity', () => {
	it('registers only the Geoapify node and credential and ships no GitHub sample implementation', async () => {
		// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
		const { readFile } = await import('node:fs/promises');
		const packageJson = JSON.parse(
			await readFile(new URL('../package.json', import.meta.url), 'utf8'),
		) as {
			name: string;
			repository: { url: string };
			homepage: string;
			n8n: { nodes: string[]; credentials: string[] };
		};
		expect(packageJson.name).toBe('@blackswampai/n8n-nodes-geoapify');
		expect(packageJson.repository.url).toBe(
			'https://github.com/BlackSwampAI/n8n-nodes-geoapify.git',
		);
		expect(packageJson.homepage).toBe('https://blackswampai.com/n8n-nodes/geoapify/');
		expect(packageJson.n8n.nodes).toEqual(['dist/nodes/Geoapify/Geoapify.node.js']);
		expect(packageJson.n8n.credentials).toEqual(['dist/credentials/GeoapifyApi.credentials.js']);
		for (const path of [
			'../nodes/GithubIssues/GithubIssues.node.ts',
			'../credentials/GithubIssuesApi.credentials.ts',
			'./template.test.ts',
		]) {
			await expect(readFile(new URL(path, import.meta.url))).rejects.toThrow();
		}
	});
});
