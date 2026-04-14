import { env } from '$env/dynamic/private';

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

export type DeepSeekCallOptions = {
	maxTokens?: number;
	temperature?: number;
	/** When true, sets response_format json_object (prompt must mention JSON). */
	jsonObject?: boolean;
};

export type DeepSeekCallResult = {
	content: string;
	finishReason: string;
};

export async function callDeepSeek(
	prompt: string,
	systemPrompt: string,
	options: DeepSeekCallOptions = {}
): Promise<DeepSeekCallResult> {
	const { maxTokens = 2000, temperature = 0.7, jsonObject = false } = options;
	const apiKey = env.DEEPSEEK_API_KEY ?? '';
	if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

	const body: Record<string, unknown> = {
		model: 'deepseek-chat',
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: prompt }
		],
		temperature,
		max_tokens: maxTokens
	};
	if (jsonObject) {
		body.response_format = { type: 'json_object' };
	}

	const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
	const data = (await res.json()) as {
		choices: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
	};
	const choice = data.choices[0];
	const content = choice?.message?.content ?? '';
	const finishReason = choice?.finish_reason ?? 'unknown';
	return { content, finishReason };
}

export function parseDeepSeekJson(raw: string): unknown {
	const cleaned = raw
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/```\s*$/i, '')
		.trim();
	if (!cleaned) throw new Error('Empty model response');
	return JSON.parse(cleaned);
}
