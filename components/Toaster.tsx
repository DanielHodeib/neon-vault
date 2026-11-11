'use client';

import { Toaster as HotToaster } from 'react-hot-toast';

export const Toaster = () => (
  <HotToaster
    position="top-center"
    toastOptions={{
      style: { background: '#171a1f', color: '#e8eaed', border: '1px solid #2f343c', fontSize: 14, borderRadius: 10 },
      success: { iconTheme: { primary: '#4ade80', secondary: '#0a0b0d' } },
    }}
  />
);
