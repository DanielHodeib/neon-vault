import type { User } from '@prisma/client';
import { Clock, Gauge, TrendingUp, UserPlus } from 'lucide-react';
import { backupAction, cancelCountdownAction, restartAction, setMaintenanceAction } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { ActionForm, Empty, Section, SubmitButton } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { secondsUntil, serverInfo } from '@/lib/serverInfo';
import { Kpi } from './shared';

/** The last 50 admin actions: who did what to whom. */
export async function AuditLog() {
  const rows = await db.auditLog.findMany({ orderBy: { at: 'desc' }, take: 50 });
  return (
    <Section title="Protokoll">
      {rows.length === 0 ? (
        <Empty>Noch keine Einträge.</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
              <span className="font-medium">{r.actorName}</span>
              <span>{r.action}</span>
              {r.targetName && <span className="text-muted">→ {r.targetName}</span>}
              {r.detail && <span className="text-muted">({r.detail})</span>}
              <span className="num ml-auto text-xs text-faint">{timeAgo(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ServerTab({ actor }: { actor: User }) {
  const info = serverInfo();
  const isOwner = actor.role === 'OWNER';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Clock} label="Läuft seit" value={info.uptime} />
        <Kpi icon={Gauge} label="Arbeitsspeicher" value={`${info.memoryMb} MB`} hint={`Node ${info.node}`} />
        <Kpi icon={TrendingUp} label="Version" value={info.version?.split(' · ')[0] ?? '–'} hint={info.version?.split(' · ')[1]} />
        <Kpi icon={UserPlus} label="Online" value={hub.online.size} tone="win" />
      </div>

      {hub.countdown && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          <span>{hub.countdown.kind === 'restart' ? 'Neustart' : 'Wartung'} in {secondsUntil(hub.countdown.at)} Sekunden – alle sehen den Countdown.</span>
          <FormButton action={cancelCountdownAction} className="btn-secondary h-8 text-xs">Absagen</FormButton>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={hub.maintenance.on ? 'Wartungsmodus · aktiv' : 'Wartungsmodus'} pad>
          <ActionForm action={setMaintenanceAction} className="space-y-3">
            <input type="hidden" name="on" value={String(!hub.maintenance.on)} />
            {hub.maintenance.on ? (
              <p className="text-sm text-muted">
                Nur das Team kann gerade spielen.{hub.maintenance.endsAt && ` Angezeigtes Ende: ${new Date(hub.maintenance.endsAt).toLocaleString('de-DE')}.`}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="delay">Vorwarnung</label>
                  <select id="delay" className="input" name="delay" defaultValue="5">
                    <option value="0">Sofort</option>
                    <option value="1">1 Minute</option>
                    <option value="5">5 Minuten</option>
                    <option value="10">10 Minuten</option>
                    <option value="30">30 Minuten</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="minutes">Dauer (Min., optional)</label>
                  <input id="minutes" className="input num" name="minutes" type="number" min={0} placeholder="z. B. 15" />
                </div>
              </div>
            )}
            <SubmitButton className={hub.maintenance.on ? 'btn-primary' : 'btn-danger'}>{hub.maintenance.on ? 'Wartung beenden' : 'Wartung planen'}</SubmitButton>
          </ActionForm>
        </Section>

        <Section title="Neustart & Backup" pad>
          <div className="space-y-4">
            {isOwner && (
              <div>
                <p className="label">Server neu starten (mit Countdown für alle)</p>
                <div className="grid grid-cols-4 gap-2">
                  {[30, 60, 120, 300].map((s) => (
                    <FormButton key={s} action={restartAction.bind(null, s)} confirm={`Server in ${s} Sekunden neu starten?`} className="btn-secondary h-9 text-xs">
                      {s < 60 ? `${s} s` : `${s / 60} Min`}
                    </FormButton>
                  ))}
                </div>
                {!info.production && <p className="mt-1.5 text-xs text-faint">Lokal am Mac startet der Server danach nicht von selbst neu.</p>}
              </div>
            )}
            <div>
              <p className="label">Datenbank sichern</p>
              <FormButton action={backupAction} className="btn-secondary">Backup jetzt</FormButton>
              <p className="mt-1.5 text-xs text-faint">Automatisch täglich, die letzten 14 Tage bleiben.</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
