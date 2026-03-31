import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="w-full rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"><p className="text-sm text-zinc-300">Loading login...</p></section>}>
      <LoginForm />
    </Suspense>
  );
}
