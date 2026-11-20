import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type User = { id: string; fullName: string; email: string };
type Org = { id: string; name: string; role: string };
type Session = { user: User; organization: Org; accessToken: string };
type Asset = { _id: string; name: string; system: string; ownerTeam: string; classification: string; status: string };
type RequestItem = { _id: string; requestType: string; description: string; status: string; createdAt: string };
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

async function call<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(API + path, { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Request failed (${response.status})`);
  return body.data as T;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tab, setTab] = useState<'overview' | 'assets' | 'requests'>('overview');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [auth, setAuth] = useState({ fullName: '', email: '', password: '', organizationName: '' });
  const [asset, setAsset] = useState({ name: '', system: '', ownerTeam: '', classification: 'internal', description: '' });
  const [request, setRequest] = useState({ requestType: 'access', description: '' });

  const load = useCallback(async (current: Session) => {
    setBusy(true); setError('');
    const base = `/organizations/${encodeURIComponent(current.organization.id)}`;
    const [a, r] = await Promise.allSettled([
      call<{ items: Asset[] }>(base + '/data-assets?limit=50', current.accessToken),
      call<{ items: RequestItem[] }>(base + '/privacy-requests?limit=50', current.accessToken)
        .catch(() => call<{ items: RequestItem[] }>(base + '/privacy-requests/mine?limit=50', current.accessToken)),
    ]);
    if (a.status === 'fulfilled') setAssets(a.value.items);
    else setError(a.reason instanceof Error ? a.reason.message : 'Could not load inventory.');
    if (r.status === 'fulfilled') setRequests(r.value.items);
    else if (a.status === 'fulfilled') setError(r.reason instanceof Error ? r.reason.message : 'Could not load requests.');
    setBusy(false);
  }, []);

  useEffect(() => {
    let live = true;
    call<{ accessToken: string }>('/auth/refresh', undefined, { method: 'POST' })
      .then(async (result) => {
        const me = await call<{ user: User; organization: { id: string; role: string } }>('/auth/me', result.accessToken);
        if (live) setSession({ user: me.user, organization: { ...me.organization, name: 'Your workspace' }, accessToken: result.accessToken });
      }).catch(() => undefined).finally(() => { if (live) setBooting(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => { if (session) void load(session); }, [session, load]);

  const openRequests = useMemo(() => requests.filter((r) => !['fulfilled', 'rejected', 'withdrawn', 'closed'].includes(r.status)).length, [requests]);

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { email: auth.email, password: auth.password } : auth;
      const result = await call<Session>(path, undefined, { method: 'POST', body: JSON.stringify(payload) });
      const me = await call<{ user: User; organization: { id: string; role: string } }>('/auth/me', result.accessToken);
      setSession({ user: result.user ?? me.user, organization: result.organization ?? { ...me.organization, name: 'Your workspace' }, accessToken: result.accessToken });
      setNotice('You are signed in.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed.'); }
  }

  async function signOut() {
    if (session) await call('/auth/logout', session.accessToken, { method: 'POST' }).catch(() => undefined);
    setSession(null); setAssets([]); setRequests([]); setNotice('Signed out.');
  }

  async function createAsset(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try {
      await call(`/organizations/${session.organization.id}/data-assets`, session.accessToken, {
        method: 'POST', body: JSON.stringify({ ...asset, dataCategories: [], dataSubjects: [] }),
      });
      setAsset({ name: '', system: '', ownerTeam: '', classification: 'internal', description: '' });
      setAssetFormOpen(false); setNotice('Data asset saved.'); await load(session);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save asset.'); }
  }

  async function createRequest(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    try {
      await call(`/organizations/${session.organization.id}/privacy-requests`, session.accessToken, { method: 'POST', body: JSON.stringify(request) });
      setRequest({ requestType: 'access', description: '' }); setRequestFormOpen(false);
      setNotice('Privacy request submitted.'); await load(session);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit request.'); }
  }

  if (booting) return <main className="loading"><span className="brand-mark">P</span><p>Opening secure workspace…</p></main>;

  if (!session) return <main className="auth-layout">
    <section className="auth-intro"><a className="brand" href="/"><span className="brand-mark">P</span>PrivaOps</a><div><p className="eyebrow">PRIVACY OPERATIONS</p><h1>Make privacy work <em>visible.</em></h1><p>A secure workspace for data inventory and privacy request operations.</p></div><small>Organization-scoped access · Server-side authorization</small></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={authenticate}>
      <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p><h2>{mode === 'login' ? 'Sign in to PrivaOps' : 'Create your workspace'}</h2>
      {mode === 'register' && <label>Full name<input required minLength={2} value={auth.fullName} onChange={(e) => setAuth({ ...auth, fullName: e.target.value })} /></label>}
      <label>Email address<input type="email" required value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label>
      <label>Password<input type="password" required minLength={mode === 'register' ? 12 : 1} value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} />{mode === 'register' && <small>At least 12 characters.</small>}</label>
      {mode === 'register' && <label>Organization name<input required minLength={2} value={auth.organizationName} onChange={(e) => setAuth({ ...auth, organizationName: e.target.value })} /></label>}
      {error && <p className="alert error">{error}</p>}<button className="primary full">{mode === 'login' ? 'Sign in' : 'Create workspace'}</button>
      <p className="switch-auth">{mode === 'login' ? 'New to PrivaOps?' : 'Already registered?'} <button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
    </form></section>
  </main>;

  return <main className="app-shell">
    <aside className="sidebar"><a className="brand" href="#"><span className="brand-mark">P</span>PrivaOps</a>
      <div className="workspace"><strong>{session.organization.name}</strong><small>{session.organization.role} workspace</small></div>
      <p className="nav-label">WORKSPACE</p><nav>
        <button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>◫　Overview</button>
        <button className={tab === 'assets' ? 'selected' : ''} onClick={() => setTab('assets')}>▤　Data inventory</button>
        <button className={tab === 'requests' ? 'selected' : ''} onClick={() => setTab('requests')}>◎　Privacy requests</button>
      </nav><div className="sidebar-bottom"><small>✳ Secure organization workspace</small><button className="signout" onClick={() => void signOut()}>↗ Sign out</button></div>
    </aside>
    <section className="main-panel"><header className="page-header"><div><p className="eyebrow">PRIVACY OPERATIONS / {tab.toUpperCase()}</p><h1>{tab === 'overview' ? 'Workspace overview' : tab === 'assets' ? 'Data inventory' : 'Privacy requests'}</h1></div><div className="profile"><span>{session.user.fullName.slice(0, 1).toUpperCase()}</span><div><strong>{session.user.fullName}</strong><small>{session.user.email}</small></div></div></header>
      {error && <p className="alert error">{error}</p>}{notice && <p className="alert success">{notice}</p>}
      {tab === 'overview' && <><div className="welcome"><div><h2>Good to see you, {session.user.fullName.split(' ')[0]}.</h2><p>Here’s what is happening in your workspace.</p></div><span className="connected">● API connected</span></div>
        <div className="stats"><article><small>REGISTERED DATA ASSETS</small><strong>{assets.length}</strong><span>Visible inventory records</span></article><article><small>PRIVACY REQUESTS</small><strong>{requests.length}</strong><span>Visible to your account</span></article><article><small>OPEN REQUESTS</small><strong>{openRequests}</strong><span>Awaiting action or resolution</span></article></div>
        <section className="panel"><p className="eyebrow">QUICK ACCESS</p><h3>Operational modules</h3><div className="quick-links"><button onClick={() => setTab('assets')}><b>▤ Data inventory</b><small>View systems and data assets</small></button><button onClick={() => setTab('requests')}><b>◎ Privacy requests</b><small>Track request status and ownership</small></button></div></section></>}
      {tab === 'assets' && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DATA CATALOGUE</p><h3>Registered data assets</h3></div><button className="primary" onClick={() => setAssetFormOpen(!assetFormOpen)}>＋ Add asset</button></div>
        {assetFormOpen && <form className="inline-form" onSubmit={createAsset}><label>Asset name<input required minLength={2} value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} /></label><label>System<input required value={asset.system} onChange={(e) => setAsset({ ...asset, system: e.target.value })} /></label><label>Owner team<input required value={asset.ownerTeam} onChange={(e) => setAsset({ ...asset, ownerTeam: e.target.value })} /></label><label>Classification<select value={asset.classification} onChange={(e) => setAsset({ ...asset, classification: e.target.value })}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label><label className="wide">Description<textarea rows={2} value={asset.description} onChange={(e) => setAsset({ ...asset, description: e.target.value })} /></label><div className="form-actions"><button type="button" className="secondary" onClick={() => setAssetFormOpen(false)}>Cancel</button><button className="primary">Save asset</button></div></form>}
        {busy ? <p className="empty">Loading inventory…</p> : assets.length === 0 ? <p className="empty">No data assets yet. Add your first asset.</p> : <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>SYSTEM</th><th>OWNER TEAM</th><th>CLASSIFICATION</th><th>STATUS</th></tr></thead><tbody>{assets.map((a) => <tr key={a._id}><td>{a.name}</td><td>{a.system}</td><td>{a.ownerTeam}</td><td><span className="tag">{a.classification}</span></td><td>{a.status}</td></tr>)}</tbody></table></div>}</section>}
      {tab === 'requests' && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DATA SUBJECT RIGHTS</p><h3>Privacy request queue</h3></div><button className="primary" onClick={() => setRequestFormOpen(!requestFormOpen)}>＋ New request</button></div>
        {requestFormOpen && <form className="inline-form" onSubmit={createRequest}><label>Request type<select value={request.requestType} onChange={(e) => setRequest({ ...request, requestType: e.target.value })}><option value="access">Access</option><option value="correction">Correction</option><option value="erasure">Erasure</option><option value="portability">Portability</option><option value="withdraw_consent">Withdraw consent</option><option value="restriction">Restriction</option><option value="objection">Objection</option><option value="other">Other</option></select></label><label className="wide">Description<textarea rows={3} maxLength={2000} value={request.description} onChange={(e) => setRequest({ ...request, description: e.target.value })} /></label><div className="form-actions"><button type="button" className="secondary" onClick={() => setRequestFormOpen(false)}>Cancel</button><button className="primary">Submit request</button></div></form>}
        {busy ? <p className="empty">Loading requests…</p> : requests.length === 0 ? <p className="empty">No privacy requests are visible yet.</p> : <div className="request-list">{requests.map((r) => <article key={r._id}><div><strong>{r.requestType.replaceAll('_', ' ')}</strong><small>{r.description || 'No description'} · {new Date(r.createdAt).toLocaleDateString()}</small></div><span className="tag">{r.status.replaceAll('_', ' ')}</span></article>)}</div>}</section>}
      <footer>PrivaOps · Development preview · AI and legal decisions require human review.</footer>
    </section>
  </main>;
}
