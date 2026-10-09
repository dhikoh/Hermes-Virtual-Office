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
};

export const ApiSettingsModal = ({ onClose }: ApiSettingsModalProps) => {
  const { sendCommand } = useGateway();
  
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  
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
        if (res.providers.length > 0 && !editingId) {
          handleEdit(res.providers[0]);
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
        if (editingId === id) {
          if (res.providers.length > 0) handleEdit(res.providers[0]);
          else handleAddNew();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTestResult(null);
    setActiveMessage("");
    
    try {
      const provider: Provider = {
        id: editingId || "new_" + Date.now(),
        name, url: apiUrl, key: apiKey
      };
      const res = await sendCommand("config.providers.save", { provider });
      if (res.ok && res.providers) {
        setProviders(res.providers);
        setEditingId(provider.id);
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
    try {
      const res = await sendCommand("config.test", { apiUrl, apiKey });
      if (res.success) {
        setTestResult({ ok: true, message: `Success! Found ${res.count} models.` });
      } else {
        setTestResult({ ok: false, message: res.error || "Connection failed" });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || "Failed to test connection" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleUseProfile = async () => {
    try {
      const res = await sendCommand("config.update", { apiUrl, apiKey });
      if (res.ok) {
        setActiveMessage("This provider is now ACTIVE!");
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
            {providers.map(p => (
              <div 
                key={p.id} 
                className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${editingId === p.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}`}
                onClick={() => handleEdit(p)}
              >
                <div className="truncate">
                  <div className={`text-sm font-semibold truncate ${editingId === p.id ? 'text-primary' : 'text-foreground'}`}>{p.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{p.url}</div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-400 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
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
            <h2 className="text-lg font-bold tracking-tight text-foreground mb-1">Edit Provider Profile</h2>
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
                  className="ui-btn-primary px-4 text-xs flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Use This Provider
                </button>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};
