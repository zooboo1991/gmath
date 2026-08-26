import Anthropic from "@anthropic-ai/sdk";
import type { ChatRequest, ChatResult } from "../types";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY тохируулаагүй байна");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function claudeChat({ system, messages, tier, maxTokens }: ChatRequest): Promise<ChatResult> {
  const model =
    tier === "smart"
      ? process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-5"
      : process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";

  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens ?? 1024,
    // Cached: the system block carries the whole course/program catalogue and
    // repeats near-identically on every turn of a conversation, so paying full
    // input price for it each time is pure waste.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    model,
    tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}
