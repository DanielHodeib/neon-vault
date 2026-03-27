'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'react-hot-toast';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';

interface TicketListItem {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  user?: { username?: string };
  messages?: Array<{
    content: string;
    createdAt: string;
    isStaffReply: boolean;
  }>;
}

interface TicketMessage {
  id: string;
  content: string;
  isStaffReply: boolean;
  createdAt: string;
  senderId: string;
  sender?: {
    username?: string;
    role?: string;
  };
}

interface TicketThread {
  id: string;
  userId: string;
  subject: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  user?: { username?: string };
  messages: TicketMessage[];
}

const STAFF_ROLES = new Set(['SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER']);
const CATEGORY_OPTIONS = ['Account', 'Payments', 'Bug Report', 'Security', 'Abuse', 'Other'];

function statusTone(status: TicketStatus) {
  if (status === 'OPEN') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }
  if (status === 'IN_PROGRESS') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-200';
  }
  if (status === 'ANSWERED') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  }
  return 'border-slate-600 bg-slate-700/30 text-slate-300';
}

function formatWhen(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return parsed.toLocaleString();
}

export default function SupportPanel({
  socket,
  username,
  role,
}: {
  socket: Socket | null;
  username: string;
  role: string;
}) {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [thread, setThread] = useState<TicketThread | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState(CATEGORY_OPTIONS[0]);
  const [ticketDraft, setTicketDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isStaff = useMemo(() => STAFF_ROLES.has(String(role ?? '').toUpperCase()), [role]);
  const shouldShowAllTickets = useMemo(
    () => ['OWNER', 'ADMIN', 'SUPPORT'].includes(String(role ?? '').toUpperCase()),
    [role]
  );
  const [staffMode, setStaffMode] = useState(() => shouldShowAllTickets);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const endpoint = staffMode && isStaff ? '/api/support/admin/tickets' : '/api/support/tickets';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const payload = (await response.json()) as { tickets?: TicketListItem[]; error?: string };

      if (!response.ok) {
        toast.error(payload.error ?? 'Failed to load tickets.');
        return;
      }

      const next = payload.tickets ?? [];
      setTickets(next);

      if (next.length === 0) {
        setSelectedTicketId('');
        setThread(null);
        return;
      }

      if (!selectedTicketId || !next.some((ticket) => ticket.id === selectedTicketId)) {
        setSelectedTicketId(next[0].id);
      }
    } catch {
      toast.error('Support service unavailable.');
    } finally {
      setLoadingTickets(false);
    }
  }, [isStaff, selectedTicketId, staffMode]);

  const loadThread = useCallback(async (ticketId: string) => {
    if (!ticketId) {
      setThread(null);
      return;
    }

    setLoadingThread(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/messages`, { cache: 'no-store' });
      const payload = (await response.json()) as { ticket?: TicketThread; error?: string };

      if (!response.ok || !payload.ticket) {
        toast.error(payload.error ?? 'Could not load ticket thread.');
        return;
      }

      setThread(payload.ticket);
    } catch {
      toast.error('Failed to load ticket thread.');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      return;
    }

    void loadThread(selectedTicketId);
  }, [loadThread, selectedTicketId]);

  useEffect(() => {
    const liveSocket = socket;
    if (!liveSocket) {
      return;
    }

    const reloadHandler = () => {
      void loadTickets();
      if (selectedTicketId) {
        void loadThread(selectedTicketId);
      }
    };

    const replyHandler = (payload: { ticketId?: string; message?: string }) => {
      if (!payload?.ticketId) {
        return;
      }

      toast.success(payload.message ?? 'Support replied to your ticket.');
      void loadTickets();

      if (selectedTicketId === payload.ticketId) {
        void loadThread(payload.ticketId);
      }
    };

    liveSocket.on('support_ticket_created', reloadHandler);
    liveSocket.on('support_ticket_message', reloadHandler);
    liveSocket.on('support_ticket_status_updated', reloadHandler);
    liveSocket.on('ticket_reply_received', replyHandler);

    return () => {
      liveSocket.off('support_ticket_created', reloadHandler);
      liveSocket.off('support_ticket_message', reloadHandler);
      liveSocket.off('support_ticket_status_updated', reloadHandler);
      liveSocket.off('ticket_reply_received', replyHandler);
    };
  }, [loadThread, loadTickets, selectedTicketId, socket]);

  const handleCreateTicket = async () => {
    const subject = subjectDraft.trim();
    const category = categoryDraft.trim();
    const content = ticketDraft.trim();

    if (!subject || !category || !content) {
      toast.error('Subject, category and message are required.');
      return;
    }

    setSubmitting(true);

    try {
      if (socket?.connected) {
        await new Promise<void>((resolve) => {
          socket.emit(
            'create_ticket',
            { subject, category, content },
            (response: { ok?: boolean; error?: string; ticket?: { id?: string } }) => {
              if (!response?.ok) {
                toast.error(response?.error ?? 'Could not create ticket.');
                resolve();
                return;
              }

              const createdId = String(response.ticket?.id ?? '');
              if (createdId) {
                setSelectedTicketId(createdId);
              }

              toast.success('Ticket created.');
              setCreateOpen(false);
              setSubjectDraft('');
              setCategoryDraft(CATEGORY_OPTIONS[0]);
              setTicketDraft('');
              void loadTickets();
              if (createdId) {
                void loadThread(createdId);
              }
              resolve();
            }
          );
        });
      } else {
        const response = await fetch('/api/support/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, category, content }),
        });

        const payload = (await response.json()) as { ticket?: { id?: string }; error?: string };
        if (!response.ok) {
          toast.error(payload.error ?? 'Could not create ticket.');
          return;
        }

        const createdId = String(payload.ticket?.id ?? '');
        if (createdId) {
          setSelectedTicketId(createdId);
          void loadThread(createdId);
        }

        toast.success('Ticket created.');
        setCreateOpen(false);
        setSubjectDraft('');
        setCategoryDraft(CATEGORY_OPTIONS[0]);
        setTicketDraft('');
        void loadTickets();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    const ticketId = selectedTicketId;
    const content = messageInput.trim();

    if (!ticketId || !content) {
      return;
    }

    setSubmitting(true);

    try {
      if (socket?.connected) {
        await new Promise<void>((resolve) => {
          socket.emit('send_ticket_message', { ticketId, content }, (response: { ok?: boolean; error?: string }) => {
            if (!response?.ok) {
              toast.error(response?.error ?? 'Message not sent.');
              resolve();
              return;
            }

            setMessageInput('');
            void loadTickets();
            void loadThread(ticketId);
            resolve();
          });
        });
      } else {
        const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          toast.error(payload.error ?? 'Message not sent.');
          return;
        }

        setMessageInput('');
        void loadTickets();
        void loadThread(ticketId);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (status: TicketStatus) => {
    if (!selectedTicketId || !isStaff) {
      return;
    }

    const ticketId = selectedTicketId;
    setSubmitting(true);

    try {
      if (socket?.connected) {
        await new Promise<void>((resolve) => {
          socket.emit('update_ticket_status', { ticketId, status }, (response: { ok?: boolean; error?: string }) => {
            if (!response?.ok) {
              toast.error(response?.error ?? 'Status update failed.');
              resolve();
              return;
            }

            void loadTickets();
            void loadThread(ticketId);
            resolve();
          });
        });
      } else {
        const response = await fetch(`/api/support/tickets/${ticketId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          toast.error(payload.error ?? 'Status update failed.');
          return;
        }

        void loadTickets();
        void loadThread(ticketId);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Enterprise Support</p>
          <h2 className="text-lg font-bold text-white">Tickets & Conversation Center</h2>
        </div>
        <div className="flex items-center gap-2">
          {isStaff ? (
            <button
              type="button"
              onClick={() => setStaffMode((current) => !current)}
              disabled={shouldShowAllTickets}
              className={`h-9 rounded-lg border px-3 text-xs font-bold uppercase transition ${shouldShowAllTickets ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 cursor-default' : staffMode ? 'border-rose-500/40 bg-rose-500/10 text-rose-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}
            >
              {shouldShowAllTickets ? 'All Tickets' : staffMode ? 'Staff View' : 'My Tickets'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-500/20"
          >
            New Ticket
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <aside className="w-full shrink-0 rounded-xl border border-slate-800 bg-slate-950/60 lg:w-[340px]">
          <div className="border-b border-slate-800 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-400">
            {staffMode ? 'All Tickets' : 'Your Tickets'}
          </div>
          <div className="max-h-[38vh] overflow-y-auto lg:max-h-none lg:h-[calc(100%-37px)]">
            {loadingTickets ? <p className="px-3 py-4 text-sm text-slate-400">Loading tickets...</p> : null}
            {!loadingTickets && tickets.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No tickets yet.</p> : null}
            {tickets.map((ticket) => {
              const isActive = ticket.id === selectedTicketId;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full border-b border-slate-800 px-3 py-3 text-left transition ${isActive ? 'bg-slate-800/70' : 'hover:bg-slate-800/35'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-100">{ticket.subject}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone(ticket.status)}`}>{ticket.status.replace('_', ' ')}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {ticket.category}
                    {staffMode && ticket.user?.username ? ` - ${ticket.user.username}` : ''}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500">{ticket.messages?.[0]?.content ?? 'No messages yet.'}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-950/55">
          {!selectedTicketId ? (
            <div className="m-auto max-w-md px-6 text-center text-sm text-slate-500">Select a ticket to review the conversation.</div>
          ) : loadingThread ? (
            <p className="px-4 py-4 text-sm text-slate-400">Loading thread...</p>
          ) : thread ? (
            <>
              <div className="border-b border-slate-800 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-white">{thread.subject}</h3>
                    <p className="text-xs text-slate-400">
                      {thread.category}
                      {staffMode && thread.user?.username ? ` - ${thread.user.username}` : ''}
                      {' - '}Opened {formatWhen(thread.createdAt)}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone(thread.status)}`}>{thread.status.replace('_', ' ')}</span>
                </div>
                {isStaff ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'] as TicketStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          void handleStatusUpdate(status);
                        }}
                        disabled={submitting || thread.status === status}
                        className={`h-8 rounded-lg border px-3 text-[11px] font-bold uppercase transition ${thread.status === status ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
                      >
                        {status.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.messages.map((message) => {
                  const mine = String(message.sender?.username ?? '').trim().toLowerCase() === username.trim().toLowerCase();
                  const senderName = message.sender?.username ?? (message.isStaffReply ? 'Support' : 'You');
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${message.isStaffReply ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-100' : mine ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border border-slate-700 bg-slate-800 text-slate-200'}`}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-300">{senderName}</p>
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{formatWhen(message.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-800 p-3">
                <div className="flex gap-2">
                  <textarea
                    value={messageInput}
                    onChange={(event) => setMessageInput(event.target.value)}
                    placeholder={isStaff ? 'Reply as support staff...' : 'Write your message to support...'}
                    className="h-20 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    disabled={submitting || !messageInput.trim()}
                    onClick={() => {
                      void handleSendMessage();
                    }}
                    className="h-10 self-end rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-60"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="m-auto px-6 text-center text-sm text-slate-500">Ticket thread unavailable.</div>
          )}
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Create Support Ticket</h3>
            <p className="mt-1 text-sm text-slate-400">Tell us what happened and we will respond as quickly as possible.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Subject</label>
                <input
                  value={subjectDraft}
                  onChange={(event) => setSubjectDraft(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  placeholder="Short summary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Category</label>
                <select
                  value={categoryDraft}
                  onChange={(event) => setCategoryDraft(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Message</label>
                <textarea
                  value={ticketDraft}
                  onChange={(event) => setTicketDraft(event.target.value)}
                  className="h-36 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  placeholder="Describe the issue in detail"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 rounded-lg border border-slate-700 px-3 text-xs font-bold uppercase text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  void handleCreateTicket();
                }}
                className="h-10 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-bold uppercase text-cyan-200 disabled:opacity-60"
              >
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
