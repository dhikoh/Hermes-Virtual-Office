"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/office";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Check if already authenticated or auth is disabled
  useEffect(() => {
    let canceled = false;

    async function checkAuthStatus() {
      try {
        const res = await fetch("/api/auth/status");
        if (!res.ok) throw new Error("Status check failed");
        const data = await res.json();

        if (canceled) return;

        if (!data.authEnabled || data.authenticated) {
          router.replace(redirectTarget);
          return;
        }
      } catch (err) {
        console.warn("[Auth Check Warning]", err);
      } finally {
        if (!canceled) {
          setIsCheckingAuth(false);
        }
      }
    }

    void checkAuthStatus();

    return () => {
      canceled = true;
    };
  }, [redirectTarget, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Mohon isi username dan password.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Gagal masuk. Periksa username dan password.");
          return;
        }

        // Successfully logged in
        router.replace(redirectTarget);
      } catch (err) {
        console.error("[Login Error]", err);
        setError("Gagal menghubungi server. Periksa koneksi Anda.");
      }
    });
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="font-mono text-xs uppercase tracking-widest text-slate-400">
            Verifying Security Gate...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background cyber grid & glow aesthetics */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.18),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.15),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#0f172a15_1px,transparent_1px),linear-gradient(to_bottom,#0f172a15_1px,transparent_1px)] bg-[size:24px_24px]" />

      <main className="relative z-10 w-full max-w-md">
        {/* Card Container */}
        <div className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/5">
          {/* Header Branding */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-mono tracking-wider text-cyan-300 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              HERMES VIRTUAL OFFICE
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Access Gate
            </h1>
            <p className="mt-1.5 text-xs text-slate-400 sm:text-sm">
              Autentikasi diperlukan untuk mengakses workspace dan kontrol agen.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-300 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-1"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block font-mono text-xs font-medium text-slate-300 uppercase tracking-wider"
              >
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 py-2.5 pr-4 pl-10 text-sm text-slate-100 placeholder-slate-500 shadow-inner transition-colors focus:border-cyan-400 focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block font-mono text-xs font-medium text-slate-300 uppercase tracking-wider"
              >
                Password / Access Key
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/60 py-2.5 pr-11 pl-10 text-sm text-slate-100 placeholder-slate-500 shadow-inner transition-colors focus:border-cyan-400 focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                Sesi tersimpan aman (30 hari)
              </span>
              <span className="font-mono text-[10px] text-slate-500 uppercase">
                v1.0.10
              </span>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="group relative mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all duration-200 hover:opacity-95 hover:shadow-cyan-500/35 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Kantor Virtual</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
            <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
              <Sparkles className="h-3 w-3 text-amber-400/80" />
              Hermes Virtual Office Operating System
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
