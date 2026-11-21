'use client';

import { useState, type FormEvent } from 'react';
import type { Session } from '../auth/types';
import type { Asset } from './types';
import { archiveDataAsset, createDataAsset } from './api';

type AssetForm = {
  name: string;
  system: string;
  ownerTeam: string;
  classification: string;
  description: string;
  dataCategories: string;
  dataSubjects: string;
};

const initialForm = (): AssetForm => ({
  name: '',
  system: '',
  ownerTeam: '',
  classification: 'internal',
  description: '',
  dataCategories: '',
  dataSubjects: '',
});

type InventoryPanelProps = {
  session: Session;
  filteredAssets: Asset[];
  canManage: boolean;
  loading: boolean;
  classificationFilter: string;
  statusFilter: string;
  onClassificationFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

export default function InventoryPanel({
  session,
  filteredAssets,
  canManage,
  loading,
  classificationFilter,
  statusFilter,
  onClassificationFilterChange,
  onStatusFilterChange,
  onRefresh,
  onError,
  onNotice,
}: InventoryPanelProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AssetForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function submitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await createDataAsset(session.organization.id, session.accessToken, {
        name: form.name,
        system: form.system,
        ownerTeam: form.ownerTeam,
        classification: form.classification,
        description: form.description,
        dataCategories: form.dataCategories.split(',').map((value) => value.trim()).filter(Boolean),
        dataSubjects: form.dataSubjects.split(',').map((value) => value.trim()).filter(Boolean),
      });
      setForm(initialForm());
      setFormOpen(false);
      onNotice('Data asset registered.');
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not save asset.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveAsset(asset: Asset) {
    if (!window.confirm('Archive "' + asset.name + '"? It will be removed from the active inventory.')) return;
    setArchivingId(asset._id);
    try {
      await archiveDataAsset(session.organization.id, session.accessToken, asset._id);
      onNotice('Asset archived.');
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not archive asset.');
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">SYSTEMS & PERSONAL DATA</p><h3>Registered data assets <span className="count">{filteredAssets.length}</span></h3></div>
        {canManage && <button className="primary" onClick={() => setFormOpen(!formOpen)}>＋ Register asset</button>}
      </div>
      <div className="filters">
        <label>Classification<select value={classificationFilter} onChange={(event) => onClassificationFilterChange(event.target.value)}><option value="all">All classifications</option><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
        <label>Status<select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
      </div>
      {formOpen && canManage && <form className="inline-form" onSubmit={submitAsset}>
        <label>Asset name<input required minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>System / application<input required maxLength={160} value={form.system} onChange={(event) => setForm({ ...form, system: event.target.value })} /></label>
        <label>Owner team<input required maxLength={120} value={form.ownerTeam} onChange={(event) => setForm({ ...form, ownerTeam: event.target.value })} /></label>
        <label>Classification<select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value })}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
        <label>Data categories <small>Comma-separated</small><input placeholder="Identity, contact, financial" value={form.dataCategories} onChange={(event) => setForm({ ...form, dataCategories: event.target.value })} /></label>
        <label>Data subjects <small>Comma-separated</small><input placeholder="Customers, employees" value={form.dataSubjects} onChange={(event) => setForm({ ...form, dataSubjects: event.target.value })} /></label>
        <label className="wide">Description<textarea rows={2} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save asset'}</button></div>
      </form>}
      {loading ? <p className="empty">Loading inventory…</p> : filteredAssets.length === 0 ? <p className="empty">No matching data assets. Adjust filters or register an asset.</p> : <div className="table-wrap"><table><thead><tr><th>ASSET / SYSTEM</th><th>OWNER</th><th>DATA CATEGORIES</th><th>CLASSIFICATION</th><th>STATUS</th>{canManage && <th />}</tr></thead><tbody>{filteredAssets.map((asset) => <tr key={asset._id}><td><strong>{asset.name}</strong><small>{asset.system}</small></td><td>{asset.ownerTeam}</td><td>{asset.dataCategories?.join(', ') || '—'}</td><td><span className={'tag ' + asset.classification}>{asset.classification}</span></td><td><span className={'status-dot ' + asset.status}>{asset.status}</span></td>{canManage && <td>{asset.status === 'active' && <button className="icon-button" title="Archive asset" disabled={archivingId === asset._id} onClick={() => void archiveAsset(asset)}>{archivingId === asset._id ? 'Archiving…' : 'Archive'}</button>}</td>}</tr>)}</tbody></table></div>}
    </section>
  );
}
