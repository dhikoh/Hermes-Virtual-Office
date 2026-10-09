import { describe, expect, it } from "vitest";

// Import from adapter
import { resolveHermesEndpoint } from "../../server/hermes-gateway-adapter.js";

describe("API Provider URL normalization (Fix /v1/v1/models)", () => {
  it("resolves endpoints without duplicating /v1 when baseUrl already ends in /v1", () => {
    const result = resolveHermesEndpoint("https://openrouter.ai/api/v1", "/v1/models");
    expect(result).toBe("https://openrouter.ai/api/v1/models");
  });

  it("resolves endpoints when baseUrl does not end in /v1", () => {
    const result = resolveHermesEndpoint("https://openrouter.ai/api", "/v1/models");
    expect(result).toBe("https://openrouter.ai/api/v1/models");
  });

  it("handles trailing slashes correctly on baseUrl", () => {
    const result = resolveHermesEndpoint("https://api.openai.com/v1/", "/v1/models");
    expect(result).toBe("https://api.openai.com/v1/models");
  });

  it("correctly handles Groq openai/v1 endpoint path", () => {
    const result = resolveHermesEndpoint("https://api.groq.com/openai/v1", "/v1/chat/completions");
    expect(result).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("correctly handles Local/LMStudio/Ollama endpoints without /v1", () => {
    const result = resolveHermesEndpoint("http://localhost:1234", "/v1/models");
    expect(result).toBe("http://localhost:1234/v1/models");
  });

  it("correctly handles Local/Ollama with /v1", () => {
    const result = resolveHermesEndpoint("http://localhost:11434/v1", "/v1/models");
    expect(result).toBe("http://localhost:11434/v1/models");
  });
});
