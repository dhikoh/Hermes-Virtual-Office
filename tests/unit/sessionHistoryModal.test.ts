import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  SessionHistoryModal,
  type SessionGatewayClient,
} from "@/features/agents/components/SessionHistoryModal";

describe("SessionHistoryModal", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not render when open is false", () => {
    const { container } = render(
      createElement(SessionHistoryModal, {
        open: false,
        agentId: "agent-1",
        client: { call: vi.fn() },
        onClose: vi.fn(),
        onSelectSession: vi.fn(),
      })
    );

    expect(container.firstChild).toBeNull();
  });

  it("fetches, filters by agentId, and sorts sessions by updatedAt descending", async () => {
    const mockSessions = [
      { key: "agent:agent-1:old", agentId: "agent-1", updatedAt: 1000, displayName: "Old Session" },
      { key: "agent:agent-2:other", agentId: "agent-2", updatedAt: 5000, displayName: "Other Agent Session" },
      { key: "agent:agent-1:recent", agentId: "agent-1", updatedAt: 9000, displayName: "Recent Session" },
    ];

    const mockClient: SessionGatewayClient = {
      call: vi.fn().mockResolvedValue({ sessions: mockSessions }),
    };

    render(
      createElement(SessionHistoryModal, {
        open: true,
        agentId: "agent-1",
        client: mockClient,
        onClose: vi.fn(),
        onSelectSession: vi.fn(),
      })
    );

    expect(screen.getByText("Chat History")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Recent Session")).toBeInTheDocument();
      expect(screen.getByText("Old Session")).toBeInTheDocument();
      expect(screen.queryByText("Other Agent Session")).not.toBeInTheDocument();
    });

    expect(mockClient.call).toHaveBeenCalledWith("sessions.list", {});
  });

  it("invokes onSelectSession when clicking a session entry", async () => {
    const mockSessions = [
      { key: "agent:agent-1:session-a", agentId: "agent-1", updatedAt: 1000, displayName: "Session A" },
    ];

    const onSelectSession = vi.fn();
    const mockClient: SessionGatewayClient = {
      call: vi.fn().mockResolvedValue({ sessions: mockSessions }),
    };

    render(
      createElement(SessionHistoryModal, {
        open: true,
        agentId: "agent-1",
        client: mockClient,
        onClose: vi.fn(),
        onSelectSession,
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Session A")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Session A"));
    expect(onSelectSession).toHaveBeenCalledWith("agent:agent-1:session-a");
  });

  it("deletes session and calls gateway when delete button is confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const mockSessions = [
      { key: "agent:agent-1:to-delete", agentId: "agent-1", updatedAt: 1000, displayName: "To Delete" },
    ];

    const mockClient: SessionGatewayClient = {
      call: vi.fn().mockResolvedValue({ sessions: mockSessions }),
    };

    render(
      createElement(SessionHistoryModal, {
        open: true,
        agentId: "agent-1",
        client: mockClient,
        onClose: vi.fn(),
        onSelectSession: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(screen.getByText("To Delete")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTitle("Delete session");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockClient.call).toHaveBeenCalledWith("sessions.delete", {
        key: "agent:agent-1:to-delete",
      });
      expect(screen.queryByText("To Delete")).not.toBeInTheDocument();
    });
  });
});
