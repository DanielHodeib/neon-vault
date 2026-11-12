import { WatchFriend } from '@/components/WatchFriend';

export async function generateMetadata({ params }: PageProps<'/watch/[username]'>) {
  return { title: `👀 ${decodeURIComponent((await params).username)}` };
}

export default async function WatchPage({ params }: PageProps<'/watch/[username]'>) {
  return <WatchFriend username={decodeURIComponent((await params).username)} />;
}
