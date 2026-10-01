import type { INodeProperties, INodeTypeDescription } from 'n8n-workflow';

export interface OperationContract {
	resource?: string;
	operation?: string;
	requiredControls: string[];
}

function isVisibleFor(
	property: INodeProperties,
	selection: { resource?: string; operation?: string },
) {
	const show = property.displayOptions?.show;
	if (!show) return true;
	return Object.entries(selection).every(([key, value]) => {
		const accepted = show[key];
		return accepted === undefined || accepted.includes(value as never);
	});
}

export function assertRequiredControls(
	description: INodeTypeDescription,
	contract: OperationContract,
) {
	const visible = description.properties.filter((property) => isVisibleFor(property, contract));
	for (const control of contract.requiredControls) {
		const property = visible.find(({ name }) => name === control);
		if (!property) throw new Error(`Required control ${control} is hidden or missing`);
		if (property.required !== true)
			throw new Error(`Required control ${control} is not marked required`);
	}
}

export function normalizeResourceLocator(value: unknown, label: string) {
	const candidate =
		typeof value === 'object' && value !== null && 'value' in value
			? (value as { value?: unknown }).value
			: value;
	if (typeof candidate !== 'string' || !candidate.trim())
		throw new Error(`${label} must contain a non-empty list or manual value`);
	return candidate.trim();
}

export function requireNonBlankDefaults(values: Record<string, unknown>, required: string[]) {
	for (const name of required) {
		const value = values[name];
		if (typeof value !== 'string' || !value.trim())
			throw new Error(`${name} is required before transport`);
	}
}
