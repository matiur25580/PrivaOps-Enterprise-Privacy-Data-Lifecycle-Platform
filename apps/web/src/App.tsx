import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type User = { id: string; fullName: string; email: string };
type Org = { id: string; name: string; slug?: string; role: string };
type Session = { user: User; organization: Org; accessToken: string };
type MfaSetup = { secret: string; otpauthUri: string; instructions: string };
type Asset = {
  _id: string; name: string; description?: string; system: string; ownerTeam: string;
  classification: string; dataCategories?: string[]; dataSubjects?: string[]; status: string;
  updatedAt?: string;
};
type Activity = {
  _id: string; name: string; purpose: string; legalBasis: string; dataCategories: string[];
  dataSubjects: string[]; systems: string[]; assetIds: string[]; retentionPeriodDays: number | null;
  status: string; updatedAt?: string;
};
type RequestItem = {
  _id: string; requestType: string; description: string; status: string; createdAt: string;
  dueAt?: string | null; identityVerificationStatus?: string; resolutionSummary?: string;
  rejectionReason?: string; assignedTo?: string | null;
};
type AuditItem = {
  _id: string; action: string; resourceType: string; resourceId: string;
  changedFields: string[]; createdAt: string;
  actorId?: { fullName?: string; email?: string } | string;
};
type RequestEvent = { _id: string; action: string; changedFields: string[]; createdAt: string; actorId?: string };
type Member = { user: { id: string; fullName: string; email: string }; role: string };

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
let activeAccessToken: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;

async function refreshAccessToken(): Promise<string | undefined> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(API + '/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        const body = await response.json() as { data?: { accessToken?: string } };
        activeAccessToken = body.data?.accessToken;
        return activeAccessToken;
      })
      .catch(() => undefined)
      .finally(() => { refreshInFlight = undefined; });
  }
  return refreshInFlight;
}

async function call<T>(path: string, token?: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const currentToken = activeAccessToken || token;
  if (currentToken) headers.set('Authorization', 'Bearer ' + currentToken);
  const response = await fetch(API + path, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const nextToken = await refreshAccessToken();
    if (nextToken) return call<T>(path, nextToken, init, false);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || 'Request failed (' + response.status + ')');
  return body.data as T;
}

function csvDownload(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [columns.map(quote).join(','), ...rows.map((row) => columns.map((key) => quote(row[key])).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

const terminalStatuses = ['fulfilled', 'rejected', 'withdrawn', 'closed'];
const statusTransitions: Record<string, string[]> = {
  submitted: ['identity_verification', 'in_progress', 'withdrawn'],
  identity_verification: ['in_progress', 'awaiting_information', 'rejected', 'withdrawn'],
  in_progress: ['awaiting_information', 'fulfilled', 'rejected', 'withdrawn'],
  awaiting_information: ['in_progress', 'fulfilled', 'rejected', 'withdrawn'],
  fulfilled: ['closed'], rejected: ['closed'], withdrawn: ['closed'], closed: [],
};
const label = (value: string) => value.replaceAll('_', ' ');
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<'overview' | 'assets' | 'processing' | 'requests' | 'activity' | 'security'>('overview');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRecoveryMode, setMfaRecoveryMode] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [recoveryRemaining, setRecoveryRemaining] = useState(0);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [emailFlow, setEmailFlow] = useState<'default' | 'forgot' | 'reset' | 'verifyPending' | 'verifying'>('default');
  const [actionToken, setActionToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const actionHandled = useRef(false);
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [requestEvents, setRequestEvents] = useState<RequestEvent[]>([]);
  const [eventBusy, setEventBusy] = useState(false);
  const [requestUpdate, setRequestUpdate] = useState({ status: '', identityVerificationStatus: 'pending', resolutionSummary: '', rejectionReason: '', assignedTo: '', dueAt: '' });
  const [auth, setAuth] = useState({ fullName: '', email: '', password: '', organizationName: '' });
  const [asset, setAsset] = useState({ name: '', system: '', ownerTeam: '', classification: 'internal', description: '', dataCategories: '', dataSubjects: '' });
  const [activity, setActivity] = useState({ name: '', purpose: '', legalBasis: 'consent', dataCategories: '', dataSubjects: '', systems: '', assetIds: '', retentionPeriodDays: '365' });
  const [request, setRequest] = useState({ requestType: 'access', description: '' });

  const canManage = session?.organization.role === 'owner' || session?.organization.role === 'admin';
  const orgBase = session ? '/organizations/' + encodeURIComponent(session.organization.id) : '';

  const load = useCallback(async (current: Session, search = '') => {
    setBusy(true); setError('');
    const base = '/organizations/' + encodeURIComponent(current.organization.id);
    const params = new URLSearchParams({ limit: '100' });
    if (search.trim()) params.set('q', search.trim());
    const requestPath = base + '/privacy-requests?limit=100';
    const tasks = await Promise.allSettled([
      call<{ items: Asset[] }>(base + '/data-assets?' + params, current.accessToken),
      call<{ items: Activity[] }>(base + '/processing-activities?' + params, current.accessToken),
      call<{ items: RequestItem[] }>(requestPath, current.accessToken)
        .catch(() => call<{ items: RequestItem[] }>(base + '/privacy-requests/mine?limit=100', current.accessToken)),
      current.organization.role === 'owner' || current.organization.role === 'admin'
        ? call<{ items: AuditItem[] }>(base + '/audit-events?' + params, current.accessToken)
        : Promise.resolve({ items: [] as AuditItem[] }),
      current.organization.role === 'owner' || current.organization.role === 'admin'
        ? call<{ members: Member[] }>(base + '/members', current.accessToken)
        : Promise.resolve({ members: [] as Member[] }),
    ]);
    const messages: string[] = [];
    if (tasks[0].status === 'fulfilled') setAssets(tasks[0].value.items);
    else messages.push('Data inventory: ' + (tasks[0].reason instanceof Error ? tasks[0].reason.message : 'unavailable'));
    if (tasks[1].status === 'fulfilled') setActivities(tasks[1].value.items);
    else messages.push('Processing register: ' + (tasks[1].reason instanceof Error ? tasks[1].reason.message : 'unavailable'));
    if (tasks[2].status === 'fulfilled') setRequests(tasks[2].value.items);
    else messages.push('Privacy requests: ' + (tasks[2].reason instanceof Error ? tasks[2].reason.message : 'unavailable'));
    if (tasks[3].status === 'fulfilled') setAudit(tasks[3].value.items);
    else setAudit([]);
    if (tasks[4].status === 'fulfilled') setMembers(tasks[4].value.members);
    else setMembers([]);
    if (messages.length) setError(messages.join(' · '));
    setBusy(false);
  }, []);

  useEffect(() => {
    let live = true;
    void refreshAccessToken().then(async (token) => {
      if (!token) return;
      const me = await call<{ user: User; organization: Org }>('/auth/me', token);
      const context = await call<{ organization: { id: string; name: string; slug: string }; membership: { role: string } }>(
        '/organizations/' + encodeURIComponent(me.organization.id) + '/context', token,
      );
      if (live) setSession({ user: me.user, organization: { ...context.organization, role: context.membership.role }, accessToken: token });
    }).catch(() => undefined).finally(() => { if (live) setBooting(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => { if (session) void load(session, query); }, [session, load]);

  useEffect(() => {
    if (actionHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verifyEmail');
    const resetToken = params.get('resetPassword');
    if (verifyToken) {
      actionHandled.current = true;
      setEmailFlow('verifying');
      void call<{ verified: boolean }>('/auth/email/verify', undefined, { method: 'POST', body: JSON.stringify({ token: verifyToken }) })
        .then(() => { setNotice('Email verified successfully. You can now sign in.'); setEmailFlow('default'); window.history.replaceState({}, '', window.location.pathname); })
        .catch((cause) => { setError(cause instanceof Error ? cause.message : 'Email verification failed.'); setEmailFlow('default'); window.history.replaceState({}, '', window.location.pathname); });
    } else if (resetToken) {
      actionHandled.current = true;
      setActionToken(resetToken);
      setEmailFlow('reset');
    }
  }, []);

  const loadMfaStatus = useCallback(async (current: Session) => { try { const status = await call<{ enabled: boolean; recoveryCodesRemaining: number }>('/auth/mfa/status', current.accessToken); setMfaEnabled(status.enabled); setRecoveryRemaining(status.recoveryCodesRemaining); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load MFA status.'); } }, []);
  useEffect(() => { if (session) void loadMfaStatus(session); }, [session, loadMfaStatus]);

  const openRequests = useMemo(() => requests.filter((item) => !terminalStatuses.includes(item.status)).length, [requests]);
  const overdueRequests = useMemo(() => requests.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now() && !terminalStatuses.includes(item.status)).length, [requests]);
  const highRiskAssets = useMemo(() => assets.filter((item) => ['confidential', 'restricted'].includes(item.classification)).length, [assets]);
  const filteredAssets = useMemo(() => assets.filter((item) =>
    (classificationFilter === 'all' || item.classification === classificationFilter) &&
    (statusFilter === 'all' || item.status === statusFilter)
  ), [assets, classificationFilter, statusFilter]);
  const filteredRequests = useMemo(() => requests.filter((item) =>
    !query.trim() || (label(item.requestType) + ' ' + label(item.status) + ' ' + item.description).toLowerCase().includes(query.toLowerCase())
  ), [requests, query]);

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setAuthBusy(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { email: auth.email, password: auth.password }
        : auth;
      const result = await call<{ mfaRequired?: boolean; challengeToken?: string; accessToken?: string; user?: User; organization?: Org }>(path, undefined, { method: 'POST', body: JSON.stringify(payload) });
      if (result.emailVerificationRequired) { setEmailFlow('verifyPending'); setNotice('Your account was created. Verify your email before signing in.'); return; }
      if (result.mfaRequired && result.challengeToken) { setMfaChallenge(result.challengeToken); setMfaCode(''); setMfaRecoveryMode(false); setNotice('Password verified. Complete the second authentication step.'); return; }
      if (!result.accessToken || !result.organization || !result.user) throw new Error('The authentication response was incomplete.');
      activeAccessToken = result.accessToken;
      const context = await call<{ organization: { id: string; name: string; slug: string }; membership: { role: string } }>(
        '/organizations/' + encodeURIComponent(result.organization.id) + '/context', result.accessToken,
      );
      setSession({ user: result.user, organization: { ...context.organization, role: context.membership.role }, accessToken: result.accessToken });
      setNotice('Secure workspace session established.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed.'); }
    finally { setAuthBusy(false); }
  }


  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault(); setEmailBusy(true); setError(''); setNotice('');
    try {
      const result = await call<{ message: string }>('/auth/password/forgot', undefined, { method: 'POST', body: JSON.stringify({ email: auth.email }) });
      setNotice(result.message); setEmailFlow('default');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request a password reset.'); }
    finally { setEmailBusy(false); }
  }

  async function resendVerificationNow() {
    setEmailBusy(true); setError(''); setNotice('');
    try {
      const result = await call<{ message: string }>('/auth/email/verification/resend', undefined, { method: 'POST', body: JSON.stringify({ email: auth.email }) });
      setNotice(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend verification email.'); }
    finally { setEmailBusy(false); }
  }

  async function resendVerification(event: FormEvent) {
    event.preventDefault(); setEmailBusy(true); setError(''); setNotice('');
    try {
      const result = await call<{ message: string }>('/auth/email/verification/resend', undefined, { method: 'POST', body: JSON.stringify({ email: auth.email }) });
      setNotice(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend verification email.'); }
    finally { setEmailBusy(false); }
  }
  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault(); setEmailBusy(true); setError(''); setNotice('');
    try {
      const result = await call<{ message: string }>('/auth/password/reset', undefined, { method: 'POST', body: JSON.stringify({ token: actionToken, password: newPassword }) });
      setNotice(result.message); setNewPassword(''); setActionToken(''); setEmailFlow('default'); window.history.replaceState({}, '', window.location.pathname);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reset password.'); }
    finally { setEmailBusy(false); }
  }

  async function signOut() {
    try { await call('/auth/logout', session?.accessToken, { method: 'POST' }); } catch { /* local sign-out must still complete */ }
    activeAccessToken = undefined;
    setSession(null); setAssets([]); setActivities([]); setRequests([]); setAudit([]); setMembers([]);
    setNotice('You have signed out.');
  }


  async function verifyMfaLogin(event: FormEvent) {
    event.preventDefault(); if (!mfaChallenge) return; setError(''); setAuthBusy(true);
    try {
      const result = await call<{ accessToken: string; user: User; organization: Org }>('/auth/mfa/verify-login', undefined, { method: 'POST', body: JSON.stringify({ challengeToken: mfaChallenge, ...(mfaRecoveryMode ? { recoveryCode: mfaCode } : { code: mfaCode }) }) });
      activeAccessToken = result.accessToken;
      const context = await call<{ organization: { id: string; name: string; slug: string }; membership: { role: string } }>('/organizations/' + encodeURIComponent(result.organization.id) + '/context', result.accessToken);
      setSession({ user: result.user, organization: { ...context.organization, role: context.membership.role }, accessToken: result.accessToken });
      setMfaChallenge(''); setMfaCode(''); setNotice('Multi-factor authentication complete.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'MFA verification failed.'); } finally { setAuthBusy(false); }
  }
  async function startMfaSetup() {
    if (!session) return;
    try { const result = await call<MfaSetup>('/auth/mfa/setup', session.accessToken, { method: 'POST' }); setMfaSetup(result); setMfaConfirmCode(''); setMfaRecoveryCodes([]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start MFA setup.'); }
  }
  async function confirmMfaSetup(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try { await call('/auth/mfa/confirm', session.accessToken, { method: 'POST', body: JSON.stringify({ code: mfaConfirmCode }) }); setMfaSetup(null); setMfaConfirmCode(''); setNotice('Authenticator MFA enabled. Generate recovery codes before signing out.'); await loadMfaStatus(session); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm MFA.'); }
  }
  async function generateMfaRecoveryCodes(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try { const result = await call<{ recoveryCodes: string[]; remaining: number }>('/auth/mfa/recovery-codes', session.accessToken, { method: 'POST', body: JSON.stringify({ password: mfaPassword, code: mfaConfirmCode }) }); setMfaRecoveryCodes(result.recoveryCodes); setMfaPassword(''); setMfaConfirmCode(''); setRecoveryRemaining(result.remaining); setNotice('New recovery codes generated. Save them now; they are shown only once.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate recovery codes.'); }
  }
  async function disableMfa(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try { await call('/auth/mfa/disable', session.accessToken, { method: 'POST', body: JSON.stringify({ password: mfaPassword, code: mfaConfirmCode }) }); setMfaPassword(''); setMfaConfirmCode(''); setMfaRecoveryCodes([]); setMfaSetup(null); setNotice('MFA disabled and existing refresh sessions revoked. Other devices must sign in again.'); await loadMfaStatus(session); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not disable MFA.'); }
  }

  async function createAsset(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError('');
    try {
      await call(orgBase + '/data-assets', session.accessToken, { method: 'POST', body: JSON.stringify({
        name: asset.name, system: asset.system, ownerTeam: asset.ownerTeam, classification: asset.classification,
        description: asset.description, dataCategories: asset.dataCategories.split(',').map((v) => v.trim()).filter(Boolean),
        dataSubjects: asset.dataSubjects.split(',').map((v) => v.trim()).filter(Boolean),
      }) });
      setAsset({ name: '', system: '', ownerTeam: '', classification: 'internal', description: '', dataCategories: '', dataSubjects: '' });
      setAssetFormOpen(false); setNotice('Data asset registered.'); await load(session, query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save asset.'); }
    finally { setBusy(false); }
  }

  async function archiveAsset(item: Asset) {
    if (!session || !window.confirm('Archive "' + item.name + '"? It will be removed from the active inventory.')) return;
    try {
      await call(orgBase + '/data-assets/' + item._id, session.accessToken, { method: 'DELETE' });
      setNotice('Asset archived.'); await load(session, query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not archive asset.'); }
  }

  async function createActivity(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try {
      const retention = activity.retentionPeriodDays.trim() ? Number(activity.retentionPeriodDays) : null;
      await call(orgBase + '/processing-activities', session.accessToken, { method: 'POST', body: JSON.stringify({
        name: activity.name, purpose: activity.purpose, legalBasis: activity.legalBasis,
        dataCategories: activity.dataCategories.split(',').map((v) => v.trim()).filter(Boolean),
        dataSubjects: activity.dataSubjects.split(',').map((v) => v.trim()).filter(Boolean),
        systems: activity.systems.split(',').map((v) => v.trim()).filter(Boolean),
        assetIds: activity.assetIds.split(',').map((v) => v.trim()).filter(Boolean),
        retentionPeriodDays: retention,
      }) });
      setActivity({ name: '', purpose: '', legalBasis: 'consent', dataCategories: '', dataSubjects: '', systems: '', assetIds: '', retentionPeriodDays: '365' });
      setActivityFormOpen(false); setNotice('Processing activity recorded.'); await load(session, query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save processing activity.'); }
  }

  async function createRequest(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try {
      await call(orgBase + '/privacy-requests', session.accessToken, { method: 'POST', body: JSON.stringify(request) });
      setRequest({ requestType: 'access', description: '' }); setRequestFormOpen(false);
      setNotice('Privacy request submitted.'); await load(session, query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit request.'); }
  }

  async function inspectRequest(item: RequestItem) {
    if (!session) return;
    setSelectedRequest(item); setRequestEvents([]); setEventBusy(true);
    setRequestUpdate({ status: statusTransitions[item.status]?.[0] ?? '', identityVerificationStatus: item.identityVerificationStatus ?? 'pending', resolutionSummary: item.resolutionSummary ?? '', rejectionReason: item.rejectionReason ?? '', assignedTo: item.assignedTo ?? '', dueAt: item.dueAt ? item.dueAt.slice(0, 10) : '' });
    try {
      const result = await call<{ events: RequestEvent[] }>(orgBase + '/privacy-requests/' + item._id + '/events', session.accessToken);
      setRequestEvents(result.events);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load request history.'); }
    finally { setEventBusy(false); }
  }

  async function saveRequestUpdate(event: FormEvent) {
    event.preventDefault(); if (!session || !selectedRequest) return;
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
      await call(orgBase + '/privacy-requests/' + selectedRequest._id, session.accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
      setSelectedRequest(null); setNotice('Privacy request workflow updated.'); await load(session, query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update request.'); }
  }

  function exportCurrent() {
    if (tab === 'assets') csvDownload('privaops-data-inventory.csv', filteredAssets.map((item) => ({
      name: item.name, system: item.system, ownerTeam: item.ownerTeam, classification: item.classification,
      status: item.status, dataCategories: item.dataCategories?.join('; '), dataSubjects: item.dataSubjects?.join('; '),
    })));
    else if (tab === 'processing') csvDownload('privaops-processing-register.csv', activities.map((item) => ({
      name: item.name, purpose: item.purpose, legalBasis: item.legalBasis, systems: item.systems.join('; '),
      dataCategories: item.dataCategories.join('; '), dataSubjects: item.dataSubjects.join('; '),
      retentionPeriodDays: item.retentionPeriodDays, status: item.status,
    })));
    else if (tab === 'requests') csvDownload('privaops-privacy-requests.csv', filteredRequests.map((item) => ({
      requestType: item.requestType, status: item.status, createdAt: item.createdAt, dueAt: item.dueAt,
      identityVerificationStatus: item.identityVerificationStatus, description: item.description,
    })));
    else if (tab === 'activity') csvDownload('privaops-audit-activity.csv', audit.map((item) => ({
      action: item.action, resourceType: item.resourceType, resourceId: item.resourceId,
      changedFields: item.changedFields.join('; '), createdAt: item.createdAt,
    })));
  }

  if (booting) return <main className="loading"><span className="brand-mark">P</span><p>Opening secure workspace…</p></main>;

  if (!session) return <main className="auth-layout">
    <section className="auth-intro">
      <a className="brand" href="/"><span className="brand-mark">P</span>PrivaOps</a>
      <div><p className="eyebrow">PRIVACY OPERATIONS PLATFORM</p><h1>Privacy, with <em>proof.</em></h1><p>One operational workspace for personal-data inventory, processing governance, and data-subject rights workflows.</p></div>
      <div className="auth-proof"><span>01 / DISCOVER</span><span>02 / GOVERN</span><span>03 / EVIDENCE</span></div>
      <small>Tenant-scoped access · Role-based authorization · Auditable workflows</small>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <p className="eyebrow">{mfaChallenge ? 'SECOND FACTOR REQUIRED' : mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p><h2>{mfaChallenge ? 'Verify your identity' : mode === 'login' ? 'Sign in to PrivaOps' : 'Create your workspace'}</h2>
      <p className="auth-description">{mfaChallenge ? 'Enter your authenticator code or an unused recovery code.' : 'Use your organization account to continue to the privacy operations console.'}</p>
      {notice && <p className="alert success" role="status">{notice}</p>}
      {emailFlow === 'verifying' ? <div className="auth-flow-card"><p>Verifying your email link…</p></div>
      : emailFlow === 'verifyPending' ? <form className="auth-flow-card" onSubmit={resendVerification}>
        <h3>Check your inbox</h3><p>We sent a verification link to <strong>{auth.email}</strong>. Verify your address before signing in. The link expires in 30 minutes.</p>
        <label>Email address<input type="email" required value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="primary full" disabled={emailBusy}>{emailBusy ? 'Sending…' : 'Resend verification email'}</button>
        <p className="switch-auth"><button type="button" className="link-button" onClick={() => { setEmailFlow('default'); setMode('login'); setError(''); }}>Back to sign in</button></p>
      </form>
      : emailFlow === 'forgot' ? <form className="auth-flow-card" onSubmit={requestPasswordReset}>
        <h3>Reset your password</h3><p>Enter your account email. If an active account exists, we will send a one-time reset link.</p>
        <label>Email address<input type="email" required value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="primary full" disabled={emailBusy}>{emailBusy ? 'Sending…' : 'Send reset link'}</button>
        <p className="switch-auth"><button type="button" className="link-button" onClick={() => { setEmailFlow('default'); setError(''); }}>Back to sign in</button></p>
      </form>
      : emailFlow === 'reset' ? <form className="auth-flow-card" onSubmit={submitPasswordReset}>
        <h3>Choose a new password</h3><p>Use at least 12 characters. This reset link can only be used once.</p>
        <label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="primary full" disabled={emailBusy}>{emailBusy ? 'Updating…' : 'Update password'}</button>
        <p className="switch-auth"><button type="button" className="link-button" onClick={() => { setEmailFlow('default'); setActionToken(''); window.history.replaceState({}, '', window.location.pathname); }}>Cancel</button></p>
      </form>
      : mfaChallenge ? <form className="auth-card" onSubmit={verifyMfaLogin}>
        <label>{mfaRecoveryMode ? 'Recovery code' : 'Authenticator code'}<input autoFocus required autoComplete="one-time-code" inputMode={mfaRecoveryMode ? 'text' : 'numeric'} maxLength={mfaRecoveryMode ? 32 : 6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} pattern={mfaRecoveryMode ? '[A-Fa-f0-9]{32}' : '[0-9]{6}'} placeholder={mfaRecoveryMode ? '32-character recovery code' : '000000'} /></label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="primary full" disabled={authBusy || !mfaCode.trim()}>{authBusy ? 'Verifying…' : 'Verify and continue'}</button>
        <p className="switch-auth"><button type="button" className="link-button" onClick={() => { setMfaRecoveryMode(!mfaRecoveryMode); setMfaCode(''); setError(''); }}>{mfaRecoveryMode ? 'Use authenticator app' : 'Use a recovery code'}</button></p>
        <p className="switch-auth"><button type="button" className="link-button" onClick={() => { setMfaChallenge(''); setMfaCode(''); setError(''); }}>Cancel and return to sign in</button></p>
      </form> : <>
      <form onSubmit={authenticate}>
      {mode === 'register' && <label>Full name<input autoComplete="name" required minLength={2} value={auth.fullName} onChange={(e) => setAuth({ ...auth, fullName: e.target.value })} /></label>}
      <label>Email address<input type="email" autoComplete="email" required value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label>
      <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : 1} value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} />{mode === 'register' && <small>Use at least 12 characters.</small>}</label>
      {mode === 'register' && <label>Organization name<input required minLength={2} value={auth.organizationName} onChange={(e) => setAuth({ ...auth, organizationName: e.target.value })} /></label>}
      {error && <p className="alert error" role="alert">{error}</p>}
      {error.includes('Verify your email address') && <button type="button" className="link-button" disabled={emailBusy} onClick={() => void resendVerificationNow()}>{emailBusy ? 'Sending…' : 'Resend verification email'}</button>}
      <button className="primary full" disabled={authBusy}>{authBusy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create workspace'}</button>
      {mode === 'login' && <p className="switch-auth"><button type="button" className="link-button" onClick={() => { setEmailFlow('forgot'); setError(''); setNotice(''); }}>Forgot password?</button></p>}
      <p className="switch-auth">{mode === 'login' ? 'New to PrivaOps?' : 'Already registered?'} <button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
    </form></>}</div></section>
  </main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark">P</span><span>PrivaOps</span></a>
      <div className="workspace"><span className="workspace-icon">⌂</span><div><strong>{session.organization.name}</strong><small>{session.organization.role} workspace</small></div></div>
      <p className="nav-label">OPERATIONS</p>
      <nav aria-label="Workspace navigation">
        <button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}><span>◫</span> Overview</button>
        <button className={tab === 'assets' ? 'selected' : ''} onClick={() => setTab('assets')}><span>▤</span> Data inventory</button>
        <button className={tab === 'processing' ? 'selected' : ''} onClick={() => setTab('processing')}><span>◈</span> Processing register</button>
        <button className={tab === 'requests' ? 'selected' : ''} onClick={() => setTab('requests')}><span>◎</span> Privacy requests</button>
        {canManage && <button className={tab === 'activity' ? 'selected' : ''} onClick={() => setTab('activity')}><span>⌁</span> Audit activity</button>}
        <button className={tab === 'security' ? 'selected' : ''} onClick={() => setTab('security')}><span>◇</span> Security settings</button>
      </nav>
      <div className="sidebar-bottom"><div className="security-note"><span>●</span><div><strong>Protected workspace</strong><small>Organization-scoped session</small></div></div><button className="signout" onClick={() => void signOut()}>↗ Sign out</button></div>
    </aside>

    <section className="main-panel">
      <header className="page-header">
        <div><p className="eyebrow">PRIVAOPS / {tab.toUpperCase()}</p><h1>{tab === 'overview' ? 'Operational overview' : tab === 'assets' ? 'Data inventory' : tab === 'processing' ? 'Processing register' : tab === 'requests' ? 'Privacy request queue' : tab === 'activity' ? 'Audit activity' : 'Security settings'}</h1></div>
        <div className="profile"><span>{session.user.fullName.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.fullName}</strong><small>{session.user.email}</small></div><span className="role-chip">{session.organization.role}</span></div>
      </header>

      {error && <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="alert success" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}

      {tab === 'overview' && <>
        <div className="welcome"><div><p className="eyebrow">YOUR PRIVACY CONTROL PLANE</p><h2>Good to see you, {session.user.fullName.split(' ')[0]}.</h2><p>Understand what is registered, what needs attention, and what changed.</p></div><button className="secondary" onClick={() => void load(session, query)}>↻ Refresh workspace</button></div>
        <div className="stats">
          <article><div className="stat-icon green">▤</div><small>ACTIVE DATA ASSETS</small><strong>{assets.filter((item) => item.status === 'active').length}</strong><span>Across {new Set(assets.map((item) => item.system)).size} systems</span></article>
          <article><div className="stat-icon blue">◈</div><small>PROCESSING ACTIVITIES</small><strong>{activities.length}</strong><span>{activities.filter((item) => item.retentionPeriodDays == null).length} without a recorded retention period</span></article>
          <article><div className="stat-icon amber">◎</div><small>OPEN PRIVACY REQUESTS</small><strong>{openRequests}</strong><span>{overdueRequests} overdue based on recorded due dates</span></article>
          <article><div className="stat-icon rose">⬡</div><small>HIGH-SENSITIVITY ASSETS</small><strong>{highRiskAssets}</strong><span>Confidential or restricted classification</span></article>
        </div>
        <div className="overview-grid">
          <section className="panel"><div className="panel-heading"><div><p className="eyebrow">OPERATIONAL COVERAGE</p><h3>Governance snapshot</h3></div><span className="subtle">Live records</span></div>
            <div className="coverage-row"><div><span>Data inventory</span><strong>{assets.length} records</strong></div><div className="progress"><i style={{ width: assets.length ? '100%' : '0%' }} /></div></div>
            <div className="coverage-row"><div><span>Processing register</span><strong>{activities.length} records</strong></div><div className="progress blue-progress"><i style={{ width: activities.length ? '100%' : '0%' }} /></div></div>
            <div className="coverage-row"><div><span>Privacy request tracking</span><strong>{requests.length} records</strong></div><div className="progress amber-progress"><i style={{ width: requests.length ? '100%' : '0%' }} /></div></div>
            <p className="footnote">Coverage bars indicate whether records exist, not legal compliance or completeness.</p>
          </section>
          <section className="panel"><div className="panel-heading"><div><p className="eyebrow">NEEDS ATTENTION</p><h3>Operational signals</h3></div></div>
            <div className="signal"><span className="signal-dot amber-dot" /><div><strong>{overdueRequests} overdue requests</strong><small>Only requests with an explicitly recorded due date are counted.</small></div></div>
            <div className="signal"><span className="signal-dot rose-dot" /><div><strong>{highRiskAssets} sensitive assets</strong><small>Review access, retention, and owner controls.</small></div></div>
            <div className="signal"><span className="signal-dot blue-dot" /><div><strong>{activities.filter((item) => item.status === 'under_review').length} activities under review</strong><small>Check purpose, legal basis, and retention documentation.</small></div></div>
          </section>
        </div>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECENT CHANGES</p><h3>Audit activity</h3></div>{canManage && <button className="text-action" onClick={() => setTab('activity')}>View audit log →</button>}</div>
          {canManage && audit.length ? <div className="activity-list">{audit.slice(0, 5).map((item) => <article key={item._id}><span className="activity-mark">⌁</span><div><strong>{label(item.action)}</strong><small>{item.resourceType} · {item.changedFields.join(', ') || 'record event'}</small></div><time>{dateLabel(item.createdAt)}</time></article>)}</div> : <p className="empty">{canManage ? 'No audit events recorded yet.' : 'Your organization activity is protected and available to administrators.'}</p>}
        </section>
      </>}

      {tab !== 'overview' && <div className="toolbar">
        <div className="search-box"><span>⌕</span><input aria-label="Search records" placeholder={tab === 'assets' ? 'Search assets, systems, owner teams…' : tab === 'processing' ? 'Search processing activities…' : 'Search requests…'} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && session) void load(session, query); }} /></div>
        <button className="secondary" onClick={() => session && void load(session, query)}>Search / refresh</button>
        {['assets', 'processing', 'requests', 'activity'].includes(tab) && <button className="secondary" onClick={exportCurrent}>↓ Export CSV</button>}
      </div>}

      {tab === 'assets' && <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">SYSTEMS & PERSONAL DATA</p><h3>Registered data assets <span className="count">{filteredAssets.length}</span></h3></div>{canManage && <button className="primary" onClick={() => setAssetFormOpen(!assetFormOpen)}>＋ Register asset</button>}</div>
        <div className="filters"><label>Classification<select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)}><option value="all">All classifications</option><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label><label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select></label></div>
        {assetFormOpen && <form className="inline-form" onSubmit={createAsset}>
          <label>Asset name<input required minLength={2} maxLength={160} value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} /></label>
          <label>System / application<input required maxLength={160} value={asset.system} onChange={(e) => setAsset({ ...asset, system: e.target.value })} /></label>
          <label>Owner team<input required maxLength={120} value={asset.ownerTeam} onChange={(e) => setAsset({ ...asset, ownerTeam: e.target.value })} /></label>
          <label>Classification<select value={asset.classification} onChange={(e) => setAsset({ ...asset, classification: e.target.value })}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
          <label>Data categories <small>Comma-separated</small><input placeholder="Identity, contact, financial" value={asset.dataCategories} onChange={(e) => setAsset({ ...asset, dataCategories: e.target.value })} /></label>
          <label>Data subjects <small>Comma-separated</small><input placeholder="Customers, employees" value={asset.dataSubjects} onChange={(e) => setAsset({ ...asset, dataSubjects: e.target.value })} /></label>
          <label className="wide">Description<textarea rows={2} maxLength={2000} value={asset.description} onChange={(e) => setAsset({ ...asset, description: e.target.value })} /></label>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setAssetFormOpen(false)}>Cancel</button><button className="primary" disabled={busy}>Save asset</button></div>
        </form>}
        {busy ? <p className="empty">Loading inventory…</p> : filteredAssets.length === 0 ? <p className="empty">No matching data assets. Adjust filters or register an asset.</p> : <div className="table-wrap"><table><thead><tr><th>ASSET / SYSTEM</th><th>OWNER</th><th>DATA CATEGORIES</th><th>CLASSIFICATION</th><th>STATUS</th>{canManage && <th />}</tr></thead><tbody>{filteredAssets.map((item) => <tr key={item._id}><td><strong>{item.name}</strong><small>{item.system}</small></td><td>{item.ownerTeam}</td><td>{item.dataCategories?.join(', ') || '—'}</td><td><span className={'tag ' + item.classification}>{item.classification}</span></td><td><span className={'status-dot ' + item.status}>{item.status}</span></td>{canManage && <td>{item.status === 'active' && <button className="icon-button" title="Archive asset" onClick={() => void archiveAsset(item)}>Archive</button>}</td>}</tr>)}</tbody></table></div>}
      </section>}

      {tab === 'processing' && <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">RECORD OF PROCESSING ACTIVITIES</p><h3>Processing register <span className="count">{activities.length}</span></h3></div>{canManage && <button className="primary" onClick={() => setActivityFormOpen(!activityFormOpen)}>＋ Add activity</button>}</div>
        {activityFormOpen && <form className="inline-form" onSubmit={createActivity}>
          <label>Activity name<input required minLength={2} maxLength={160} value={activity.name} onChange={(e) => setActivity({ ...activity, name: e.target.value })} /></label>
          <label>Legal basis<select value={activity.legalBasis} onChange={(e) => setActivity({ ...activity, legalBasis: e.target.value })}><option value="consent">Consent</option><option value="contract">Contract</option><option value="legal_obligation">Legal obligation</option><option value="legitimate_use">Legitimate use</option><option value="public_function">Public function</option><option value="other">Other / review required</option></select></label>
          <label className="wide">Purpose<input required minLength={5} maxLength={1000} value={activity.purpose} onChange={(e) => setActivity({ ...activity, purpose: e.target.value })} placeholder="Describe the operational purpose of this processing" /></label>
          <label>Data categories<input placeholder="Identity, contact, usage" value={activity.dataCategories} onChange={(e) => setActivity({ ...activity, dataCategories: e.target.value })} /></label>
          <label>Data subjects<input placeholder="Customers, employees" value={activity.dataSubjects} onChange={(e) => setActivity({ ...activity, dataSubjects: e.target.value })} /></label>
          <label>Systems<input placeholder="CRM, billing platform" value={activity.systems} onChange={(e) => setActivity({ ...activity, systems: e.target.value })} /></label>
          <label>Linked data assets <small>Optional — select one or more active assets</small><select multiple value={activity.assetIds.split(',').filter(Boolean)} onChange={(e) => setActivity({ ...activity, assetIds: Array.from(e.target.selectedOptions).map((option) => option.value).join(',') })}>{assets.filter((item) => item.status === 'active').map((item) => <option key={item._id} value={item._id}>{item.name} · {item.system}</option>)}</select></label>
          <label>Retention period (days)<input type="number" min={1} max={36500} value={activity.retentionPeriodDays} onChange={(e) => setActivity({ ...activity, retentionPeriodDays: e.target.value })} /></label>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setActivityFormOpen(false)}>Cancel</button><button className="primary">Save processing activity</button></div>
        </form>}
        {activities.length === 0 ? <p className="empty">No processing activities recorded yet. Add the first activity to build your processing register.</p> : <div className="table-wrap"><table><thead><tr><th>PROCESSING ACTIVITY</th><th>PURPOSE</th><th>LEGAL BASIS</th><th>SYSTEMS</th><th>RETENTION</th><th>STATUS</th></tr></thead><tbody>{activities.map((item) => <tr key={item._id}><td><strong>{item.name}</strong><small>{item.dataCategories.join(', ') || 'Categories not recorded'}</small></td><td className="purpose-cell">{item.purpose}</td><td><span className="tag">{label(item.legalBasis)}</span></td><td>{item.systems.join(', ') || '—'}</td><td>{item.retentionPeriodDays ? item.retentionPeriodDays + ' days' : <span className="warning-text">Not recorded</span>}</td><td><span className={'status-dot ' + item.status}>{label(item.status)}</span></td></tr>)}</tbody></table></div>}
        <p className="footnote">Legal basis and retention entries are operational records, not legal determinations. Have qualified reviewers validate applicability.</p>
      </section>}

      {tab === 'requests' && <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">DATA SUBJECT RIGHTS OPERATIONS</p><h3>Privacy request queue <span className="count">{filteredRequests.length}</span></h3></div><button className="primary" onClick={() => setRequestFormOpen(!requestFormOpen)}>＋ New request</button></div>
        {requestFormOpen && <form className="inline-form" onSubmit={createRequest}>
          <label>Request type<select value={request.requestType} onChange={(e) => setRequest({ ...request, requestType: e.target.value })}><option value="access">Access</option><option value="correction">Correction</option><option value="erasure">Erasure</option><option value="portability">Portability</option><option value="withdraw_consent">Withdraw consent</option><option value="restriction">Restriction</option><option value="objection">Objection</option><option value="other">Other</option></select></label>
          <label className="wide">Description<textarea rows={3} maxLength={2000} value={request.description} onChange={(e) => setRequest({ ...request, description: e.target.value })} placeholder="Provide context needed to triage this request. Avoid including unnecessary sensitive details." /></label>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setRequestFormOpen(false)}>Cancel</button><button className="primary">Submit request</button></div>
        </form>}
        {filteredRequests.length === 0 ? <p className="empty">No matching privacy requests.</p> : <div className="request-list">{filteredRequests.map((item) => <article key={item._id}>
          <div className="request-main"><span className="request-type">{label(item.requestType)}</span><strong>{item.description || 'No description provided'}</strong><small>Created {dateLabel(item.createdAt)}{item.dueAt ? ' · Due ' + dateLabel(item.dueAt) : ' · Due date not set'}</small></div>
          <div className="request-meta"><span className={'tag state-' + item.status}>{label(item.status)}</span>{item.dueAt && new Date(item.dueAt).getTime() < Date.now() && !terminalStatuses.includes(item.status) && <span className="warning-text">Overdue</span>}<button className="text-action" onClick={() => void inspectRequest(item)}>Details →</button></div>
        </article>)}</div>}
      </section>}


      {tab === 'security' && <section className="security-grid">
        <article className="panel security-card">
          <div className="panel-heading"><div><p className="eyebrow">ACCOUNT PROTECTION</p><h3>Authenticator MFA</h3></div><span className={'tag ' + (mfaEnabled ? 'active' : 'internal')}>{mfaEnabled ? 'Enabled' : 'Not enabled'}</span></div>
          <p className="security-copy">Add a time-based authenticator as a second factor for future sign-ins. Setup secrets are encrypted before storage.</p>
          {!mfaEnabled && !mfaSetup && <button className="primary" onClick={() => void startMfaSetup()}>＋ Set up authenticator</button>}
          {mfaSetup && <form className="inline-form security-form" onSubmit={confirmMfaSetup}>
            <p className="wide security-copy">Add this secret manually in your authenticator app, then enter its current six-digit code.</p>
            <label className="wide">Setup secret<input readOnly value={mfaSetup.secret} onFocus={(e) => e.currentTarget.select()} /></label>
            <label className="wide">Provisioning URI<input readOnly value={mfaSetup.otpauthUri} onFocus={(e) => e.currentTarget.select()} /></label>
            <label className="wide">Authenticator code<input required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={mfaConfirmCode} onChange={(e) => setMfaConfirmCode(e.target.value)} placeholder="000000" /></label>
            <div className="form-actions"><button type="button" className="secondary" onClick={() => setMfaSetup(null)}>Cancel setup</button><button className="primary">Confirm and enable</button></div>
          </form>}
          {mfaEnabled && <div className="security-status"><span>✓</span><div><strong>Authenticator verification is active</strong><small>Sign-ins require an authenticator or unused recovery code.</small></div></div>}
        </article>
        {mfaEnabled && <article className="panel security-card">
          <div className="panel-heading"><div><p className="eyebrow">ACCOUNT RECOVERY</p><h3>Recovery codes</h3></div><span className="count">{recoveryRemaining} remaining</span></div>
          <p className="security-copy">Each code works once. Generating a new set invalidates all previously issued recovery codes.</p>
          <form className="inline-form security-form" onSubmit={generateMfaRecoveryCodes}>
            <label>Current password<input required type="password" autoComplete="current-password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} /></label>
            <label>Authenticator code<input required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={mfaConfirmCode} onChange={(e) => setMfaConfirmCode(e.target.value)} placeholder="000000" /></label>
            <div className="form-actions"><button className="primary">Generate new recovery codes</button></div>
          </form>
          {mfaRecoveryCodes.length > 0 && <div className="recovery-output"><div><strong>Save these codes now</strong><small>They will not be shown again after leaving this screen.</small></div><div className="recovery-code-list">{mfaRecoveryCodes.map((code) => <code key={code}>{code}</code>)}</div><button className="secondary" onClick={() => { void navigator.clipboard?.writeText(mfaRecoveryCodes.join('\n')); setNotice('Recovery codes copied. Store them securely.'); }}>Copy all codes</button></div>}
        </article>}
        {mfaEnabled && <article className="panel security-card">
          <p className="eyebrow">HIGH-IMPACT ACTION</p><h3>Disable authenticator MFA</h3>
          <p className="security-copy">Disabling MFA removes recovery codes and revokes all refresh sessions. Other devices must sign in again.</p>
          <form className="inline-form security-form" onSubmit={disableMfa}>
            <label>Current password<input required type="password" autoComplete="current-password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} /></label>
            <label>Authenticator code<input required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={mfaConfirmCode} onChange={(e) => setMfaConfirmCode(e.target.value)} placeholder="000000" /></label>
            <div className="form-actions"><button className="secondary">Disable MFA</button></div>
          </form>
        </article>}
        <p className="footnote wide">Store recovery codes offline in a secure password manager. They are not emailed or displayed again. MFA reduces account takeover risk but is not a guarantee against every attack.</p>
      </section>}

      {tab === 'activity' && canManage && <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">TRACEABILITY & OVERSIGHT</p><h3>Organization audit trail</h3></div><span className="subtle">Latest 100 events</span></div>
        {audit.length === 0 ? <p className="empty">No inventory audit events are available yet.</p> : <div className="activity-list">{audit.map((item) => <article key={item._id}><span className="activity-mark">⌁</span><div><strong>{label(item.action)}</strong><small>{item.resourceType} · {item.resourceId} · {item.changedFields.join(', ')}</small><small>{typeof item.actorId === 'object' ? item.actorId.fullName || item.actorId.email : 'Organization member'}</small></div><time>{new Date(item.createdAt).toLocaleString()}</time></article>)}</div>}
        <p className="footnote">Audit records capture operational metadata and changed field names, not field values. This append-oriented log is not independently immutable or tamper-proof.</p>
      </section>}

      <footer><span>PrivaOps · Privacy operations workspace</span><span>Human review required for legal, risk, and identity decisions.</span></footer>
    </section>

    {selectedRequest && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedRequest(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title" onClick={(e) => e.stopPropagation()}>
      <div className="modal-heading"><div><p className="eyebrow">REQUEST DETAIL</p><h2 id="request-detail-title">{label(selectedRequest.requestType)} request</h2></div><button className="icon-button" onClick={() => setSelectedRequest(null)} aria-label="Close details">×</button></div>
      <div className="detail-grid"><div><small>Current status</small><strong>{label(selectedRequest.status)}</strong></div><div><small>Identity verification</small><strong>{label(selectedRequest.identityVerificationStatus ?? 'pending')}</strong></div><div><small>Submitted</small><strong>{dateLabel(selectedRequest.createdAt)}</strong></div><div><small>Due date</small><strong>{dateLabel(selectedRequest.dueAt)}</strong></div></div>
      <div className="detail-description"><small>Request description</small><p>{selectedRequest.description || 'No description provided.'}</p></div>
      <div className="timeline"><h3>Request history</h3>{eventBusy ? <p className="empty">Loading history…</p> : requestEvents.map((item) => <article key={item._id}><span /><div><strong>{label(item.action)}</strong><small>{item.changedFields.map(label).join(', ')}</small><time>{new Date(item.createdAt).toLocaleString()}</time></div></article>)}</div>
      {canManage && !terminalStatuses.includes(selectedRequest.status) && <form className="inline-form modal-form" onSubmit={saveRequestUpdate}>
        <p className="eyebrow wide">WORKFLOW ACTION</p>
        <label>Identity verification<select value={requestUpdate.identityVerificationStatus} onChange={(e) => setRequestUpdate({ ...requestUpdate, identityVerificationStatus: e.target.value })}><option value="pending">Pending</option><option value="verified">Verified</option><option value="failed">Failed</option></select></label>
        <label>Next status<select value={requestUpdate.status} onChange={(e) => setRequestUpdate({ ...requestUpdate, status: e.target.value })}><option value="">Keep current status</option>{(statusTransitions[selectedRequest.status] ?? []).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Assigned owner<select value={requestUpdate.assignedTo} onChange={(e) => setRequestUpdate({ ...requestUpdate, assignedTo: e.target.value })}><option value="">Unassigned</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.fullName} · {member.role}</option>)}</select></label>
        <label>Operational due date<input type="date" value={requestUpdate.dueAt} onChange={(e) => setRequestUpdate({ ...requestUpdate, dueAt: e.target.value })} /></label>
        {requestUpdate.status === 'fulfilled' && <label className="wide">Resolution summary<textarea required rows={2} value={requestUpdate.resolutionSummary} onChange={(e) => setRequestUpdate({ ...requestUpdate, resolutionSummary: e.target.value })} /></label>}
        {requestUpdate.status === 'rejected' && <label className="wide">Rejection reason<textarea required rows={2} value={requestUpdate.rejectionReason} onChange={(e) => setRequestUpdate({ ...requestUpdate, rejectionReason: e.target.value })} /></label>}
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setSelectedRequest(null)}>Close</button><button className="primary">Save workflow update</button></div>
      </form>}
    </section></div>}
  </main>;
}
