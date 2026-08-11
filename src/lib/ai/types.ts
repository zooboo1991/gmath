export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Which model tier a message gets routed to. "fast" is the cheap default;
 * "smart" is reserved for the minority of messages that actually need it
 * (see pickTier in ./router.ts).
 */
export type ModelTier = "fast" | "smart";

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  tier: ModelTier;
};

export type ChatResult = {
  text: string;
  /** The exact model ID that answered, recorded on the chat_messages row. */
  model: string;
  tokensUsed: { input: number; output: number };
};
