import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Import from adapter
import { resolveHermesEndpoint, updateEnvFile } from "../../server/hermes-gateway-adapter.js";

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

  it("handles duplicate /v1/v1/models in baseUrl", () => {
    const result = resolveHermesEndpoint("https://api.trustisgold.web.id/v1/v1/models", "/v1/models");
    expect(result).toBe("https://api.trustisgold.web.id/v1/models");
  });

  it("handles /v1/models provided as baseUrl", () => {
    const result = resolveHermesEndpoint("https://api.trustisgold.web.id/v1/models", "/v1/models");
    expect(result).toBe("https://api.trustisgold.web.id/v1/models");
  });

  it("handles /v1/chat/completions provided as baseUrl", () => {
    const result = resolveHermesEndpoint("https://api.trustisgold.web.id/v1/chat/completions", "/v1/chat/completions");
    expect(result).toBe("https://api.trustisgold.web.id/v1/chat/completions");
  });
});

describe("updateEnvFile (.env persistence without reverting)", () => {
  it("updates active HERMES variables without corrupting commented lines", () => {
    const tmpFile = path.join(os.tmpdir(), `test-env-${Date.now()}.env`);
    const initialContent = `# HERMES_API_URL=https://commented-url.com
# HERMES_API_KEY=sk-commented
HERMES_API_URL=https://openrouter.ai/api
HERMES_API_KEY=sk-initial
HERMES_MODEL=nemotron
`;
    fs.writeFileSync(tmpFile, initialContent, "utf8");

    try {
      updateEnvFile(tmpFile, {
        HERMES_API_URL: "https://api.trustisgold.web.id/v1",
        HERMES_API_KEY: "sk-tig-test",
      });

      const updated = fs.readFileSync(tmpFile, "utf8");
      // Commented lines should still be comments
      expect(updated).toContain("# HERMES_API_URL=https://commented-url.com");
      expect(updated).toContain("# HERMES_API_KEY=sk-commented");
      // Active lines should be updated with new values
      expect(updated).toContain("HERMES_API_URL=https://api.trustisgold.web.id/v1");
      expect(updated).toContain("HERMES_API_KEY=sk-tig-test");
      // Other variables preserved
      expect(updated).toContain("HERMES_MODEL=nemotron");
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
