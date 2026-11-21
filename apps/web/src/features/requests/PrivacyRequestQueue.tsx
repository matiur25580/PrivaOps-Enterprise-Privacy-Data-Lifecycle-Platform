'use client';

import { useState, type FormEvent } from 'react';
import { dateLabel, label } from '../../lib/format';
import { terminalStatuses } from './domain';
import type { Session } from '../auth/types';
import type { Member } from '../organization/types';
import type { RequestEvent, RequestItem, RequestUpdate } from './types';
import { createPrivacyRequest, getPrivacyRequestEvents, updatePrivacyRequest } from './api';
import RequestDetailModal from './RequestDetailModal';

type PrivacyRequestQueueProps = {
  session: Session;
  requests: RequestItem[];
  filteredRequests: RequestItem[];
  members: Member[];
  canManage: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const initialUpdate = (item: RequestItem): RequestUpdate => ({
  status: '',
  identityVerificationStatus: item.identityVerificationStatus ?? 'pending',
  resolutionSummary: item.resolutionSummary ?? '',
  rejectionReason: item.rejectionReason ?? '',
  assignedTo: item.assignedTo ?? '',
  dueAt: item.dueAt ? item.dueAt.slice(0, 10) : '',
});

export default function PrivacyRequestQueue({
  session,
  requests,
  filteredRequests,
  members,
  canManage,
  onRefresh,
  onError,
  onNotice,
}: PrivacyRequestQueueProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ requestType: 'access', description: '' });
  const [saving, setSaving] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [requestEvents, setRequestEvents] = useState<RequestEvent[]>([]);
  const [eventBusy, setEventBusy] = useState(false);
  const [requestUpdate, setRequestUpdate] = useState<RequestUpdate>({
    status: '',
    identityVerificationStatus: 'pending',
    resolutionSummary: '',
    rejectionReason: '',
    assignedTo: '',
    dueAt: '',
  });

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await createPrivacyRequest(session.organization.id, session.accessToken, form);
      setForm({ requestType: 'access', description: '' });
      setFormOpen(false);
      onNotice('Privacy request submitted.');
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not submit request.');
    } finally {
      setSaving(false);
    }
  }

  async function inspectRequest(item: RequestItem) {
    setSelectedRequest(item);
    setRequestEvents([]);
    setRequestUpdate(initialUpdate(item));
    setEventBusy(true);
    try {
      const result = await getPrivacyRequestEvents(session.organization.id, session.accessToken, item._id);
      setRequestEvents(result.events);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load request history.');
    } finally {
      setEventBusy(false);
    }
  }

  async function saveRequestUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    const payload: Record<string, string | null> = {
      identityVerificationStatus: requestUpdate.identityVerificationStatus,
      assignedTo: requestUpdate.assignedTo || null,
      dueAt: requestUpdate.dueAt ? new Date(requestUpdate.dueAt + 'T23:59:59').toISOString() : null,
    };
    if (requestUpdate.status) payload.status = requestUpdate.status;
    if (requestUpdate.status === 'fulfilled' || selectedRequest.status === 'in_progress' || selectedRequest.status === 'awaiting_information') {
      payload.resolutionSummary = requestUpdate.resolutionSummary;
    }
    if (requestUpdate.status === 'rejected') payload.rejectionReason = requestUpdate.rejectionReason;
    try {
      await updatePrivacyRequest(session.organization.id, session.accessToken, selectedRequest._id, payload);
      setSelectedRequest(null);
      onNotice('Privacy request workflow updated.');
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update request.');
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">DATA SUBJECT RIGHTS OPERATIONS</p><h3>Privacy request queue <span className="count">{filteredRequests.length}</span></h3></div>
          <button className="primary" onClick={() => setFormOpen(!formOpen)}>＋ New request</button>
        </div>
        {formOpen && <form className="inline-form" onSubmit={submitRequest}>
          <label>Request type<select value={form.requestType} onChange={(event) => setForm({ ...form, requestType: event.target.value })}><option value="access">Access</option><option value="correction">Correction</option><option value="erasure">Erasure</option><option value="portability">Portability</option><option value="withdraw_consent">Withdraw consent</option><option value="restriction">Restriction</option><option value="objection">Objection</option><option value="other">Other</option></select></label>
          <label className="wide">Description<textarea rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Provide context needed to triage this request. Avoid including unnecessary sensitive details." /></label>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></div>
        </form>}
        {filteredRequests.length === 0 ? <p className="empty">No matching privacy requests.</p> : <div className="request-list">{filteredRequests.map((item) => <article key={item._id}>
          <div className="request-main"><span className="request-type">{label(item.requestType)}</span><strong>{item.description || 'No description provided'}</strong><small>Created {dateLabel(item.createdAt)}{item.dueAt ? ' · Due ' + dateLabel(item.dueAt) : ' · Due date not set'}</small></div>
          <div className="request-meta"><span className={'tag state-' + item.status}>{label(item.status)}</span>{item.dueAt && new Date(item.dueAt).getTime() < Date.now() && !terminalStatuses.includes(item.status) && <span className="warning-text">Overdue</span>}<button className="text-action" onClick={() => void inspectRequest(item)}>Details →</button></div>
        </article>)}</div>}
        <p className="footnote">{requests.length} request{requests.length === 1 ? '' : 's'} in the loaded organization scope. Workflow changes are validated by the API.</p>
      </section>
      {selectedRequest && <RequestDetailModal
        request={selectedRequest}
        events={requestEvents}
        eventBusy={eventBusy}
        canManage={canManage}
        members={members}
        update={requestUpdate}
        setUpdate={setRequestUpdate}
        onClose={() => setSelectedRequest(null)}
        onSave={saveRequestUpdate}
      />}
    </>
  );
}
