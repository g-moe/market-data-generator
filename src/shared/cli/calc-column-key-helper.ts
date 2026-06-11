import { input } from '@inquirer/prompts';
import type { z } from 'zod';

import {
	buildCalcColumnKeys,
	calcIndicatorIdSchema,
	calcNameSchema,
	calcOutputSchema,
	calcParamKeySchema,
	calcParamValueSchema,
	calcTimeframeSchema,
	getZodValidationMessage,
	type CalcColumnKeyInput,
	type CalcColumnParam
} from '../calc-column-key.ts';

type CalcColumnKeyHelperPorts = {
	prompt: (config: CalcColumnPromptConfig) => Promise<string>;
	write: (message: string) => void;
};

type CalcColumnPromptConfig = {
	message: string;
	validate: (value: string) => true | string;
};

const TIMEFRAME_PROMPT = 'tf (same, 5m, 15s, 1d, 500v, 100t)';

export async function runCalcColumnKeyHelper(ports = createNodeCalcColumnKeyHelperPorts()) {
	const name = await askWithSchema(ports, 'name', calcNameSchema);
	const timeframe = await askWithSchema(ports, TIMEFRAME_PROMPT, calcTimeframeSchema);
	const indicatorId = await askWithSchema(ports, 'id', calcIndicatorIdSchema);
	const params = await askParams(ports);
	const outputs = await askOutputs(ports);
	const input: CalcColumnKeyInput = {
		indicatorId,
		name,
		outputs,
		params,
		timeframe
	};
	const keys = buildCalcColumnKeys(input);

	ports.write('');
	ports.write('Calc column keys:');
	for (const key of keys) {
		ports.write(key);
	}

	return keys;
}

function createNodeCalcColumnKeyHelperPorts(): CalcColumnKeyHelperPorts {
	return {
		prompt: (config) =>
			input({
				message: config.message,
				validate: config.validate
			}),
		write: (message) => {
			console.log(message);
		}
	};
}

async function askParams(ports: CalcColumnKeyHelperPorts) {
	const params: CalcColumnParam[] = [];
	const keys = new Set<string>();

	ports.write('');
	ports.write('Params: leave key blank when done.');

	while (true) {
		const key = await askOptional(ports, 'param key', (value) => {
			const trimmed = value.trim();
			if (trimmed.length === 0) return true;

			const validation = validateWithSchema(calcParamKeySchema, trimmed);
			if (validation !== true) return validation;
			if (keys.has(trimmed)) return `duplicate parameter key "${trimmed}"`;

			return true;
		});
		if (key === undefined) return params;

		const value = await askWithSchema(ports, `param ${key} value`, calcParamValueSchema);
		params.push({ key, value });
		keys.add(key);
	}
}

async function askOutputs(ports: CalcColumnKeyHelperPorts) {
	const outputs: string[] = [];
	const seen = new Set<string>();

	ports.write('');
	ports.write('Out keys: leave blank when done.');

	while (true) {
		const output = await askOptional(ports, 'out', (value) => {
			const trimmed = value.trim();
			if (trimmed.length === 0) {
				return outputs.length === 0 ? 'At least one out key is required' : true;
			}

			const validation = validateWithSchema(calcOutputSchema, trimmed);
			if (validation !== true) return validation;
			if (seen.has(trimmed)) return `duplicate out key "${trimmed}"`;

			return true;
		});
		if (output === undefined) return outputs;

		outputs.push(output);
		seen.add(output);
	}
}

async function askWithSchema<TValue>(
	ports: CalcColumnKeyHelperPorts,
	message: string,
	schema: z.ZodType<TValue>
) {
	const value = await ports.prompt({
		message,
		validate: (inputValue) => validateWithSchema(schema, inputValue)
	});

	return schema.parse(value);
}

async function askOptional(
	ports: CalcColumnKeyHelperPorts,
	message: string,
	validate: (value: string) => true | string
) {
	const value = (
		await ports.prompt({
			message,
			validate
		})
	).trim();

	return value.length === 0 ? undefined : value;
}

function validateWithSchema<TValue>(schema: z.ZodType<TValue>, value: unknown) {
	const message = getZodValidationMessage(schema.safeParse(value));

	return message ?? true;
}
