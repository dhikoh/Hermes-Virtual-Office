import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiSettingsModal } from "@/features/agents/components/ApiSettingsModal";

describe("ApiSettingsModal", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("fetches and displays providers on mount", async () => {
    const mockProviders = [
      { id: "p1", name: "OpenRouter Provider", url: "https://openrouter.ai/api", key: "sk-or-test" },
      { id: "p2", name: "Local LMStudio", url: "http://localhost:1234/v1", key: "" },
    ];

    const sendCommand = vi.fn().mockImplementation((method: string) => {
      if (method === "config.providers.list") {
        return Promise.resolve({ providers: mockProviders });
      }
      return Promise.resolve({});
    });

    render(
      createElement(ApiSettingsModal, {
        onClose: vi.fn(),
        sendCommand,
      })
    );

    expect(screen.getByText(/API Providers/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("OpenRouter Provider")).toBeInTheDocument();
      expect(screen.getByText("Local LMStudio")).toBeInTheDocument();
    });

    expect(sendCommand).toHaveBeenCalledWith("config.providers.list", {});
  });

  it("tests connection when Test Connection button is clicked", async () => {
    const mockProviders = [
      { id: "p1", name: "OpenRouter", url: "https://openrouter.ai/api/v1", key: "sk-test" },
    ];

    const sendCommand = vi.fn().mockImplementation((method: string, params: any) => {
      if (method === "config.providers.list") {
        return Promise.resolve({ providers: mockProviders });
      }
      if (method === "config.test") {
        return Promise.resolve({ success: true, count: 42 });
      }
      return Promise.resolve({});
    });

    render(
      createElement(ApiSettingsModal, {
        onClose: vi.fn(),
        sendCommand,
      })
    );

    await waitFor(() => {
      expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    });

    const testBtn = screen.getByRole("button", { name: /test connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(sendCommand).toHaveBeenCalledWith("config.test", {
        apiUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-test",
      });
      expect(screen.getByText(/Found 42 models/i)).toBeInTheDocument();
    });
  });

  it("updates active provider when Use as Active Provider button is clicked", async () => {
    const mockProviders = [
      { id: "p1", name: "Active Choice", url: "https://openrouter.ai/api", key: "sk-active" },
    ];

    const sendCommand = vi.fn().mockImplementation((method: string) => {
      if (method === "config.providers.list") {
        return Promise.resolve({ providers: mockProviders });
      }
      if (method === "config.update") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });

    render(
      createElement(ApiSettingsModal, {
        onClose: vi.fn(),
        sendCommand,
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Active Choice")).toBeInTheDocument();
    });

    const activateBtn = screen.getByRole("button", { name: /use this provider/i });
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(sendCommand).toHaveBeenCalledWith("config.update", {
        providerId: "p1",
        apiUrl: "https://openrouter.ai/api",
        apiKey: "sk-active",
      });
      expect(screen.getByText("This provider is now ACTIVE!")).toBeInTheDocument();
    });
  });

  it("displays Active badge and disables activation button for already active provider", async () => {
    const mockProviders = [
      { id: "p1", name: "Current Active", url: "https://openrouter.ai/api", key: "sk-active" },
      { id: "p2", name: "Backup Provider", url: "https://api.trustisgold.web.id/v1", key: "sk-backup" },
    ];

    const sendCommand = vi.fn().mockImplementation((method: string) => {
      if (method === "config.providers.list") {
        return Promise.resolve({ providers: mockProviders, activeProviderId: "p1" });
      }
      return Promise.resolve({});
    });

    render(
      createElement(ApiSettingsModal, {
        onClose: vi.fn(),
        sendCommand,
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Current Active")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /active provider/i })).toBeDisabled();
    });
  });
});
