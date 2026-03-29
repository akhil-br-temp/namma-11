"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const nextPath = useMemo(() => searchParams.get("next") ?? "/dashboard", [searchParams]);

  const onEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  };

  const onGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Namma 11</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Join your private IPL league</h1>
      <p className="mt-2 text-sm text-slate-600">Sign in to create teams, set captain and vice-captain, and follow live points.</p>

      <button
        type="button"
        onClick={onGoogleLogin}
        disabled={loading}
        className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
      >
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-500">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={onEmailLogin} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-teal-600 transition focus:ring-2"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-teal-600 transition focus:ring-2"
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-teal-50 transition hover:bg-teal-800 disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
    </section>
  );
}
