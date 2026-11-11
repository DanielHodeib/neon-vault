import type { ReactNode } from 'react';

import { PageHeader } from '../ui';

/**
 * Shared game layout. Phones/tablets: stage → controls → extras, stacked.
 * Laptops: stage and extras on the left, controls in a sticky column on the right.
 */
export function GameFrame({ title, subtitle, stage, controls, extra }: { title: string; subtitle?: string; stage: ReactNode; controls: ReactNode; extra?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{stage}</div>
        <aside className="space-y-4 lg:sticky lg:top-0 lg:row-span-2">{controls}</aside>
        {extra && <div className="min-w-0 space-y-4">{extra}</div>}
      </div>
    </>
  );
}
