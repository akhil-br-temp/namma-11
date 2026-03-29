type LivePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LivePage({ params }: LivePageProps) {
  const { id } = await params;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">Live Points</h2>
      <p className="mt-1 text-sm text-slate-600">Match ID: {id}</p>
      <p className="mt-2 text-sm text-slate-600">Realtime points and rank movement will be added once scoring cron and Supabase realtime are connected.</p>
    </section>
  );
}
