'use client';

import { Toaster as HotToaster } from 'react-hot-toast';

export const Toaster = () => (
  <HotToaster position="bottom-right" toastOptions={{ style: { background: '#0d1220', color: '#e2e8f0', border: '1px solid #1c2438' } }} />
);
