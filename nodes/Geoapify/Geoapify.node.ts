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
import { PLACE_CATEGORIES, PLACE_CATEGORY_SET } from './place-categories';

const showForward = { resource: ['geocoding'], operation: ['forward'] };
const showReverse = { resource: ['geocoding'], operation: ['reverse'] };
const showSearch = { resource: ['places'], operation: ['search'] };
const showDetails = { resource: ['placeDetails'], operation: ['get'] };
const showRoute = { resource: ['routing'], operation: ['calculate'] };
const ROUTING_MODES = [
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
];
const geometryTypes = new Set([
	'Point',
	'LineString',
	'Polygon',
	'MultiPoint',
	'MultiLineString',
	'MultiPolygon',
	'GeometryCollection',
]);

function hasUnsafePlaceId(value: string): boolean {
	return (
		/[\s|,:/?#&]/.test(value) ||
		[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	);
}

function fail(this: IExecuteSingleFunctions, message: string): never {
	throw new NodeOperationError(this.getNode(), message);
}

export async function validateGeoapifyRequest(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const resource = this.getNodeParameter('resource', 'geocoding');
	if (!['geocoding', 'places', 'placeDetails', 'routing'].includes(String(resource)))
		throw new NodeOperationError(this.getNode(), 'Choose a supported Geoapify resource.');
	const operation = this.getNodeParameter('operation', 'forward');
	const outputFormat =
		resource === 'routing'
			? this.getNodeParameter('routeOptions.outputFormat', 'features')
			: resource === 'places'
				? this.getNodeParameter('searchOptions.outputFormat', 'features')
				: resource === 'geocoding'
					? this.getNodeParameter('options.outputFormat', 'features')
					: 'features';
	if (outputFormat !== 'features' && outputFormat !== 'raw')
		throw new NodeOperationError(
			this.getNode(),
			'Choose One Item per Match or Raw FeatureCollection output.',
		);
	const qs = (request.qs ?? {}) as Record<string, unknown>;
	if (resource === 'routing') {
		if (operation !== 'calculate') fail.call(this, 'Choose Calculate Route.');
		const waypointMode = this.getNodeParameter('waypointMode', 'fields');
		let entries: unknown[] | undefined;
		if (waypointMode === 'fields') {
			const rawWaypoints = this.getNodeParameter('waypoints');
			if (rawWaypoints && typeof rawWaypoints === 'object' && !Array.isArray(rawWaypoints)) {
				if (Object.keys(rawWaypoints).some((key) => key !== 'waypoint'))
					fail.call(this, 'Waypoints must contain only the ordered waypoint list.');
				entries = (rawWaypoints as Record<string, unknown>).waypoint as unknown[] | undefined;
			}
		} else if (waypointMode === 'json') {
			const rawWaypoints = this.getNodeParameter('waypointsJson', '[]');
			if (Array.isArray(rawWaypoints)) entries = rawWaypoints;
			else if (typeof rawWaypoints === 'string') {
				try {
					const parsed: unknown = JSON.parse(rawWaypoints);
					if (Array.isArray(parsed)) entries = parsed;
				} catch {
					fail.call(this, 'Waypoints JSON must be valid JSON containing an ordered array.');
				}
			}
		} else {
			fail.call(this, 'Choose Waypoint Fields or Waypoints JSON.');
		}
		if (!Array.isArray(entries) || entries.length < 2 || entries.length > 1000)
			fail.call(this, 'Provide between 2 and 1000 ordered route waypoints.');
		const waypointEntries = entries as unknown[];
		const encoded = waypointEntries.map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry))
				fail.call(this, 'Each waypoint must have Latitude and Longitude numbers.');
			const point = entry as Record<string, unknown>;
			if (
				Object.keys(point).length !== 2 ||
				Object.keys(point).some((key) => key !== 'latitude' && key !== 'longitude')
			)
				fail.call(this, 'Each waypoint must contain only Latitude and Longitude.');
			const lat = point.latitude,
				lon = point.longitude;
			if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90)
				fail.call(this, 'Waypoint Latitude must be a finite number from -90 to 90.');
			if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180)
				fail.call(this, 'Waypoint Longitude must be a finite number from -180 to 180.');
			return `${decimal(lat as number)},${decimal(lon as number)}`;
		});
		const mode = this.getNodeParameter('mode', 'drive');
		if (typeof mode !== 'string' || !ROUTING_MODES.includes(mode))
			fail.call(this, 'Choose a documented Geoapify travel mode.');
		qs.waypoints = encoded.join('|');
		qs.mode = mode;
		qs.units = 'metric';
		qs.format = 'geojson';
		request.qs = qs as IDataObject;
		request.headers = { ...(request.headers ?? {}), Accept: 'application/geo+json' };
		request.timeout = 30000;
		return request;
	}
	if (resource === 'places') return validatePlacesRequest.call(this, request);
	if (resource === 'placeDetails') {
		if (operation !== 'get') fail.call(this, 'Choose Get Place Details.');
		const id = this.getNodeParameter('placeId');
		if (
			typeof id !== 'string' ||
			id.trim().length < 3 ||
			id.trim().length > 2048 ||
			hasUnsafePlaceId(id)
		)
			fail.call(this, 'Place ID must contain 3 to 2048 characters.');
		qs.id = (id as string).trim();
		request.qs = qs as IDataObject;
		request.headers = { ...(request.headers ?? {}), Accept: 'application/json' };
		request.timeout = 30000;
		return request;
	}
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
		const allowedTypes =
			operation === 'forward'
				? ['street', 'postcode', 'city', 'state', 'country', 'amenity']
				: ['street', 'postcode', 'city', 'state', 'country'];
		if (!allowedTypes.includes(resultType))
			fail.call(
				this,
				operation === 'reverse' && resultType === 'amenity'
					? 'Choose a supported result type for Reverse Geocoding; Amenity / Place is available only for Forward Geocoding.'
					: operation === 'forward'
						? 'Choose a supported result type: street, postal code, city, state, country, or amenity/place.'
						: 'Choose a supported result type: street, postal code, city, state, or country.',
			);
		qs.type = resultType;
	}
	qs.format = 'geojson';
	request.qs = qs as IDataObject;
	request.headers = { ...(request.headers ?? {}), Accept: 'application/json' };
	request.timeout = 30000;
	return request;
}

function decimal(value: number): string {
	const text = String(value);
	if (!/[eE]/.test(text)) return text;
	const [coefficient, exponentText] = text.toLowerCase().split('e');
	const exponent = Number(exponentText);
	const sign = coefficient.startsWith('-') ? '-' : '';
	const unsigned = sign ? coefficient.slice(1) : coefficient;
	const [whole, fraction = ''] = unsigned.split('.');
	const digits = whole + fraction;
	const decimalPosition = whole.length + exponent;
	if (decimalPosition <= 0) return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`;
	if (decimalPosition >= digits.length)
		return `${sign}${digits}${'0'.repeat(decimalPosition - digits.length)}`;
	return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

function intParam(
	ctx: IExecuteSingleFunctions,
	name: string,
	fallback: number,
	min: number,
	max: number,
): number {
	const value = ctx.getNodeParameter(
		name.startsWith('searchOptions.') ? name : `searchOptions.${name}`,
		fallback,
	);
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
		throw new NodeOperationError(
			ctx.getNode(),
			`${name} must be an integer from ${min} to ${max}.`,
		);
	return value;
}

function placesCoord(ctx: IExecuteSingleFunctions, name: string, min: number, max: number): number {
	const value = ctx.getNodeParameter(name);
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		throw new NodeOperationError(
			ctx.getNode(),
			`${name} must be a finite number from ${min} to ${max}.`,
		);
	return value;
}

function validatePlacesRequest(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): IHttpRequestOptions {
	if (this.getNodeParameter('operation') !== 'search') fail.call(this, 'Choose Search Places.');
	const qs = (request.qs ?? {}) as Record<string, unknown>;
	const mode = this.getNodeParameter('categoryMode', 'catalog');
	if (mode !== 'catalog' && mode !== 'custom')
		fail.call(this, 'Choose catalog or custom category entry.');
	const raw: unknown =
		mode === 'custom'
			? this.getNodeParameter('customCategories')
			: this.getNodeParameter('categories');
	const categories = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
	const normalized = [...new Set(categories.map((v) => (typeof v === 'string' ? v.trim() : '')))];
	if (
		!normalized.length ||
		normalized.some((v) => !PLACE_CATEGORY_SET.has(v)) ||
		normalized.length > 100
	)
		fail.call(this, 'Select 1 to 100 valid Geoapify place categories.');
	qs.categories = normalized.join(',');
	const filterType = this.getNodeParameter('filterType', 'circle');
	if (filterType === 'circle') {
		const lat = placesCoord(this, 'filterLatitude', -90, 90),
			lon = placesCoord(this, 'filterLongitude', -180, 180);
		const radius = this.getNodeParameter('filterRadius');
		if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0)
			fail.call(this, 'Circle radius must be a positive finite number of meters.');
		qs.filter = `circle:${lon},${lat},${radius}`;
	} else if (filterType === 'rectangle') {
		const south = placesCoord(this, 'southLatitude', -90, 90),
			west = placesCoord(this, 'westLongitude', -180, 180);
		const north = placesCoord(this, 'northLatitude', -90, 90),
			east = placesCoord(this, 'eastLongitude', -180, 180);
		if (south >= north || west >= east)
			fail.call(
				this,
				'Rectangle requires south < north and west < east; dateline-spanning rectangles are not supported.',
			);
		qs.filter = `rect:${west},${south},${east},${north}`;
	} else if (filterType === 'place') {
		const id = this.getNodeParameter('filterPlaceId');
		if (
			typeof id !== 'string' ||
			id.trim().length < 2 ||
			id.trim().length > 2048 ||
			hasUnsafePlaceId(id)
		)
			fail.call(this, 'Place boundary ID must be a single place identifier.');
		qs.filter = `place:${(id as string).trim()}`;
	} else if (filterType !== 'none') fail.call(this, 'Choose a supported spatial filter.');
	const useBias = this.getNodeParameter('useProximityBias', false);
	if (useBias === true) {
		const lat = placesCoord(this, 'biasLatitude', -90, 90),
			lon = placesCoord(this, 'biasLongitude', -180, 180);
		qs.bias = `proximity:${lon},${lat}`;
	} else if (useBias !== false) fail.call(this, 'Proximity bias toggle must be boolean.');
	if (filterType === 'none' && !useBias)
		fail.call(this, 'Choose a spatial filter or enable proximity bias.');
	const pageSize = intParam(this, 'pageSize', 20, 1, 500);
	intParam(this, 'maxResults', 20, 1, 5000);
	intParam(this, 'maxRequests', 5, 1, 20);
	const offset = intParam(this, 'startOffset', 0, 0, 1000000);
	qs.limit = pageSize;
	qs.offset = offset;
	request.qs = qs as IDataObject;
	request.headers = { ...(request.headers ?? {}), Accept: 'application/json' };
	request.timeout = 30000;
	return request;
}

function isValidFeature(
	value: unknown,
	allowAnyGeometry = false,
): value is Record<string, unknown> {
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
	if (allowAnyGeometry) return isValidGeometry(g);
	if (g.type !== 'Point' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return false;
	return (
		typeof g.coordinates[0] === 'number' &&
		Number.isFinite(g.coordinates[0]) &&
		typeof g.coordinates[1] === 'number' &&
		Number.isFinite(g.coordinates[1])
	);
}

function isPosition(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
	);
}

function isValidGeometry(value: Record<string, unknown>): boolean {
	const type = value.type;
	if (type === 'GeometryCollection')
		return (
			Array.isArray(value.geometries) &&
			value.geometries.every(
				(geometry) =>
					!!geometry &&
					typeof geometry === 'object' &&
					!Array.isArray(geometry) &&
					isValidGeometry(geometry as Record<string, unknown>),
			)
		);
	if (!geometryTypes.has(String(type)) || type === 'GeometryCollection') return false;
	const coordinates = value.coordinates;
	switch (type) {
		case 'Point':
			return isPosition(coordinates);
		case 'MultiPoint':
			return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isPosition);
		case 'LineString':
			return Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(isPosition);
		case 'MultiLineString':
			return (
				Array.isArray(coordinates) &&
				coordinates.length > 0 &&
				coordinates.every(
					(line) => Array.isArray(line) && line.length >= 2 && line.every(isPosition),
				)
			);
		case 'Polygon':
			return (
				Array.isArray(coordinates) &&
				coordinates.length > 0 &&
				coordinates.every(
					(ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition),
				)
			);
		case 'MultiPolygon':
			return (
				Array.isArray(coordinates) &&
				coordinates.length > 0 &&
				coordinates.every(
					(polygon) =>
						Array.isArray(polygon) &&
						polygon.length > 0 &&
						polygon.every(
							(ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition),
						),
				)
			);
		default:
			return false;
	}
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
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
		/^(Forward geocoding|Structured address|Latitude|Longitude|Result limit|Language|Result type|Country codes|Country filter|Choose |Select |Circle |Rectangle |Place ID|Place boundary ID|Boundary Place ID|filterLatitude |filterLongitude |southLatitude |westLongitude |northLatitude |eastLongitude |biasLatitude |biasLongitude |Proximity bias toggle|pageSize |maxResults |maxRequests |startOffset |Provide between |Each waypoint |Waypoint |Waypoints |Geoapify returned )/.test(
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
	const resource = this.getNodeParameter('resource', 'geocoding');
	if (
		!body ||
		body.type !== 'FeatureCollection' ||
		!Array.isArray(body.features) ||
		(resource === 'routing' && !isValidRoutingCollectionProperties(body.properties)) ||
		body.features.some(
			(feature) =>
				!isValidFeature(feature, resource !== 'geocoding') ||
				(resource === 'routing' && !isValidRouteFeature(feature)),
		)
	) {
		throw new NodeOperationError(
			this.getNode(),
			'Geoapify returned an unexpected response. Expected a GeoJSON FeatureCollection.',
		);
	}
	const pairedItem = { item: this.getItemIndex() };
	if (resource === 'routing') {
		if (this.getNodeParameter('routeOptions.outputFormat', 'features') === 'raw')
			return [{ json: JSON.parse(JSON.stringify(body)) as IDataObject, pairedItem }];
		return body.features.map((feature: unknown) => ({
			json: {
				...(JSON.parse(JSON.stringify(feature)) as Record<string, unknown>),
				_geoapifyUnits: { distance: 'meters', duration: 'seconds' },
			} as IDataObject,
			pairedItem,
		}));
	}
	if (
		this.getNodeParameter('resource', 'geocoding') === 'placeDetails' ||
		this.getNodeParameter(
			this.getNodeParameter('resource', 'geocoding') === 'places'
				? 'searchOptions.outputFormat'
				: 'options.outputFormat',
			'features',
		) === 'raw'
	) {
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
				...(record.id === undefined ? {} : { id: record.id }),
				geometry: record.geometry ?? null,
			} as IDataObject,
			pairedItem,
		};
	});
}

function isValidRouteFeature(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const feature = value as Record<string, unknown>;
	if (feature.type !== 'Feature' || !feature.geometry || typeof feature.geometry !== 'object')
		return false;
	const geometry = feature.geometry as Record<string, unknown>;
	if (
		geometry.type !== 'MultiLineString' ||
		!Array.isArray(geometry.coordinates) ||
		!geometry.coordinates.every(
			(line) => Array.isArray(line) && line.length >= 2 && line.every(isPosition),
		)
	)
		return false;
	const props = feature.properties;
	if (!props || typeof props !== 'object' || Array.isArray(props)) return false;
	const route = props as Record<string, unknown>;
	const validLegs =
		Array.isArray(route.legs) &&
		route.legs.every((leg) => {
			if (!leg || typeof leg !== 'object' || Array.isArray(leg)) return false;
			const item = leg as Record<string, unknown>;
			return (
				typeof item.distance === 'number' &&
				Number.isFinite(item.distance) &&
				typeof item.time === 'number' &&
				Number.isFinite(item.time) &&
				Array.isArray(item.steps) &&
				item.steps.every((step) => {
					if (!step || typeof step !== 'object' || Array.isArray(step)) return false;
					const s = step as Record<string, unknown>;
					return (
						Number.isInteger(s.from_index) &&
						Number.isInteger(s.to_index) &&
						typeof s.distance === 'number' &&
						Number.isFinite(s.distance) &&
						typeof s.time === 'number' &&
						Number.isFinite(s.time)
					);
				})
			);
		});
	return (
		ROUTING_MODES.includes(String(route.mode)) &&
		route.units === 'metric' &&
		(route.distance_units === undefined || route.distance_units === 'meters') &&
		typeof route.distance === 'number' &&
		Number.isFinite(route.distance) &&
		typeof route.time === 'number' &&
		Number.isFinite(route.time) &&
		validLegs &&
		Array.isArray(route.waypoints) &&
		route.waypoints.length > 0
	);
}

function isValidRoutingCollectionProperties(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const properties = value as Record<string, unknown>;
	return (
		ROUTING_MODES.includes(String(properties.mode)) &&
		properties.units === 'metric' &&
		Array.isArray(properties.waypoints)
	);
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
		if (this.getNodeParameter('resource', 'geocoding') !== 'places')
			return await this.makeRoutingRequest(requestOptions);
		const opts = requestOptions.options as IHttpRequestOptions;
		const qs = opts.qs as Record<string, unknown>;
		const pageSize = Number(qs.limit),
			maxResults = intParam(this, 'maxResults', 20, 1, 5000);
		const maxRequests = intParam(this, 'maxRequests', 5, 1, 20);
		const baseOffset = Number(qs.offset ?? 0);
		const outputRaw = this.getNodeParameter('searchOptions.outputFormat', 'features') === 'raw';
		const all: INodeExecutionData[] = [];
		const seen = new Set<string>();
		let rawCollection: Record<string, unknown> | undefined;
		let requested = 0,
			stopReason = 'maxRequests';
		let nextOffset = baseOffset;
		while (requested < maxRequests && all.length < maxResults) {
			const requestLimit = Math.min(pageSize, maxResults - all.length);
			if (nextOffset > 1000000) {
				stopReason = 'offsetLimit';
				break;
			}
			qs.offset = nextOffset;
			qs.limit = requestLimit;
			const page = await this.makeRoutingRequest(requestOptions);
			requested++;
			if (outputRaw && !rawCollection)
				rawCollection = page[0]?.json as Record<string, unknown> | undefined;
			const pageFeatures = outputRaw
				? (((page[0]?.json as Record<string, unknown> | undefined)?.features as unknown[]) ?? [])
				: page;
			let added = 0;
			for (const feature of pageFeatures) {
				const json =
					feature && typeof feature === 'object' && 'json' in feature
						? (feature as INodeExecutionData).json
						: (feature as Record<string, unknown>);
				const id = outputRaw
					? String(
							(
								(feature as Record<string, unknown>).properties as
									| Record<string, unknown>
									| undefined
							)?.place_id ??
								(feature as Record<string, unknown>).id ??
								canonicalJson(feature),
						)
					: String(json.place_id ?? json.id ?? canonicalJson(json));
				if (seen.has(id)) continue;
				seen.add(id);
				added++;
				if (outputRaw)
					all.push({ json: feature as IDataObject, pairedItem: { item: this.getItemIndex() } });
				else all.push(feature as INodeExecutionData);
				if (all.length >= maxResults) break;
			}
			if (all.length >= maxResults) {
				stopReason = 'maxResults';
				break;
			}
			if (pageFeatures.length < requestLimit || pageFeatures.length === 0) {
				stopReason = 'shortPage';
				break;
			}
			if (added === 0) {
				stopReason = 'repeatedPage';
				break;
			}
			nextOffset += requestLimit;
		}
		if (outputRaw) {
			const features = all.map((item) => item.json);
			return [
				{
					json: {
						...(rawCollection ?? { type: 'FeatureCollection' }),
						features,
						_geoapifyPagination: { requests: requested, returned: features.length, stopReason },
					} as IDataObject,
					pairedItem: { item: this.getItemIndex() },
				},
			];
		}
		return all;
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
		url: "={{$parameter.resource === 'routing' ? 'https://api.geoapify.com/v1/routing' : $parameter.resource === 'places' ? 'https://api.geoapify.com/v2/places' : $parameter.resource === 'placeDetails' ? 'https://api.geoapify.com/v2/place-details' : $parameter.operation === 'forward' ? 'https://api.geoapify.com/v1/geocode/search' : 'https://api.geoapify.com/v1/geocode/reverse'}}",
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
		options: [
			{ name: 'Geocoding', value: 'geocoding' },
			{ name: 'Place', value: 'places' },
			{ name: 'Place Detail', value: 'placeDetails' },
			{ name: 'Routing', value: 'routing' },
		],
		default: 'geocoding',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['geocoding'] } },
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
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['places'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search for places in a spatial area',
				routing: route,
			},
		],
		default: 'search',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['placeDetails'] } },
		options: [
			{ name: 'Get', value: 'get', action: 'Get details for a place identifier', routing: route },
		],
		default: 'get',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['routing'] } },
		options: [
			{
				name: 'Calculate',
				value: 'calculate',
				action: 'Calculate a route through ordered waypoints',
				routing: route,
			},
		],
		default: 'calculate',
	},
	{
		displayName: 'Waypoint Entry',
		name: 'waypointMode',
		type: 'options',
		noDataExpression: true,
		default: 'fields',
		required: true,
		displayOptions: { show: showRoute },
		options: [
			{ name: 'Latitude And Longitude Fields', value: 'fields' },
			{ name: 'JSON Or Expression', value: 'json' },
		],
		description:
			'Choose repeatable labeled fields or an ordered JSON array, including an array-valued expression',
	},
	{
		displayName: 'Waypoints',
		name: 'waypoints',
		type: 'fixedCollection',
		placeholder: 'Add Waypoint',
		required: true,
		default: { waypoint: [] },
		typeOptions: { multipleValues: true },
		displayOptions: { show: { ...showRoute, waypointMode: ['fields'] } },
		options: [
			{
				displayName: 'Waypoint',
				name: 'waypoint',
				values: [
					{
						displayName: 'Latitude',
						name: 'latitude',
						type: 'number',
						default: 0,
						required: true,
						typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
						description: 'Latitude in decimal degrees (-90 to 90)',
					},
					{
						displayName: 'Longitude',
						name: 'longitude',
						type: 'number',
						default: 0,
						required: true,
						typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
						description: 'Longitude in decimal degrees (-180 to 180)',
					},
				],
			},
		],
		description: 'Add at least two waypoints in travel order. The API supports up to 1000.',
	},
	{
		displayName: 'Waypoints JSON',
		name: 'waypointsJson',
		type: 'json',
		default: '[]',
		required: true,
		displayOptions: { show: { ...showRoute, waypointMode: ['json'] } },
		description:
			'Ordered JSON array of {"latitude": number, "longitude": number} objects; accepts an array-valued expression',
	},
	{
		displayName: 'Travel Mode',
		name: 'mode',
		type: 'options',
		default: 'drive',
		required: true,
		displayOptions: { show: showRoute },
		options: ROUTING_MODES.map((value) => ({
			name: value
				.replace(
					/(^|_)([a-z])/g,
					(_match, _separator, letter: string) => ` ${letter.toUpperCase()}`,
				)
				.trim(),
			value,
		})),
		description: 'Geoapify routing travel profile',
	},
	{
		displayName: 'Route Options',
		name: 'routeOptions',
		type: 'collection',
		placeholder: 'Add Route Option',
		default: {},
		displayOptions: { show: showRoute },
		options: [
			{
				displayName: 'Output',
				name: 'outputFormat',
				type: 'options',
				default: 'features',
				description:
					'Geoapify returns distance in meters and travel time in seconds. One item per route retains each complete GeoJSON Feature.',
				options: [
					{ name: 'One Item per Route', value: 'features' },
					{ name: 'Raw FeatureCollection', value: 'raw' },
				],
			},
		],
	},
	{
		displayName: 'Category Entry',
		name: 'categoryMode',
		type: 'options',
		default: 'catalog',
		displayOptions: { show: showSearch },
		options: [
			{ name: 'Search Catalog', value: 'catalog' },
			{ name: 'Custom Values', value: 'custom' },
		],
	},
	{
		displayName: 'Categories',
		name: 'categories',
		type: 'multiOptions',
		required: true,
		default: ['commercial'],
		options: PLACE_CATEGORIES.map((name) => ({ name, value: name })),
		description:
			'Geoapify category catalog from the pinned OpenAPI PlaceCategory enum. Categories are searchable; expressions may provide an array of category keys.',
		displayOptions: { show: { ...showSearch, categoryMode: ['catalog'] } },
	},
	{
		displayName: 'Categories',
		name: 'customCategories',
		type: 'string',
		default: '',
		required: true,
		description:
			'Comma-separated Geoapify category keys. Supports expressions; values are checked against the bundled catalog.',
		displayOptions: { show: { ...showSearch, categoryMode: ['custom'] } },
	},
	{
		displayName: 'Spatial Filter',
		name: 'filterType',
		type: 'options',
		default: 'circle',
		description:
			'A spatial filter restricts matches. Choose None only when proximity bias is enabled.',
		displayOptions: { show: showSearch },
		options: [
			{ name: 'Circle', value: 'circle' },
			{ name: 'Rectangle', value: 'rectangle' },
			{ name: 'Place Boundary', value: 'place' },
			{ name: 'None', value: 'none' },
		],
	},
	{
		displayName: 'Filter Latitude',
		name: 'filterLatitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['circle'] } },
	},
	{
		displayName: 'Filter Longitude',
		name: 'filterLongitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['circle'] } },
	},
	{
		displayName: 'Radius (Meters)',
		name: 'filterRadius',
		type: 'number',
		default: 1000,
		typeOptions: { minValue: 0 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['circle'] } },
	},
	{
		displayName: 'South Latitude',
		name: 'southLatitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['rectangle'] } },
	},
	{
		displayName: 'West Longitude',
		name: 'westLongitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['rectangle'] } },
	},
	{
		displayName: 'North Latitude',
		name: 'northLatitude',
		type: 'number',
		default: 1,
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['rectangle'] } },
	},
	{
		displayName: 'East Longitude',
		name: 'eastLongitude',
		type: 'number',
		default: 1,
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['rectangle'] } },
	},
	{
		displayName: 'Boundary Place ID',
		name: 'filterPlaceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { ...showSearch, filterType: ['place'] } },
	},
	{
		displayName: 'Use Proximity Bias',
		name: 'useProximityBias',
		type: 'boolean',
		default: false,
		description:
			'Whether to rank places near these coordinates first. This does not restrict matching places.',
		displayOptions: { show: showSearch },
	},
	{
		displayName: 'Bias Latitude',
		name: 'biasLatitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -90, maxValue: 90, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, useProximityBias: [true] } },
	},
	{
		displayName: 'Bias Longitude',
		name: 'biasLongitude',
		type: 'number',
		default: 0,
		typeOptions: { minValue: -180, maxValue: 180, numberPrecision: 7 },
		required: true,
		displayOptions: { show: { ...showSearch, useProximityBias: [true] } },
	},
	{
		displayName: 'Place ID',
		name: 'placeId',
		type: 'string',
		default: '',
		required: true,
		description: 'Geoapify place identifier',
		displayOptions: { show: showDetails },
	},
	{
		displayName: 'Search Options',
		name: 'searchOptions',
		type: 'collection',
		placeholder: 'Add Search Option',
		default: {},
		displayOptions: { show: showSearch },
		options: [
			{
				displayName: 'Maximum Requests',
				name: 'maxRequests',
				type: 'number',
				default: 5,
				typeOptions: { minValue: 1, maxValue: 20 },
				description: 'Stops after this many page requests; the returned result set may be partial',
			},
			{
				displayName: 'Maximum Results',
				name: 'maxResults',
				type: 'number',
				default: 20,
				typeOptions: { minValue: 1, maxValue: 5000 },
				description:
					'Stops after at most this many unique matches. Together with Page Size and Maximum Requests this bounds retrieval.',
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
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'number',
				default: 20,
				typeOptions: { minValue: 1, maxValue: 500 },
			},
			{
				displayName: 'Start Offset',
				name: 'startOffset',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 1000000 },
				description:
					'Starting Geoapify offset. Subsequent offsets advance by each requested page size.',
			},
		],
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
		displayOptions: { show: showForward },
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
					{ name: 'Amenity / Place', value: 'amenity' },
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
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showReverse },
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
		description:
			'Geocode locations, search categorized places, and retrieve place details with Geoapify.',
		defaults: { name: 'Geoapify' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'geoapifyApi', required: true }],
		properties,
	};
}
