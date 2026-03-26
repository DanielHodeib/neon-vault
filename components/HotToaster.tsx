'use client';

import { Toaster } from 'react-hot-toast';

export default function HotToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3200,
        style: {
          background: '#0f172a',
          color: '#e2e8f0',
          border: '1px solid #1e293b',
          fontSize: '13px',
        },
      }}
    />
  );
}
