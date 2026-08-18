// Phase 014-B: the provider adapter. This is the only file that talks to a
// third party.
//
// Raw fetch rather than a vendor SDK, deliberately. DECISION.md records the
// owner's direction as "multipurpose -- any API can work", so this file must
// speak two shapes: Anthropic's /v1/messages and any OpenAI-compatible
// /v1/chat/completions. A vendor SDK would make one of those a second-class
// citizen, and it would add a dependency to a deployment already sitting at its
// serverless function and bundle budget.
//
// The key never appears in a log line, an error message, or a thrown object.

import { ASSISTANT_RESPONSE_FIELDS, REVIEWABLE_ACTIONS } from "./_assistant.js";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 4000;

// ------------------------------------------------------------------ cost ----
// USD per million tokens, input/output. Used only to decide whether the monthly
// ceiling has been reached -- it is an estimate, not an invoice.
export const MODEL_RATES_USD_PER_MTOK = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 }
};

// An unrecognised model is charged at the highest rate we know of. Guessing low
// would let an unknown model quietly outspend the ceiling; guessing high only
// makes the assistant fall back to the deterministic helper sooner, which is a
// supported state rather than a failure.
const UNKNOWN_MODEL_RATE = { input: 10, output: 50 };

// What a call is assumed to have cost when a provider reports no usage at all.
// A gateway that omits `usage` -- common for self-hosted and proxy endpoints,
// which ASSISTANT_BASE_URL exists to support -- would otherwise bill real money
// against a ledger that never moves, and a ceiling that never trips is not a
// ceiling. Charging a full request's worth is deliberately pessimistic: the
// worst case is falling back to the deterministic helper earlier than needed.
const ASSUMED_TOKENS_WHEN_UNREPORTED = { input: 40000, output: 2000 };

export function estimateCostUsd(model, usage = {}) {
  const rate = MODEL_RATES_USD_PER_MTOK[String(model)] ?? UNKNOWN_MODEL_RATE;
  const input = Number(usage.inputTokens || 0);
  const output = Number(usage.outputTokens || 0);
  if (input <= 0 && output <= 0) {
    return (
      (ASSUMED_TOKENS_WHEN_UNREPORTED.input * rate.input + ASSUMED_TOKENS_WHEN_UNREPORTED.output * rate.output) / 1000000
    );
  }
  return (input * rate.input + output * rate.output) / 1000000;
}

// -------------------------------------------------------------- contract ----
// The response schema, expressed for providers that can enforce it. Enforcement
// is a bonus, never the guarantee: validateAssistantResponse re-checks whatever
// comes back, because a provider that ignores the schema must not be trusted
// just because it was asked nicely.
export function assistantResponseSchema() {
  return {
    type: "object",
    properties: {
      answer: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      sources: { type: "array", items: { type: "string" } },
      proposedActions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...REVIEWABLE_ACTIONS] },
            label: { type: "string" }
          },
          required: ["type", "label"],
          additionalProperties: false
        }
      }
    },
    required: [...ASSISTANT_RESPONSE_FIELDS],
    additionalProperties: false
  };
}

// ---------------------------------------------------------------- errors ----
// A provider failure is a normal outcome here, not an exception to surface. The
// caller treats every one of these identically: fall back to the deterministic
// helper with honest copy.
export class AssistantProviderError extends Error {
  constructor(reason, { status = null, retryable = false, detail = "" } = {}) {
    super(reason);
    this.name = "AssistantProviderError";
    this.reason = reason;
    this.status = status;
    this.retryable = retryable;
    // Server-side only. Never returned to the browser -- a provider's error body
    // can echo the request back, and the request carries the kitchen's data.
    this.detail = detail;
  }
}

function describeStatus(status) {
  if (status === 401 || status === 403) return "The assistant key was rejected by the provider.";
  if (status === 404) return "The configured assistant model was not found.";
  if (status === 429) return "The assistant provider is rate limiting requests.";
  if (status >= 500) return "The assistant provider is unavailable.";
  return "The assistant provider refused the request.";
}

async function postJson(url, headers, body, { timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    // Includes the abort. The transport error's own message is not echoed,
    // because it can carry the request -- and the request carries the key.
    throw new AssistantProviderError(
      error?.name === "AbortError"
        ? "The assistant took too long to answer."
        : "The assistant provider could not be reached.",
      { retryable: true }
    );
  } finally {
    clearTimeout(timer);
  }

  // Read the body before branching, so the connection is always consumed. An
  // unconsumed error body leaked a connection on every page load in Phase
  // 011-B1; that mistake is not repeated here.
  const text = await response.text();
  if (!response.ok) {
    throw new AssistantProviderError(describeStatus(response.status), {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      detail: text.slice(0, 500)
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AssistantProviderError("The assistant returned a response that could not be read.");
  }
}

// Joins a base URL to a versioned path without doubling the version segment.
//
// Gateways document their base URL both ways -- Anthropic's is bare
// (https://api.anthropic.com) while most OpenAI-compatible routers publish it
// with the version already on it (https://gateway.example/v1). Appending "/v1/..."
// to the latter produces "/v1/v1/chat/completions" and a 404 that looks like a
// broken key, so a base that already ends in the version has it stripped.
function endpoint(baseUrl, path) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const version = path.match(/^\/(v\d+)\//)?.[1];
  const trimmed = version && base.endsWith(`/${version}`) ? base.slice(0, -(version.length + 1)) : base;
  return `${trimmed}${path}`;
}

// ------------------------------------------------------------- anthropic ----
async function callAnthropic({ config, system, userText, history, schema, maxTokens, timeoutMs, fetchImpl }) {
  const body = {
    model: config.model,
    max_tokens: maxTokens,
    system,
    messages: [...history, { role: "user", content: userText }],
    // Low effort on purpose: this answers questions about a bakery's own saved
    // records, which is retrieval and arithmetic rather than deep reasoning.
    // Thinking is left at the model's default rather than disabled -- disabling
    // it is what makes a model leak its internal tags into the visible answer.
    output_config: {
      effort: "low",
      ...(schema ? { format: { type: "json_schema", schema } } : {})
    }
  };

  // An API key travels in x-api-key; an OAuth token (ANTHROPIC_AUTH_TOKEN) in
  // an Authorization bearer header plus the oauth beta flag. Sending a token
  // through x-api-key is a guaranteed 401, so the scheme is honoured here.
  const authHeaders =
    config.keyScheme === "bearer"
      ? { authorization: `Bearer ${config.key}`, "anthropic-beta": "oauth-2025-04-20" }
      : { "x-api-key": config.key };
  const payload = await postJson(
    endpoint(config.baseUrl, "/v1/messages"),
    { ...authHeaders, "anthropic-version": ANTHROPIC_VERSION },
    body,
    { timeoutMs, fetchImpl }
  );

  // Checked before the content is read. A refusal returns HTTP 200 with content
  // either empty or partial, so reading content[0] straight would either throw
  // or quietly present half an answer as a whole one.
  if (payload?.stop_reason === "refusal") {
    throw new AssistantProviderError("The assistant declined to answer that.");
  }

  const text = (Array.isArray(payload?.content) ? payload.content : [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return {
    text,
    model: payload?.model || config.model,
    usage: {
      inputTokens: Number(payload?.usage?.input_tokens || 0),
      outputTokens: Number(payload?.usage?.output_tokens || 0)
    },
    truncated: payload?.stop_reason === "max_tokens"
  };
}

// -------------------------------------------------------- openai-compatible ----
async function callOpenAiCompatible({ config, system, userText, history, schema, maxTokens, timeoutMs, fetchImpl }) {
  const body = {
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      ...history,
      { role: "user", content: userText }
    ],
    ...(schema ? { response_format: { type: "json_object" } } : {})
  };

  const payload = await postJson(
    endpoint(config.baseUrl, "/v1/chat/completions"),
    { authorization: `Bearer ${config.key}` },
    body,
    { timeoutMs, fetchImpl }
  );

  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  return {
    text: String(choice?.message?.content ?? "").trim(),
    model: payload?.model || config.model,
    usage: {
      inputTokens: Number(payload?.usage?.prompt_tokens || 0),
      outputTokens: Number(payload?.usage?.completion_tokens || 0)
    },
    truncated: choice?.finish_reason === "length"
  };
}

// ------------------------------------------------------------------ call ----
// One call, one answer, or one AssistantProviderError. Never a partial success.
export async function callAssistantProvider({
  config,
  system,
  userText,
  history = [],
  schema = assistantResponseSchema(),
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!config?.configured) throw new AssistantProviderError("No assistant provider is configured.");
  if (typeof fetchImpl !== "function") throw new AssistantProviderError("This runtime has no fetch available.");

  const call = config.provider === "anthropic" ? callAnthropic : callOpenAiCompatible;
  const args = { config, system, userText, history, schema, maxTokens, timeoutMs, fetchImpl };

  try {
    return await call(args);
  } catch (error) {
    // Schema enforcement is not available on every model a deployment might
    // name. Rather than leaving the assistant permanently dead for anyone who
    // picks an older one, drop the schema once and fall back to the prompt plus
    // validateAssistantResponse -- which was always the real guarantee.
    const schemaRejected = error instanceof AssistantProviderError && error.status === 400 && Boolean(schema);
    if (!schemaRejected) throw error;
    return await call({ ...args, schema: null });
  }
}
