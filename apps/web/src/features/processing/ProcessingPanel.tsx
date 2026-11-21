'use client';

import { useState, type FormEvent } from 'react';
import type { Session } from '../auth/types';
import type { Asset } from '../inventory/types';
import type { Activity } from './types';
import { createProcessingActivity } from './api';
import { label } from '../../lib/format';

type ActivityForm = {
  name: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string;
  dataSubjects: string;
  systems: string;
  assetIds: string[];
  retentionPeriodDays: string;
};

const initialForm = (): ActivityForm => ({
  name: '',
  purpose: '',
  legalBasis: 'consent',
  dataCategories: '',
  dataSubjects: '',
  systems: '',
  assetIds: [],
  retentionPeriodDays: '365',
});

type ProcessingPanelProps = {
  session: Session;
  assets: Asset[];
  activities: Activity[];
  canManage: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export default function ProcessingPanel({
  session,
  assets,
  activities,
  canManage,
  onRefresh,
  onError,
  onNotice,
}: ProcessingPanelProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ActivityForm>(initialForm);
  const [saving, setSaving] = useState(false);

  async function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const retention = form.retentionPeriodDays.trim() ? Number(form.retentionPeriodDays) : null;
      await createProcessingActivity(session.organization.id, session.accessToken, {
        name: form.name,
        purpose: form.purpose,
        legalBasis: form.legalBasis,
        dataCategories: form.dataCategories.split(',').map((value) => value.trim()).filter(Boolean),
        dataSubjects: form.dataSubjects.split(',').map((value) => value.trim()).filter(Boolean),
        systems: form.systems.split(',').map((value) => value.trim()).filter(Boolean),
        assetIds: form.assetIds,
        retentionPeriodDays: retention,
      });
      setForm(initialForm());
      setFormOpen(false);
      onNotice('Processing activity recorded.');
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not save processing activity.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">RECORD OF PROCESSING ACTIVITIES</p><h3>Processing register <span className="count">{activities.length}</span></h3></div>
        {canManage && <button className="primary" onClick={() => setFormOpen(!formOpen)}>＋ Add activity</button>}
      </div>
      {formOpen && canManage && <form className="inline-form" onSubmit={submitActivity}>
        <label>Activity name<input required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Legal basis<select value={form.legalBasis} onChange={(event) => setForm({ ...form, legalBasis: event.target.value })}><option value="consent">Consent</option><option value="contract">Contract</option><option value="legal_obligation">Legal obligation</option><option value="legitimate_use">Legitimate use</option><option value="public_function">Public function</option><option value="other">Other / review required</option></select></label>
        <label className="wide">Purpose<input required minLength={5} maxLength={1000} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="Describe the operational purpose of this processing" /></label>
        <label>Data categories<input placeholder="Identity, contact, usage" value={form.dataCategories} onChange={(event) => setForm({ ...form, dataCategories: event.target.value })} /></label>
        <label>Data subjects<input placeholder="Customers, employees" value={form.dataSubjects} onChange={(event) => setForm({ ...form, dataSubjects: event.target.value })} /></label>
        <label>Systems<input placeholder="CRM, billing platform" value={form.systems} onChange={(event) => setForm({ ...form, systems: event.target.value })} /></label>
        <label>Linked data assets <small>Optional — select one or more active assets</small><select multiple value={form.assetIds} onChange={(event) => setForm({ ...form, assetIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}>{assets.filter((asset) => asset.status === 'active').map((asset) => <option key={asset._id} value={asset._id}>{asset.name} · {asset.system}</option>)}</select></label>
        <label>Retention period (days)<input type="number" min={1} max={36500} value={form.retentionPeriodDays} onChange={(event) => setForm({ ...form, retentionPeriodDays: event.target.value })} /></label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save processing activity'}</button></div>
      </form>}
      {activities.length === 0 ? <p className="empty">No processing activities recorded yet. Add the first activity to build your processing register.</p> : <div className="table-wrap"><table><thead><tr><th>PROCESSING ACTIVITY</th><th>PURPOSE</th><th>LEGAL BASIS</th><th>SYSTEMS</th><th>RETENTION</th><th>STATUS</th></tr></thead><tbody>{activities.map((activity) => <tr key={activity._id}><td><strong>{activity.name}</strong><small>{activity.dataCategories?.join(', ') || 'Categories not recorded'}</small></td><td className="purpose-cell">{activity.purpose}</td><td><span className="tag">{label(activity.legalBasis)}</span></td><td>{activity.systems.join(', ') || '—'}</td><td>{activity.retentionPeriodDays ? activity.retentionPeriodDays + ' days' : <span className="warning-text">Not recorded</span>}</td><td><span className={'status-dot ' + activity.status}>{label(activity.status)}</span></td></tr>)}</tbody></table></div>}
      <p className="footnote">Legal basis and retention entries are operational records, not legal determinations. Have qualified reviewers validate applicability.</p>
    </section>
  );
}
