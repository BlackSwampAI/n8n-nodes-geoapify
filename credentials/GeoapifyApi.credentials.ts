import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GeoapifyApi implements ICredentialType {
	name = 'geoapifyApi';
	displayName = 'Geoapify API';
	icon: Icon = { light: 'file:../icons/location.svg', dark: 'file:../icons/location.dark.svg' };
	documentationUrl = 'https://apidocs.geoapify.com/docs/';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'x-api-key': '={{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.geoapify.com/v1',
			url: '/geocode/search',
			method: 'GET',
			timeout: 30000,
			qs: { text: 'Berlin', limit: 1, format: 'geojson' },
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message: 'Geoapify rejected the API key. Check that it is correct and active.',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message: 'Geoapify denied this request. Check the API key restrictions and plan access.',
				},
			},
			{
				type: 'responseCode',
				properties: { value: 429, message: 'Geoapify rate or quota limit reached.' },
			},
			{
				type: 'responseCode',
				properties: { value: 500, message: 'Geoapify service error. Try again later.' },
			},
			{
				type: 'responseCode',
				properties: { value: 502, message: 'Geoapify service error. Try again later.' },
			},
			{
				type: 'responseCode',
				properties: { value: 503, message: 'Geoapify service error. Try again later.' },
			},
			{
				type: 'responseCode',
				properties: { value: 504, message: 'Geoapify service error. Try again later.' },
			},
		],
	};
}
