import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IExecutePaginationFunctions,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeExecutionData,
	type IDataObject,
	DeclarativeRestApiSettings,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type IN8nHttpFullResponse,
} from 'n8n-workflow';

const showForward = { resource: ['geocoding'], operation: ['forward'] };
const showReverse = { resource: ['geocoding'], operation: ['reverse'] };

function fail(this: IExecuteSingleFunctions, message: string): never {
	throw new NodeOperationError(this.getNode(), message);
}

export async function validateGeoapifyRequest(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const resource = this.getNodeParameter('resource', 'geocoding');
	if (resource !== 'geocoding')
		throw new NodeOperationError(this.getNode(), 'Choose the Geocoding resource.');
	const operation = this.getNodeParameter('operation', 'forward');
	const outputFormat = this.getNodeParameter('options.outputFormat', 'features');
	if (outputFormat !== 'features' && outputFormat !== 'raw')
		throw new NodeOperationError(
			this.getNode(),
			'Choose One Item per Match or Raw FeatureCollection output.',
		);
	const qs = (request.qs ?? {}) as Record<string, unknown>;
	if (operation !== 'forward' && operation !== 'reverse') {
		throw new NodeOperationError(this.getNode(), 'Choose Forward Geocoding or Reverse Geocoding.');
	}
	if (operation === 'forward') {
		const addressMode = this.getNodeParameter('addressMode', 'freeform');
		if (addressMode !== 'freeform' && addressMode !== 'structured')
			throw new NodeOperationError(this.getNode(), 'Choose Free-form or Structured address input.');
		if (addressMode === 'freeform') {
			const address = this.getNodeParameter('address');
			if (typeof address !== 'string' || !address.trim())
				throw new NodeOperationError(
					this.getNode(),
					'Forward geocoding requires a non-empty address.',
				);
			qs.text = address.trim();
		} else {
			const fields = ['name', 'street', 'housenumber', 'postcode', 'city', 'state', 'country'];
			const values: Record<string, string> = {};
			for (const name of fields) {
				const value = this.getNodeParameter(name, '');
				if (typeof value !== 'string')
					throw new NodeOperationError(
						this.getNode(),
						`Structured address field ${name} must be text.`,
					);
				if (value.trim()) values[name] = value.trim();
			}
			if (
				!['name', 'street', 'postcode', 'city', 'state', 'country'].some((name) => values[name])
			) {
				fail.call(
					this,
					'Structured address requires at least one of name, street, postal code, city, state, or country.',
				);
			}
			Object.assign(qs, values);
		}
		const countries = this.getNodeParameter('forwardOptions.countryCodes', '');
		if (typeof countries !== 'string')
			throw new NodeOperationError(
				this.getNode(),
				'Country codes must be a comma-separated list of ISO alpha-2 codes.',
			);
		if (countries.trim()) {
			const codes = countries.split(',').map((code) => code.trim());
			if (codes.length > 10) fail.call(this, 'Country filter supports at most 10 country codes.');
			if (codes.some((code) => !/^[a-z]{2}$/i.test(code)))
				fail.call(this, 'Country codes must be comma-separated ISO alpha-2 codes, such as us,ca.');
			qs.filter = `countrycode:${codes.map((code) => code.toLowerCase()).join(',')}`;
		}
	} else {
		const lat = coordinate(this, 'latitude', -90, 90);
		const lon = coordinate(this, 'longitude', -180, 180);
		qs.lat = lat;
		qs.lon = lon;
	}
	const limitValue = this.getNodeParameter('options.maxResults', 5);
	if (
		typeof limitValue !== 'number' ||
		!Number.isInteger(limitValue) ||
		limitValue < 1 ||
		limitValue > 100
	) {
		fail.call(this, 'Result limit must be an integer from 1 to 100.');
	}
	qs.limit = limitValue;
	const language = this.getNodeParameter('options.language', '');
	if (typeof language !== 'string')
		throw new NodeOperationError(this.getNode(), 'Language must be text.');
	if (language.trim()) {
		if (!/^[a-z]{2}$/i.test(language.trim()))
			fail.call(
				this,
				'Language must be a language code, as a two-letter ISO 639-1 code, such as en.',
			);
		qs.lang = language.trim();
	}
	const resultType = this.getNodeParameter('options.resultType', '');
	if (typeof resultType !== 'string')
		throw new NodeOperationError(this.getNode(), 'Result type must be text.');
	if (resultType) {
		const allowedTypes = ['street', 'postcode', 'city', 'state', 'country'];
		if (!allowedTypes.includes(resultType))
			fail.call(
				this,
				'Choose a supported result type: street, postal code, city, state, or country.',
			);
		qs.type = resultType;
	}
	qs.format = 'geojson';
	request.qs = qs as IDataObject;
	request.headers = { ...(request.headers ?? {}), Accept: 'application/json' };
	request.timeout = 30000;
	return request;
}

function isValidFeature(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const feature = value as Record<string, unknown>;
	if (
		feature.type !== 'Feature' ||
		!feature.properties ||
		typeof feature.properties !== 'object' ||
		Array.isArray(feature.properties)
	)
		return false;
	const geometry = feature.geometry;
	if (geometry === null) return true;
	if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return false;
	const g = geometry as Record<string, unknown>;
	if (g.type !== 'Point' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return false;
	return (
		typeof g.coordinates[0] === 'number' &&
		Number.isFinite(g.coordinates[0]) &&
		typeof g.coordinates[1] === 'number' &&
		Number.isFinite(g.coordinates[1])
	);
}

function coordinate(
	thisArg: IExecuteSingleFunctions,
	name: string,
	min: number,
	max: number,
): number {
	const value = thisArg.getNodeParameter(name);
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		throw new NodeOperationError(
			thisArg.getNode(),
			`${name === 'latitude' ? 'Latitude' : 'Longitude'} must be a finite number between ${min} and ${max}.`,
		);
	}
	return value;
}

function scrub(message: string, secret = ''): string {
	let output = message;
	if (secret) output = output.split(secret).join('[redacted]');
	return output
		.replace(/([?&](?:apiKey|apikey|key|x-api-key)=)[^&\s]+/gi, '$1[redacted]')
		.replace(/(x-api-key\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
		.replace(/https?:\/\/[^\s"']+/gi, '[Geoapify URL redacted]')
		.slice(0, 1000);
}

function validRetryAfter(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	if (/^\d{1,6}$/.test(value)) return true;
	return (
		/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
			value,
		) && Number.isFinite(Date.parse(value))
	);
}

function safeError(thisArg: IExecuteSingleFunctions, error: unknown, secret: string): NodeApiError {
	const e = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
	const response =
		e.response && typeof e.response === 'object' ? (e.response as Record<string, unknown>) : {};
	const status = Number(e.statusCode ?? e.httpCode ?? response.status);
	const httpCode =
		Number.isInteger(status) && status >= 400 && status <= 599 ? String(status) : undefined;
	const retryRaw =
		(e.headers as Record<string, unknown> | undefined)?.['retry-after'] ??
		(response.headers as Record<string, unknown> | undefined)?.['retry-after'];
	const retryAfter = validRetryAfter(retryRaw) ? ` Retry-After: ${retryRaw}.` : '';
	const errorResponse =
		e.errorResponse && typeof e.errorResponse === 'object'
			? (e.errorResponse as Record<string, unknown>)
			: {};
	const cause =
		e.cause && typeof e.cause === 'object' ? (e.cause as Record<string, unknown>) : errorResponse;
	const responseData =
		response.data && typeof response.data === 'object'
			? (response.data as Record<string, unknown>)
			: errorResponse;
	const serviceDetail =
		typeof responseData.message === 'string'
			? scrub(responseData.message, secret)
			: typeof responseData.error === 'string'
				? scrub(responseData.error, secret)
				: '';
	const rawMessage = typeof e.message === 'string' ? e.message : 'Request could not be completed.';
	const causeCode = typeof cause.code === 'string' ? cause.code : '';
	const causeMessage = typeof cause.message === 'string' ? cause.message : '';
	const errorCode = typeof e.code === 'string' ? e.code : '';
	const errorDescription = typeof e.description === 'string' ? e.description : '';
	const nativeMessages = Array.isArray(e.messages)
		? e.messages.filter((message): message is string => typeof message === 'string').join(' ')
		: typeof e.messages === 'string'
			? e.messages
			: '';
	const timeoutError = /timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(
		`${rawMessage} ${causeCode} ${causeMessage} ${errorCode} ${errorDescription} ${nativeMessages}`,
	);
	const localMessage = error instanceof NodeOperationError ? scrub(error.message, secret) : '';
	const safeLocalMessage =
		/^(Forward geocoding|Structured address|Latitude|Longitude|Result limit|Language|Result type|Country codes|Country filter|Choose |Geoapify returned )/.test(
			localMessage,
		);
	const description =
		httpCode === '401' || httpCode === '403'
			? 'Check that the Geoapify API key is valid and allowed for this endpoint.'
			: httpCode === '429'
				? `Geoapify rate or quota limit reached.${retryAfter} ${serviceDetail}`
				: httpCode && Number(status) >= 500
					? `Geoapify reported a service error${serviceDetail ? `: ${serviceDetail}` : '. Retry later if appropriate.'}`
					: serviceDetail
						? `Geoapify response: ${serviceDetail}`
						: timeoutError
							? 'The Geoapify request timed out after 30 seconds.'
							: 'Check the request fields and Geoapify service status.';
	const knownMessage =
		error instanceof NodeApiError || error instanceof NodeOperationError
			? scrub(error.message, secret)
			: '';
	const knownDescription =
		error instanceof NodeApiError ? scrub(error.description ?? '', secret) : '';
	const message =
		safeLocalMessage && !httpCode
			? localMessage
			: httpCode
				? `Geoapify request failed (${httpCode}).`
				: timeoutError
					? 'Geoapify request timed out.'
					: knownMessage.startsWith('Geoapify returned ')
						? knownMessage
						: 'Geoapify request failed.';
	const safeDescription =
		safeLocalMessage && !httpCode
			? localMessage
			: timeoutError && !httpCode
				? 'The Geoapify request timed out after 30 seconds.'
				: knownDescription.startsWith('Geoapify') || knownDescription.startsWith('Check ')
					? knownDescription
					: description;
	return new NodeApiError(
		thisArg.getNode(),
		{ message, description: safeDescription },
		{ message, description: safeDescription, httpCode },
	);
}

export async function sanitizeGeoapifyResponse(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const credentials = await this.getCredentials('geoapifyApi');
	const secret = typeof credentials.apiKey === 'string' ? credentials.apiKey : '';
	const status = response.statusCode;
	if (status < 200 || status >= 300) {
		const body =
			response.body && typeof response.body === 'object'
				? (response.body as Record<string, unknown>)
				: {};
		const detail =
			typeof body.message === 'string' ? scrub(body.message, secret) : `HTTP ${status}`;
		const retry = response.headers?.['retry-after'];
		const retryText = validRetryAfter(retry) ? ` Retry-After: ${retry}.` : '';
		const explanation =
			status === 401 || status === 403
				? 'Check that the API key is valid and enabled for this endpoint.'
				: status === 429
					? `Geoapify rate or quota limit was reached.${retryText} ${detail}`
					: status >= 500
						? `Geoapify service error: ${detail}`
						: `Geoapify response: ${detail}`;
		throw new NodeApiError(
			this.getNode(),
			{ message: explanation },
			{
				message: `Geoapify request failed (${status}).`,
				description: explanation,
				httpCode: String(status),
			},
		);
	}
	const body = response.body as Record<string, unknown> | undefined;
	if (
		!body ||
		body.type !== 'FeatureCollection' ||
		!Array.isArray(body.features) ||
		body.features.some((feature) => !isValidFeature(feature))
	) {
		throw new NodeOperationError(
			this.getNode(),
			'Geoapify returned an unexpected response. Expected a GeoJSON FeatureCollection.',
		);
	}
	const pairedItem = { item: this.getItemIndex() };
	if (this.getNodeParameter('options.outputFormat', 'features') === 'raw') {
		return [{ json: JSON.parse(JSON.stringify(body)) as IDataObject, pairedItem }];
	}
	return body.features.map((feature: unknown) => {
		if (!feature || typeof feature !== 'object')
			throw new NodeOperationError(this.getNode(), 'Geoapify returned a malformed feature.');
		const record = feature as Record<string, unknown>;
		if (!record.properties || typeof record.properties !== 'object')
			throw new NodeOperationError(
				this.getNode(),
				'Geoapify returned a feature without properties.',
			);
		return {
			json: {
				...(record.properties as Record<string, unknown>),
				geometry: record.geometry ?? null,
			} as IDataObject,
			pairedItem,
		};
	});
}

export async function oneRequest(
	this: IExecutePaginationFunctions,
	requestOptions: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	try {
		requestOptions.options = await validateGeoapifyRequest.call(
			this,
			requestOptions.options as IHttpRequestOptions,
		);
		return await this.makeRoutingRequest(requestOptions);
	} catch (error) {
		const credentials = await this.getCredentials('geoapifyApi');
		const secret = typeof credentials.apiKey === 'string' ? credentials.apiKey : '';
		const safe = safeError(this, error, secret);
		if (this.continueOnFail())
			return [{ json: {}, error: safe, pairedItem: { item: this.getItemIndex() } }];
		throw safe;
	}
}

const route = {
	request: {
		method: 'GET' as const,
		url: "={{$parameter.operation === 'forward' ? 'https://api.geoapify.com/v1/geocode/search' : 'https://api.geoapify.com/v1/geocode/reverse'}}",
		ignoreHttpStatusErrors: true,
	},
	send: { paginate: true },
	operations: { pagination: oneRequest },
	output: { postReceive: [sanitizeGeoapifyResponse] },
};

const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [{ name: 'Geocoding', value: 'geocoding' }],
		default: 'geocoding',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Forward Geocoding',
				value: 'forward',
				action: 'Find coordinates and address details from an address',
				routing: route,
			},
			{
				name: 'Reverse Geocoding',
				value: 'reverse',
				action: 'Find an address near geographic coordinates',
				routing: route,
			},
		],
		default: 'forward',
	},
	{
		displayName: 'Address Input',
		name: 'addressMode',
		type: 'options',
		options: [
			{ name: 'Free-Form', value: 'freeform' },
			{ name: 'Structured', value: 'structured' },
		],
		default: 'freeform',
		displayOptions: { show: showForward },
	},
	{
		displayName: 'Address',
		name: 'address',
		type: 'string',
		default: '',
		required: true,
		description: 'A free-form address or place name to geocode',
		displayOptions: { show: { ...showForward, addressMode: ['freeform'] } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'Place or building name for structured geocoding',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'Street',
		name: 'street',
		type: 'string',
		default: '',
		description: 'Street name',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'House Number',
		name: 'housenumber',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'Postal Code',
		name: 'postcode',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'State / Region',
		name: 'state',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'Country',
		name: 'country',
		type: 'string',
		default: '',
		displayOptions: { show: { ...showForward, addressMode: ['structured'] } },
	},
	{
		displayName: 'Latitude',
		name: 'latitude',
		type: 'number',
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
		default: 0,
		required: true,
		description: 'Latitude in decimal degrees (-90 to 90)',
		displayOptions: { show: showReverse },
	},
	{
		displayName: 'Longitude',
		name: 'longitude',
		type: 'number',
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
		default: 0,
		required: true,
		description: 'Longitude in decimal degrees (-180 to 180)',
		displayOptions: { show: showReverse },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				description: 'Preferred result language as a two-letter ISO 639-1 code, such as en',
			},
			{
				displayName: 'Output',
				name: 'outputFormat',
				type: 'options',
				default: 'features',
				options: [
					{ name: 'One Item per Match', value: 'features' },
					{ name: 'Raw FeatureCollection', value: 'raw' },
				],
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				default: 5,
				typeOptions: { minValue: 1, maxValue: 100 },
				description: 'Maximum number of matches to return, from 1 to 100',
			},
			{
				displayName: 'Result Type',
				name: 'resultType',
				type: 'options',
				default: '',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'City', value: 'city' },
					{ name: 'Country', value: 'country' },
					{ name: 'Postal Code', value: 'postcode' },
					{ name: 'State', value: 'state' },
					{ name: 'Street', value: 'street' },
				],
			},
		],
	},
	{
		displayName: 'Forward Options',
		name: 'forwardOptions',
		type: 'collection',
		placeholder: 'Add Forward Option',
		default: {},
		displayOptions: { show: showForward },
		options: [
			{
				displayName: 'Country Codes',
				name: 'countryCodes',
				type: 'string',
				default: '',
				description:
					'Comma-separated ISO 3166-1 alpha-2 country codes, such as us,ca. This restricts results; it is not a proximity bias.',
			},
		],
	},
];

export class Geoapify implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Geoapify',
		name: 'geoapify',
		icon: { light: 'file:../../icons/location.svg', dark: 'file:../../icons/location.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter.operation}}',
		description: 'Geocode addresses and coordinates with Geoapify.',
		defaults: { name: 'Geoapify' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'geoapifyApi', required: true }],
		properties,
	};
}
