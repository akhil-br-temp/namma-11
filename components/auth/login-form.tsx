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
  const authError = useMemo(() => searchParams.get("authError"), [searchParams]);
  const callbackUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }, [nextPath]);
  const visibleMessage = message ?? (authError ? `Magic link failed: ${authError}` : null);

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

  const onEmailSignup = async () => {
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace(nextPath);
      router.refresh();
      return;
    }

    setMessage("Account created. Check your inbox for a confirmation link.");
    setLoading(false);
  };

  const onResendConfirmation = async () => {
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Confirmation email re-sent. Check inbox and spam folders.");
    setLoading(false);
  };

  const onMagicLink = async () => {
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Magic link sent. Check your inbox.");
    setLoading(false);
  };

  const onGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <section className="w-full rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 shadow-[0_20px_56px_rgba(0,0,0,0.45)]">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-500">Namma 11</p>
      <h1 className="display-heading text-3xl font-extrabold tracking-tight text-zinc-50">Join your private IPL league</h1>
      <p className="mt-2 text-sm text-zinc-300">Sign in to create teams, set captain and vice-captain, and follow live points.</p>

      <button
        type="button"
        onClick={onGoogleLogin}
        disabled={loading}
        className="mt-6 w-full rounded-xl border border-zinc-700 bg-zinc-900/65 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900 disabled:opacity-60"
      >
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-zinc-700" />
        <span className="text-xs text-zinc-400">or</span>
        <span className="h-px flex-1 bg-zinc-700" />
      </div>

      <form onSubmit={onEmailLogin} className="space-y-3">
        <label className="block text-sm font-medium text-zinc-200">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2.5 text-sm outline-none ring-red-500 transition focus:ring-2"
            required
          />
        </label>
        <label className="block text-sm font-medium text-zinc-200">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2.5 text-sm outline-none ring-red-500 transition focus:ring-2"
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-red-700 to-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-red-600 hover:to-red-500 disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          disabled={loading || !email || password.length < 6}
          onClick={onEmailSignup}
          className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-60"
        >
          Create account with email
        </button>

        <button
          type="button"
          disabled={loading || !email}
          onClick={onMagicLink}
          className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-60"
        >
          Send magic link
        </button>

        <button
          type="button"
          disabled={loading || !email}
          onClick={onResendConfirmation}
          className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-60"
        >
          Resend confirmation email
        </button>
      </form>

      {visibleMessage ? <p className="mt-3 text-sm text-rose-400">{visibleMessage}</p> : null}
    </section>
  );
}
