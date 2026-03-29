export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">{children}</main>;
}
