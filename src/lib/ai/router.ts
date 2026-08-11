import { claudeChat } from "./providers/claude";
import { deepseekChat } from "./providers/deepseek";
import type { ChatMessage, ChatResult, ModelTier } from "./types";

/**
 * Cheap heuristic for which model tier a message needs. Long messages and
 * ones that read like a complaint or a payment dispute go to the smart tier;
 * ordinary "хэзээ эхэлдэг вэ / хэд төгрөг вэ" questions stay on the cheap
 * one. A starting point, not a final policy — worth revisiting once real
 * transcripts show what the fast tier actually gets wrong.
 */
export function pickTier(message: string): ModelTier {
  if (message.length > 280) return "smart";
  const escalate = ["гомдол", "буцаалт", "төлбөр буцаа", "асуудал гарсан", "алдаа гарсан"];
  return escalate.some((kw) => message.includes(kw)) ? "smart" : "fast";
}

export async function routeChat({
  system,
  messages,
}: {
  system: string;
  messages: ChatMessage[];
}): Promise<ChatResult> {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const tier = pickTier(lastUserMessage?.content ?? "");
  const chat = process.env.AI_PROVIDER === "deepseek" ? deepseekChat : claudeChat;
  return chat({ system, messages, tier });
}
