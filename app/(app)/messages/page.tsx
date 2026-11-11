import { Messages } from '@/components/Messages';
import { PageHeader } from '@/components/ui';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Nachrichten') };
}

export default async function MessagesPage({ searchParams }: PageProps<'/messages'>) {
  const { u } = await searchParams;
  return (
    <>
      <PageHeader title="Nachrichten" subtitle="Private Nachrichten mit deinen Freunden." />
      <Messages initial={typeof u === 'string' ? u : null} />
    </>
  );
}
