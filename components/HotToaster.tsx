'use client';

import { Toaster } from 'react-hot-toast';

export default function HotToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3200,
        style: {
          background: '#1e293b',
          color: '#fff',
          border: '1px solid #334155',
          fontSize: '13px',
        },
      }}
    />
  );
}
