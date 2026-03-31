import { LiveTracker } from "@/components/match/live-tracker";

type LivePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LivePage({ params }: LivePageProps) {
  const { id } = await params;

  return <LiveTracker matchId={id} />;
}
