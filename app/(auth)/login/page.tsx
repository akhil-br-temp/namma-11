import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm text-slate-600">Loading login...</p></section>}>
      <LoginForm />
    </Suspense>
  );
}
