import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentChatPanel } from "@/features/agents/components/AgentChatPanel";
import type { AgentState } from "@/features/agents/state/store";

describe("AgentChatPanel Clipboard Paste (Ctrl+V Image Paste)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mockAgent: AgentState = {
    agentId: "agent-1",
    name: "Test Agent",
    sessionKey: "agent:agent-1:main",
    status: "idle",
    runId: null,
    runStartedAt: null,
    streamText: null,
    thinkingTrace: null,
    outputLines: [],
    lastResult: null,
    lastDiff: null,
    latestOverride: null,
    latestOverrideKind: null,
    lastAssistantMessageAt: null,
    lastActivityAt: null,
    latestPreview: null,
    lastUserMessage: null,
    draft: "",
    queuedMessages: [],
    historyLoadedAt: null,
    historyFetchLimit: null,
    historyFetchedCount: null,
    historyMaybeTruncated: false,
    awaitingUserInput: false,
    hasUnseenActivity: false,
    sessionCreated: true,
    sessionSettingsSynced: true,
    toolCallingEnabled: false,
    showThinkingTraces: true,
    transcriptEntries: [],
    transcriptRevision: 0,
    transcriptSequenceCounter: 0,
    sessionEpoch: 0,
    lastHistoryRequestRevision: null,
    lastAppliedHistoryRequestId: null,
  };

  it("handles image paste via clipboardData and triggers file upload", async () => {
    const mockUploadResponse = {
      id: "file-paste-123",
      name: "screenshot.png",
      url: "/uploads/screenshot.png",
      contentType: "image/png",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUploadResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(AgentChatPanel, {
        agent: mockAgent,
        isSelected: false,
        canSend: true,
        models: [],
        stopBusy: false,
        onLoadMoreHistory: vi.fn(),
        onModelChange: vi.fn(),
        onThinkingChange: vi.fn(),
        onDraftChange: vi.fn(),
        onSend: vi.fn(),
        onRemoveQueuedMessage: vi.fn(),
        onStopRun: vi.fn(),
        onAvatarShuffle: vi.fn(),
      })
    );

    const textarea = screen.getByPlaceholderText("type a message");
    expect(textarea).toBeInTheDocument();

    const mockFile = new File(["dummy image content"], "screenshot.png", { type: "image/png" });

    const clipboardEvent = {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => mockFile,
          },
        ],
      },
    };

    fireEvent.paste(textarea, clipboardEvent);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/upload",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );
      expect(screen.getByText(/Uploaded 1 pasted file/i)).toBeInTheDocument();
    });
  });

  it("ignores non-image paste items", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(AgentChatPanel, {
        agent: mockAgent,
        isSelected: false,
        canSend: true,
        models: [],
        stopBusy: false,
        onLoadMoreHistory: vi.fn(),
        onModelChange: vi.fn(),
        onThinkingChange: vi.fn(),
        onDraftChange: vi.fn(),
        onSend: vi.fn(),
        onRemoveQueuedMessage: vi.fn(),
        onStopRun: vi.fn(),
        onAvatarShuffle: vi.fn(),
      })
    );

    const textarea = screen.getByPlaceholderText("type a message");

    const textClipboardEvent = {
      clipboardData: {
        items: [
          {
            type: "text/plain",
            getAsFile: () => null,
          },
        ],
      },
    };

    fireEvent.paste(textarea, textClipboardEvent);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
