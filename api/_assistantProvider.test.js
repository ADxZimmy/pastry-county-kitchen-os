import { describe, expect, it } from "vitest";
import {
  AssistantProviderError,
  MODEL_RATES_USD_PER_MTOK,
  assistantResponseSchema,
  callAssistantProvider,
  estimateCostUsd
} from "./_assistantProvider.js";

// Phase 014-B. The adapter is the only file that talks to a third party, so
// these tests fake the network and check what would have crossed it.

const SECRET = "sk-super-secret-key-value";

function anthropicConfig(overrides = {}) {
  return {
    configured: true,
    provider: "anthropic",
    model: "claude-opus-5",
    baseUrl: "https://api.anthropic.com",
    key: SECRET,
    keyScheme: "api-key",
    ...overrides
  };
}

function openaiConfig(overrides = {}) {
  return {
    configured: true,
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://gateway.internal",
    key: SECRET,
    keyScheme: "api-key",
    ...overrides
  };
}

function fetchReturning(payload, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload)
    };
  };
  impl.calls = calls;
  return impl;
}

const anthropicReply = (text, extra = {}) => ({
  model: "claude-opus-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
  usage: { input_tokens: 1000, output_tokens: 200 },
  ...extra
});

describe("cost estimation", () => {
  it("prices known models from the rate table", () => {
    expect(estimateCostUsd("claude-opus-5", { inputTokens: 1000000, outputTokens: 0 })).toBe(5);
    expect(estimateCostUsd("claude-haiku-4-5", { inputTokens: 0, outputTokens: 1000000 })).toBe(5);
  });

  it("charges an unknown model at the highest known rate, never the lowest", () => {
    const unknown = estimateCostUsd("model-nobody-heard-of", { inputTokens: 1000000, outputTokens: 0 });
    const highestInput = Math.max(...Object.values(MODEL_RATES_USD_PER_MTOK).map((rate) => rate.input));
    expect(unknown).toBe(highestInput);
  });

  // A gateway that omits `usage` would otherwise bill real money against a
  // ledger that never moves, and a ceiling that never trips is not a ceiling.
  it("charges a conservative estimate when a provider reports no usage at all", () => {
    expect(estimateCostUsd("claude-opus-5", {})).toBeGreaterThan(0);
    expect(estimateCostUsd("claude-opus-5", { inputTokens: 0, outputTokens: 0 })).toBeGreaterThan(0);
    expect(estimateCostUsd("claude-opus-5", undefined)).toBeGreaterThan(0);
  });

  it("still prefers real usage over the assumption when a provider reports it", () => {
    const reported = estimateCostUsd("claude-opus-5", { inputTokens: 10, outputTokens: 1 });
    const assumed = estimateCostUsd("claude-opus-5", {});
    expect(reported).toBeLessThan(assumed);
  });
});

describe("response schema", () => {
  it("permits only the four reviewable action types", () => {
    const schema = assistantResponseSchema();
    expect(schema.properties.proposedActions.items.properties.type.enum).toEqual([
      "openConversionReview",
      "openRecipeScale",
      "openShoppingList",
      "openOrderDraft"
    ]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("anthropic calls", () => {
  it("sends an API key in x-api-key and the history before the question", async () => {
    const impl = fetchReturning(anthropicReply("{}"));
    await callAssistantProvider({
      config: anthropicConfig(),
      system: "system prompt",
      userText: "the question",
      history: [{ role: "user", content: "earlier" }, { role: "assistant", content: "reply" }],
      fetchImpl: impl
    });
    const { url, init, body } = impl.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe(SECRET);
    expect(init.headers.authorization).toBeUndefined();
    expect(body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(body.messages[2].content).toBe("the question");
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("sends an OAuth token as a bearer to the canonical host with the oauth beta header, never x-api-key", async () => {
    const impl = fetchReturning(anthropicReply("{}"));
    await callAssistantProvider({
      config: anthropicConfig({ keyScheme: "bearer" }),
      system: "s",
      userText: "q",
      fetchImpl: impl
    });
    const { init } = impl.calls[0];
    expect(init.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(init.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
    expect(init.headers["x-api-key"]).toBeUndefined();
  });

  // The oauth beta flag is Anthropic's own handshake. A third-party router given
  // a bearer token is not doing that handshake, and the flag is meaningless-to-
  // harmful there -- the exact thing that makes a compat gateway reject a request.
  it("does not send the oauth beta flag to a non-Anthropic base URL", async () => {
    const impl = fetchReturning(anthropicReply("{}"));
    await callAssistantProvider({
      config: anthropicConfig({ keyScheme: "bearer", baseUrl: "https://agentrouter.org" }),
      system: "s",
      userText: "q",
      fetchImpl: impl
    });
    const { init } = impl.calls[0];
    expect(init.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(init.headers["anthropic-beta"]).toBeUndefined();
  });

  it("identifies itself with a User-Agent, so a fingerprinting gateway does not read it as a bot", async () => {
    const impl = fetchReturning(anthropicReply("{}"));
    await callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl });
    expect(impl.calls[0].init.headers["user-agent"]).toBe("pastry-county-kitchen-os/1.0");
  });

  it("treats a refusal as a failure rather than presenting partial content", async () => {
    const impl = fetchReturning(anthropicReply("half an answer", { stop_reason: "refusal" }));
    await expect(
      callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl })
    ).rejects.toMatchObject({ name: "AssistantProviderError" });
  });

  it("maps usage and flags truncation", async () => {
    const impl = fetchReturning(anthropicReply("text", { stop_reason: "max_tokens" }));
    const result = await callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl });
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(result.truncated).toBe(true);
  });

  it("retries once without the schema when the provider rejects it, then keeps the answer", async () => {
    let call = 0;
    const impl = async (url, init) => {
      call += 1;
      const body = JSON.parse(init.body);
      if (call === 1) {
        expect(body.output_config.format).toBeDefined();
        return { ok: false, status: 400, text: async () => JSON.stringify({ error: "output_config unsupported" }) };
      }
      expect(body.output_config.format).toBeUndefined();
      return { ok: true, status: 200, text: async () => JSON.stringify(anthropicReply("plain answer")) };
    };
    const result = await callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl });
    expect(call).toBe(2);
    expect(result.text).toBe("plain answer");
  });
});

describe("openai-compatible calls", () => {
  it("targets chat completions with a bearer key and maps the reply", async () => {
    const impl = fetchReturning({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "answer text" }, finish_reason: "length" }],
      usage: { prompt_tokens: 11, completion_tokens: 7 }
    });
    const result = await callAssistantProvider({ config: openaiConfig(), system: "s", userText: "q", fetchImpl: impl });
    expect(impl.calls[0].url).toBe("https://gateway.internal/v1/chat/completions");
    expect(impl.calls[0].init.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(result.text).toBe("answer text");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    expect(result.truncated).toBe(true);
  });
});

describe("failure handling", () => {
  it("describes an HTTP failure without echoing the provider body or the key", async () => {
    const impl = fetchReturning({ error: `the key ${SECRET} is invalid` }, { status: 401 });
    let caught;
    try {
      await callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AssistantProviderError);
    expect(caught.message).toBe("The assistant key was rejected by the provider.");
    // The key must not survive into anything a caller might log to a response.
    expect(caught.message).not.toContain(SECRET);
    expect(caught.reason).not.toContain(SECRET);
  });

  it("marks rate limits and server errors retryable, and client errors not", async () => {
    for (const [status, retryable] of [[429, true], [503, true], [404, false]]) {
      const impl = fetchReturning({}, { status });
      await expect(
        callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl })
      ).rejects.toMatchObject({ retryable });
    }
  });

  it("turns a timeout into a plain-language failure", async () => {
    const impl = async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };
    await expect(
      callAssistantProvider({ config: anthropicConfig(), system: "s", userText: "q", fetchImpl: impl })
    ).rejects.toMatchObject({ reason: "The assistant took too long to answer." });
  });

  it("refuses to run unconfigured instead of calling anyone", async () => {
    let called = false;
    await expect(
      callAssistantProvider({ config: { configured: false }, system: "s", userText: "q", fetchImpl: async () => { called = true; } })
    ).rejects.toBeInstanceOf(AssistantProviderError);
    expect(called).toBe(false);
  });
});
