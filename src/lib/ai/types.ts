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
  /**
   * Room for the answer. A chat reply is a paragraph; a report is pages of
   * JSON, and the default cut one off mid-object where it could not be parsed.
   */
  maxTokens?: number;
};

export type ChatResult = {
  text: string;
  /** The exact model ID that answered, recorded on the chat_messages row. */
  model: string;
  tokensUsed: { input: number; output: number };
};
