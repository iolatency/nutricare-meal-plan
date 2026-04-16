import { env } from '$env/dynamic/private';

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.4';

export class OpenAiChatApiError extends Error {
	status: number;
	details: string;

	constructor(status: number, details: string) {
		super(`OpenAI chat error: ${status}${details ? ` - ${details}` : ''}`);
		this.name = 'OpenAiChatApiError';
		this.status = status;
		this.details = details;
	}
}

export type OpenAiChatCallOptions = {
	maxTokens?: number;
	temperature?: number;
	/** When true, sets response_format json_object (prompt must mention JSON). */
	jsonObject?: boolean;
};

export type OpenAiChatCallResult = {
	content: string;
	finishReason: string;
};

function isRetriableOpenAiError(err: unknown): boolean {
	if (err instanceof OpenAiChatApiError) {
		return err.status === 429 || err.status >= 500;
	}
	return err instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function openAiBaseUrl(): string {
	const raw = (env.OPENAI_BASE_URL ?? '').trim().replace(/\/$/, '');
	return raw || DEFAULT_OPENAI_BASE;
}

function openAiModel(): string {
	const raw = (env.OPENAI_MODEL ?? '').trim();
	return raw || DEFAULT_MODEL;
}

export async function callOpenAiChat(
	prompt: string,
	systemPrompt: string,
	options: OpenAiChatCallOptions = {}
): Promise<OpenAiChatCallResult> {
	const { maxTokens = 2000, temperature = 0.7, jsonObject = false } = options;
	const apiKey = env.OPENAI_API_KEY ?? '';
	if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

	const base = openAiBaseUrl();
	const model = openAiModel();

	// gpt-5.x and other recent models reject max_tokens; Chat Completions expects max_completion_tokens.
	const body: Record<string, unknown> = {
		model,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: prompt }
		],
		temperature,
		max_completion_tokens: maxTokens
	};
	if (jsonObject) {
		body.response_format = { type: 'json_object' };
	}

	const maxAttempts = 3;
	let attempt = 0;
	while (attempt < maxAttempts) {
		attempt += 1;
		try {
			const res = await fetch(`${base}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const details = (await res.text()).slice(0, 600);
				throw new OpenAiChatApiError(res.status, details);
			}
			const data = (await res.json()) as {
				choices: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
				usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
			};
			const choice = data.choices[0];
			const content = choice?.message?.content ?? '';
			const finishReason = choice?.finish_reason ?? 'unknown';
			return { content, finishReason };
		} catch (err) {
			if (attempt >= maxAttempts || !isRetriableOpenAiError(err)) {
				throw err;
			}
			const backoffMs = 350 * attempt;
			await sleep(backoffMs);
		}
	}

	throw new Error('OpenAI chat call failed after retries');
}

export function parseModelJson(raw: string): unknown {
	const cleaned = raw
		.replace(/^```json\s*/i, '')
		.replace(/^```\s*/i, '')
		.replace(/```\s*$/i, '')
		.trim();
	if (!cleaned) throw new Error('Empty model response');
	return JSON.parse(cleaned);
}
