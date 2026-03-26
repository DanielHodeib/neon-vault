'use client';

import { AnimatePresence, motion } from 'framer-motion';

export default function AnnouncementOverlay({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.98 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
          className="fixed top-10 left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
        >
          <div className="max-w-[92vw] md:max-w-5xl bg-slate-900/90 backdrop-blur-md border-2 border-amber-400/60 shadow-[0_0_24px_rgba(251,191,36,0.35)] rounded-xl">
            <p className="text-xl md:text-2xl font-black uppercase tracking-[0.3em] text-amber-100 text-center px-10 py-4">
              {message}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
