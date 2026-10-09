"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { GatewayBrowserClient } from "@/lib/gateway/protocol/GatewayBrowserClient";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";

export interface GatewayContextValue {
  client: GatewayBrowserClient | null;
  status: GatewayStatus;
  sendCommand: <T = any>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export interface GatewayProviderProps {
  client?: GatewayBrowserClient | null;
  status?: GatewayStatus;
  children: React.ReactNode;
}

export function GatewayProvider({
  client = null,
  status = "disconnected",
  children,
}: GatewayProviderProps) {
  const value = useMemo<GatewayContextValue>(() => {
    return {
      client,
      status,
      sendCommand: async <T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
        if (!client) {
          throw new Error("Gateway client is not connected");
        }
        return client.call<T>(method, params);
      },
    };
  }, [client, status]);

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}

export function useGateway(): GatewayContextValue {
  const context = useContext(GatewayContext);
  if (!context) {
    return {
      client: null,
      status: "disconnected",
      sendCommand: async () => {
        throw new Error("useGateway must be used within a GatewayProvider or provided with a client");
      },
    };
  }
  return context;
}
