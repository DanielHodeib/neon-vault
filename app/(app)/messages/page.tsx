import { Messages } from '@/components/Messages';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Nachrichten' };

export default async function MessagesPage({ searchParams }: PageProps<'/messages'>) {
  const { u } = await searchParams;
  return (
    <>
      <PageHeader title="Nachrichten" subtitle="Private Nachrichten mit deinen Freunden." />
      <Messages initial={typeof u === 'string' ? u : null} />
    </>
  );
}
