import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { call, refreshAccessToken, setAccessToken } from './lib/api-client';
import { csvDownload } from './lib/csv';
import { dateLabel, label } from './lib/format';
import { terminalStatuses, statusTransitions } from './features/requests/domain';
import type { User, Org, Session } from './features/auth/types';
import type { MfaSetup } from './features/security/types';
import type { Asset } from './features/inventory/types';
import type { Activity } from './features/processing/types';
import type { RequestItem, RequestEvent, RequestUpdate } from './features/requests/types';
import type { AuditItem } from './features/audit/types';
import type { Member } from './features/organization/types';
import RequestDetailModal from './features/requests/RequestDetailModal';
import InventoryPanel from './features/inventory/InventoryPanel';
import ProcessingPanel from './features/processing/ProcessingPanel';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const pathname = usePathname();
  const router = useRouter();
  const routeTab: 'overview' | 'assets' | 'processing' | 'requests' | 'activity' | 'security' =
    pathname === '/inventory' ? 'assets' :
    pathname === '/processing' ? 'processing' :
    pathname === '/requests' ? 'requests' :
    pathname === '/activity' ? 'activity' :
    pathname === '/security' ? 'security' : 'overview';
  const [tab, setTab] = useState<'overview' | 'assets' | 'processing' | 'requests' | 'activity' | 'security'>(routeTab);
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
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [requestEvents, setRequestEvents] = useState<RequestEvent[]>([]);
  const [eventBusy, setEventBusy] = useState(false);
  const [requestUpdate, setRequestUpdate] = useState<RequestUpdate>({ status: '', identityVerificationStatus: 'pending', resolutionSummary: '', rejectionReason: '', assignedTo: '', dueAt: '' });
  const [auth, setAuth] = useState({ fullName: '', email: '', password: '', organizationName: '' });
  const [request, setRequest] = useState({ requestType: 'access', description: '' });

  useEffect(() => { setTab(routeTab); }, [routeTab]);

  function navigateTab(nextTab: 'overview' | 'assets' | 'processing' | 'requests' | 'activity' | 'security') {
    setTab(nextTab);
    const paths = { overview: '/', assets: '/inventory', processing: '/processing', requests: '/requests', activity: '/activity', security: '/security' };
    router.push(paths[nextTab]);
  }

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
      if (result.mfaRequired && result.challengeToken) { setMfaChallenge(result.challengeToken); setMfaCode(''); setMfaRecoveryMode(false); setNotice('Password verified. Complete the second authentication step.'); return; }
      if (!result.accessToken || !result.organization || !result.user) throw new Error('The authentication response was incomplete.');
      setAccessToken(result.accessToken);
      const context = await call<{ organization: { id: string; name: string; slug: string }; membership: { role: string } }>(
        '/organizations/' + encodeURIComponent(result.organization.id) + '/context', result.accessToken,
      );
      setSession({ user: result.user, organization: { ...context.organization, role: context.membership.role }, accessToken: result.accessToken });
      setNotice('Secure workspace session established.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed.'); }
    finally { setAuthBusy(false); }
  }

  async function signOut() {
    try { await call('/auth/logout', session?.accessToken, { method: 'POST' }); } catch { /* local sign-out must still complete */ }
    setAccessToken(undefined);
    setSession(null); setAssets([]); setActivities([]); setRequests([]); setAudit([]); setMembers([]);
    setNotice('You have signed out.');
  }


  async function verifyMfaLogin(event: FormEvent) {
    event.preventDefault(); if (!mfaChallenge) return; setError(''); setAuthBusy(true);
    try {
      const result = await call<{ accessToken: string; user: User; organization: Org }>('/auth/mfa/verify-login', undefined, { method: 'POST', body: JSON.stringify({ challengeToken: mfaChallenge, ...(mfaRecoveryMode ? { recoveryCode: mfaCode } : { code: mfaCode }) }) });
      setAccessToken(result.accessToken);
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
      {mfaChallenge ? <form className="auth-card" onSubmit={verifyMfaLogin}>
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
      <button className="primary full" disabled={authBusy}>{authBusy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create workspace'}</button>
      <p className="switch-auth">{mode === 'login' ? 'New to PrivaOps?' : 'Already registered?'} <button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
    </form></>}</div></section>
  </main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark">P</span><span>PrivaOps</span></a>
      <div className="workspace"><span className="workspace-icon">⌂</span><div><strong>{session.organization.name}</strong><small>{session.organization.role} workspace</small></div></div>
      <p className="nav-label">OPERATIONS</p>
      <nav aria-label="Workspace navigation">
        <button className={tab === 'overview' ? 'selected' : ''} onClick={() => navigateTab('overview')}><span>◫</span> Overview</button>
        <button className={tab === 'assets' ? 'selected' : ''} onClick={() => navigateTab('assets')}><span>▤</span> Data inventory</button>
        <button className={tab === 'processing' ? 'selected' : ''} onClick={() => navigateTab('processing')}><span>◈</span> Processing register</button>
        <button className={tab === 'requests' ? 'selected' : ''} onClick={() => navigateTab('requests')}><span>◎</span> Privacy requests</button>
        {canManage && <button className={tab === 'activity' ? 'selected' : ''} onClick={() => navigateTab('activity')}><span>⌁</span> Audit activity</button>}
        <button className={tab === 'security' ? 'selected' : ''} onClick={() => navigateTab('security')}><span>◇</span> Security settings</button>
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
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECENT CHANGES</p><h3>Audit activity</h3></div>{canManage && <button className="text-action" onClick={() => navigateTab('activity')}>View audit log →</button>}</div>
          {canManage && audit.length ? <div className="activity-list">{audit.slice(0, 5).map((item) => <article key={item._id}><span className="activity-mark">⌁</span><div><strong>{label(item.action)}</strong><small>{item.resourceType} · {item.changedFields.join(', ') || 'record event'}</small></div><time>{dateLabel(item.createdAt)}</time></article>)}</div> : <p className="empty">{canManage ? 'No audit events recorded yet.' : 'Your organization activity is protected and available to administrators.'}</p>}
        </section>
      </>}

      {tab !== 'overview' && <div className="toolbar">
        <div className="search-box"><span>⌕</span><input aria-label="Search records" placeholder={tab === 'assets' ? 'Search assets, systems, owner teams…' : tab === 'processing' ? 'Search processing activities…' : 'Search requests…'} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && session) void load(session, query); }} /></div>
        <button className="secondary" onClick={() => session && void load(session, query)}>Search / refresh</button>
        {['assets', 'processing', 'requests', 'activity'].includes(tab) && <button className="secondary" onClick={exportCurrent}>↓ Export CSV</button>}
      </div>}

      {tab === 'assets' && session && <InventoryPanel
        session={session}
        filteredAssets={filteredAssets}
        canManage={Boolean(canManage)}
        loading={busy}
        classificationFilter={classificationFilter}
        statusFilter={statusFilter}
        onClassificationFilterChange={setClassificationFilter}
        onStatusFilterChange={setStatusFilter}
        onRefresh={() => load(session, query)}
        onError={setError}
        onNotice={setNotice}
      />}

      {tab === 'processing' && session && <ProcessingPanel
        session={session}
        assets={assets}
        activities={activities}
        canManage={Boolean(canManage)}
        onRefresh={() => load(session, query)}
        onError={setError}
        onNotice={setNotice}
      />}

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

    {selectedRequest && (
      <RequestDetailModal
        request={selectedRequest}
        events={requestEvents}
        eventBusy={eventBusy}
        canManage={Boolean(canManage)}
        members={members}
        update={requestUpdate}
        setUpdate={setRequestUpdate}
        onClose={() => setSelectedRequest(null)}
        onSave={saveRequestUpdate}
      />
    )}
  </main>;
}
