import { useState, useEffect } from "react";
import { useGateway } from "@/lib/gateway/GatewayContext";
import { Plug, Plus, Trash2, CheckCircle2, Play } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  url: string;
  key: string;
};

type ApiSettingsModalProps = {
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: { call: <T = any>(method: string, params?: Record<string, unknown>) => Promise<T> } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendCommand?: <T = any>(method: string, params?: Record<string, unknown>) => Promise<T>;
  onProviderActivated?: (info?: { models?: string[]; defaultModel?: string; providerId?: string }) => void;
};

export function sanitizeProviderBaseUrl(url: string): string {
  let clean = (url || "").trim().replace(/\/+$/, "");
  clean = clean.replace(/\/chat\/completions\/?$/, "");
  clean = clean.replace(/\/models\/?$/, "");
  while (clean.endsWith("/v1/v1")) {
    clean = clean.slice(0, -3);
  }
  return clean;
}

export const ApiSettingsModal = ({ onClose, client, sendCommand: propSendCommand, onProviderActivated }: ApiSettingsModalProps) => {
  const gateway = useGateway();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendCommand = propSendCommand || (client ? <T = any>(method: string, params: Record<string, unknown> = {}) => client.call<T>(method, params) : gateway.sendCommand);
  
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean, message: string} | null>(null);
  const [activeMessage, setActiveMessage] = useState("");

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const res = await sendCommand("config.providers.list", {});
      if (res.providers) {
        setProviders(res.providers);
        if (res.activeProviderId) {
          setActiveProviderId(res.activeProviderId);
        }
        if (res.providers.length > 0 && !editingId) {
          const toSelect = (res.activeProviderId && res.providers.find((p: Provider) => p.id === res.activeProviderId)) || res.providers[0];
          handleEdit(toSelect);
        }
      }
    } catch (err) {
      console.error("Failed to load providers", err);
    }
  };

  const handleEdit = (p: Provider) => {
    setEditingId(p.id);
    setName(p.name);
    setApiUrl(p.url);
    setApiKey(p.key);
    setTestResult(null);
    setActiveMessage("");
  };

  const handleAddNew = () => {
    setEditingId("new_" + Date.now());
    setName("New Provider");
    setApiUrl("https://");
    setApiKey("");
    setTestResult(null);
    setActiveMessage("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this provider?")) return;
    try {
      const res = await sendCommand("config.providers.delete", { providerId: id });
      if (res.providers) {
        setProviders(res.providers);
        if (res.activeProviderId) setActiveProviderId(res.activeProviderId);
        if (editingId === id) {
          if (res.providers.length > 0) handleEdit(res.providers[0]);
          else handleAddNew();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const normalizeUrl = (raw: string): string => {
    const cleaned = sanitizeProviderBaseUrl(raw);
    if (cleaned && cleaned !== raw) {
      setApiUrl(cleaned);
      return cleaned;
    }
    return raw;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTestResult(null);
    setActiveMessage("");
    
    const cleanUrl = normalizeUrl(apiUrl);
    try {
      const provider: Provider = {
        id: editingId || "new_" + Date.now(),
        name, url: cleanUrl, key: apiKey
      };
      const res = await sendCommand("config.providers.save", { provider });
      if (res.ok && res.providers) {
        setProviders(res.providers);
        setEditingId(provider.id);
        if (res.activeProviderId) setActiveProviderId(res.activeProviderId);
        setActiveMessage("Profile saved successfully.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setActiveMessage("");
    const cleanUrl = normalizeUrl(apiUrl);
    try {
      const res = await sendCommand<{ success?: boolean; count?: number; error?: string }>("config.test", { apiUrl: cleanUrl, apiKey });
      if (res?.success) {
        setTestResult({ ok: true, message: `Success! Found ${res.count} models.` });
      } else {
        setTestResult({ ok: false, message: res?.error || "Connection failed" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to test connection";
      setTestResult({ ok: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleUseProfile = async () => {
    const cleanUrl = normalizeUrl(apiUrl);
    try {
      const res = await sendCommand("config.update", {
        providerId: editingId,
        apiUrl: cleanUrl,
        apiKey
      });
      if (res.ok) {
        if (editingId) setActiveProviderId(editingId);
        setActiveMessage("This provider is now ACTIVE!");
        onProviderActivated?.(res);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="ui-card flex w-full max-w-4xl overflow-hidden p-0 shadow-2xl h-[500px]">
        
        {/* Left Sidebar: List */}
        <div className="w-1/3 border-r border-white/5 bg-white/5 flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <Plug className="w-4 h-4 text-primary" /> API Providers
            </h2>
            <button onClick={handleAddNew} className="ui-btn-ghost p-1 text-muted-foreground hover:text-foreground" title="Add New">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {providers.map((p) => {
              const isSelected = editingId === p.id;
              const isActive = activeProviderId === p.id;
              return (
                <div 
                  key={p.id} 
                  className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}`}
                  onClick={() => handleEdit(p)}
                >
                  <div className="truncate flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {p.name}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.url}</div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-400 transition-opacity shrink-0"
                    title="Delete provider"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {providers.length === 0 && (
              <div className="p-4 text-xs text-center text-muted-foreground">No providers saved.</div>
            )}
          </div>
        </div>

        {/* Right Content: Form */}
        <div className="w-2/3 flex flex-col bg-background relative">
          <div className="absolute top-4 right-4">
             <button onClick={onClose} className="ui-btn-ghost px-3 py-1 text-xs">Close Modal</button>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold tracking-tight text-foreground">Edit Provider Profile</h2>
              {editingId && (
                editingId === activeProviderId ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active Provider
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground border border-white/10">
                    Inactive Profile
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-6">Configure settings for this API connection.</p>
            
            <form id="provider-form" onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-foreground">Profile Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Local LMStudio"
                  className="ui-input w-full"
                  required
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-foreground">Base URL</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  onBlur={() => normalizeUrl(apiUrl)}
                  placeholder="https://openrouter.ai/api"
                  className="ui-input w-full font-mono text-sm"
                  required
                />
                <p className="text-[10px] text-muted-foreground">e.g. https://api.groq.com/openai/v1</p>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-foreground">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave empty if local/unauthenticated"
                  className="ui-input w-full font-mono text-sm"
                />
              </div>
            </form>

            {testResult && (
              <div className={`mt-4 p-3 text-xs rounded-md border max-w-lg flex items-start gap-2 ${testResult.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : null}
                {testResult.message}
              </div>
            )}
            
            {activeMessage && (
              <div className="mt-4 p-3 text-xs rounded-md bg-primary/10 border border-primary/20 text-primary flex items-start gap-2 max-w-lg">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {activeMessage}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-white/5 bg-white/5 flex justify-between items-center">
             <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTest}
                  className="ui-btn-secondary px-4 text-xs"
                  disabled={isTesting || isSaving}
                >
                  {isTesting ? "Testing..." : "Test Connection"}
                </button>
             </div>
             <div className="flex gap-2">
                <button
                  type="submit"
                  form="provider-form"
                  className="ui-btn-ghost px-4 text-xs"
                  disabled={isSaving}
                >
                  Save Profile
                </button>
                <button
                  type="button"
                  onClick={handleUseProfile}
                  className={`px-4 text-xs flex items-center gap-1.5 transition-colors ${
                    editingId === activeProviderId
                      ? "ui-btn-secondary opacity-80 cursor-default text-emerald-400 border border-emerald-500/30"
                      : "ui-btn-primary"
                  }`}
                  disabled={editingId === activeProviderId}
                >
                  {editingId === activeProviderId ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active Provider
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Use This Provider
                    </>
                  )}
                </button>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};
