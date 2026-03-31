export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="w-full rounded-[2rem] border border-zinc-800/80 bg-zinc-950/70 p-2 shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        {children}
      </div>
    </main>
  );
}
