'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getRoleBadge } from '@/lib/roleBadge';

interface SendMoneyModalProps {
  targetUsername: string;
  targetRole?: string;
  balance: number;
  onConfirm: (amount: number, message: string) => void;
  onCancel: () => void;
}

export default function SendMoneyModal({
  targetUsername,
  targetRole,
  balance,
  onConfirm,
  onCancel,
}: SendMoneyModalProps) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetRoleBadge = getRoleBadge(targetRole);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAmount(value);
    setError('');
  }, []);

  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    const numericAmount = Number(amount);

    if (!amount || numericAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (numericAmount > balance) {
      setError('Insufficient balance');
      return;
    }

    setIsSubmitting(true);
    onConfirm(numericAmount, message);
  }, [amount, message, balance, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative w-[95vw] max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-cyan-700/40 bg-gradient-to-br from-slate-950/90 to-slate-900/90 p-6 shadow-2xl shadow-cyan-500/20"
        >
          {/* Close button */}
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 p-2 text-slate-400 hover:text-cyan-300 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-cyan-300">Send Money</h2>
            <div className="mt-1 text-sm text-slate-400 flex items-center gap-2 flex-wrap">
              <span>
                To <span className="font-semibold text-slate-200">{targetUsername}</span>
              </span>
              {targetRoleBadge ? <span className={targetRoleBadge.className}>{targetRoleBadge.label}</span> : null}
            </div>
          </div>

          {/* Amount section */}
          <div className="mb-5">
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-2">
              Amount (Balance: {balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} NVC)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={amount}
              onChange={handleAmountChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter amount..."
              className="h-11 w-full rounded-lg border border-cyan-600/40 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
              autoFocus
            />
          </div>

          {/* Message section */}
          <div className="mb-5">
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-2">
              Personal Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder="Add a personal message..."
              maxLength={200}
              rows={3}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              {message.length}/200 characters
            </p>
          </div>

          {/* Error message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-lg border border-red-500/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </motion.div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !amount}
              className="flex-1 h-11 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-gray-900 font-bold shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Processing...' : 'Send'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
