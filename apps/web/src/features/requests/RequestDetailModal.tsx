import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { dateLabel, label } from '../../lib/format';
import { statusTransitions, terminalStatuses } from './domain';
import type { Member } from '../organization/types';
import type { RequestEvent, RequestItem, RequestUpdate } from './types';

type RequestDetailModalProps = {
  request: RequestItem;
  events: RequestEvent[];
  eventBusy: boolean;
  canManage: boolean;
  members: Member[];
  update: RequestUpdate;
  setUpdate: Dispatch<SetStateAction<RequestUpdate>>;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

export default function RequestDetailModal({
  request,
  events,
  eventBusy,
  canManage,
  members,
  update,
  setUpdate,
  onClose,
  onSave,
}: RequestDetailModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">REQUEST DETAIL</p>
            <h2 id="request-detail-title">{label(request.requestType)} request</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close details">×</button>
        </div>

        <div className="detail-grid">
          <div><small>Current status</small><strong>{label(request.status)}</strong></div>
          <div><small>Identity verification</small><strong>{label(request.identityVerificationStatus ?? 'pending')}</strong></div>
          <div><small>Submitted</small><strong>{dateLabel(request.createdAt)}</strong></div>
          <div><small>Due date</small><strong>{dateLabel(request.dueAt)}</strong></div>
        </div>

        <div className="detail-description">
          <small>Request description</small>
          <p>{request.description || 'No description provided.'}</p>
        </div>

        <div className="timeline">
          <h3>Request history</h3>
          {eventBusy ? (
            <p className="empty">Loading history…</p>
          ) : (
            events.map((item) => (
              <article key={item._id}>
                <span />
                <div>
                  <strong>{label(item.action)}</strong>
                  <small>{item.changedFields.map(label).join(', ')}</small>
                  <time>{new Date(item.createdAt).toLocaleString()}</time>
                </div>
              </article>
            ))
          )}
        </div>

        {canManage && !terminalStatuses.includes(request.status) && (
          <form className="inline-form modal-form" onSubmit={onSave}>
            <p className="eyebrow wide">WORKFLOW ACTION</p>
            <label>
              Identity verification
              <select
                value={update.identityVerificationStatus}
                onChange={(event) => setUpdate({ ...update, identityVerificationStatus: event.target.value })}
              >
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label>
              Next status
              <select
                value={update.status}
                onChange={(event) => setUpdate({ ...update, status: event.target.value })}
              >
                <option value="">Keep current status</option>
                {(statusTransitions[request.status] ?? []).map((value) => (
                  <option key={value} value={value}>{label(value)}</option>
                ))}
              </select>
            </label>
            <label>
              Assigned owner
              <select
                value={update.assignedTo}
                onChange={(event) => setUpdate({ ...update, assignedTo: event.target.value })}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.fullName} · {member.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operational due date
              <input
                type="date"
                value={update.dueAt}
                onChange={(event) => setUpdate({ ...update, dueAt: event.target.value })}
              />
            </label>
            {update.status === 'fulfilled' && (
              <label className="wide">
                Resolution summary
                <textarea
                  required
                  rows={2}
                  value={update.resolutionSummary}
                  onChange={(event) => setUpdate({ ...update, resolutionSummary: event.target.value })}
                />
              </label>
            )}
            {update.status === 'rejected' && (
              <label className="wide">
                Rejection reason
                <textarea
                  required
                  rows={2}
                  value={update.rejectionReason}
                  onChange={(event) => setUpdate({ ...update, rejectionReason: event.target.value })}
                />
              </label>
            )}
            <div className="form-actions">
              <button type="button" className="secondary" onClick={onClose}>Close</button>
              <button className="primary">Save workflow update</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
