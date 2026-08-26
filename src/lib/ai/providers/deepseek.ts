import type { ChatRequest, ChatResult } from "../types";

type DeepSeekResponse = {
  choices: { message: { content: string } }[];
  usage: { prompt_tokens: number; completion_tokens: number };
};

/**
 * DeepSeek exposes an OpenAI-compatible /chat/completions endpoint, so plain
 * fetch is enough — no second SDK dependency for a provider that may never be
 * switched on. Note DeepSeek processes requests in China: only send content
 * that's fine to leave the country (see the system prompt builder, which is
 * where a student's own registration details get injected).
 */
export async function deepseekChat({ system, messages, tier, maxTokens }: ChatRequest): Promise<ChatResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY тохируулаагүй байна");

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model =
    tier === "smart"
      ? process.env.DEEPSEEK_MODEL_SMART ?? "deepseek-reasoner"
      : process.env.DEEPSEEK_MODEL_FAST ?? "deepseek-chat";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens ?? 1024,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as DeepSeekResponse;
  return {
    text: data.choices[0].message.content,
    model,
    tokensUsed: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens },
  };
}
