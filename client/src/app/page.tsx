'use client';
import { useState, useEffect } from 'react';
import { Application, Stats, Status } from './lib/types';
import { getClient } from './lib/graphql-client';

const STATUS_COLORS: Record<Status, string> = {
  TO_APPLY:  'bg-gray-100 text-gray-700',
  APPLIED:   'bg-blue-100 text-blue-700',
  INTERVIEW: 'bg-yellow-100 text-yellow-700',
  OFFER:     'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<Status, string> = {
  TO_APPLY:  'To Apply',
  APPLIED:   'Applied',
  INTERVIEW: 'Interview',
  OFFER:     'Offer',
  REJECTED:  'Rejected',
};

const QUERIES = {
  login: `mutation Login($input: AuthInput!) {
    login(input: $input) { access_token }
  }`,
  register: `mutation Register($input: AuthInput!) {
    register(input: $input) { access_token }
  }`,
  applications: `query {
    applications { id companyName companyUrl jobRole status notes appliedAt updatedAt }
  }`,
  stats: `query { stats { total byStatus { status count } } }`,
  create: `mutation Create($input: CreateApplicationInput!) {
    createApplication(input: $input) { id companyName jobRole status }
  }`,
  update: `mutation Update($input: UpdateApplicationInput!) {
    updateApplication(input: $input) { id status }
  }`,
  delete: `mutation Delete($id: ID!) {
    deleteApplication(id: $id) { id }
  }`,
};

export default function Home() {
  const [token, setToken]               = useState<string | null>(null);
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [authMode, setAuthMode]         = useState<'login' | 'register'>('login');
  const [authError, setAuthError]       = useState('');
  const [apps, setApps]                 = useState<Application[]>([]);
  const [stats, setStats]               = useState<Stats | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL');
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState({
    companyName: '', companyUrl: '', jobRole: '', status: 'APPLIED' as Status, notes: '',
  });

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) { setToken(t); }
  }, []);

  useEffect(() => {
    if (token) { fetchAll(); }
  }, [token]);

  async function fetchAll() {
    if (!token) return;
    const client = getClient(token);
    const [a, s] = await Promise.all([
      client.request<{ applications: Application[] }>(QUERIES.applications),
      client.request<{ stats: Stats }>(QUERIES.stats),
    ]);
    setApps(a.applications);
    setStats(s.stats);
  }

  async function handleAuth() {
    setAuthError('');
    try {
      const client = getClient();
      const query = authMode === 'login' ? QUERIES.login : QUERIES.register;
      const key   = authMode === 'login' ? 'login' : 'register';
      const res   = await client.request<{ [k: string]: { access_token: string } }>(
        query, { input: { email, password } }
      );
      const t = res[key].access_token;
      localStorage.setItem('token', t);
      setToken(t);
    } catch {
      setAuthError('Invalid credentials or email already in use.');
    }
  }

  async function handleSubmit() {
    if (!token) return;
    const client = getClient(token);
    if (editingId) {
      await client.request(QUERIES.update, {
        input: { id: editingId, ...form }
      });
    } else {
      await client.request(QUERIES.create, { input: form });
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ companyName: '', companyUrl: '', jobRole: '', status: 'APPLIED', notes: '' });
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!token) return;
    await getClient(token).request(QUERIES.delete, { id });
    fetchAll();
  }

  function handleEdit(app: Application) {
    setForm({
      companyName: app.companyName,
      companyUrl:  app.companyUrl || '',
      jobRole:     app.jobRole,
      status:      app.status,
      notes:       app.notes || '',
    });
    setEditingId(app.id);
    setShowForm(true);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setApps([]);
    setStats(null);
  }

  const filtered = filterStatus === 'ALL'
    ? apps
    : apps.filter(a => a.status === filterStatus);

  // ── Auth Screen ───────────────────────────────────────────────────────────
  if (!token) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8">
        <h1 className="text-white text-xl font-bold mb-1">Job Tracker</h1>
        <p className="text-gray-500 text-sm mb-6">Track your path to Germany 🇩🇪</p>
        {authError && <p className="text-red-400 text-sm mb-4">{authError}</p>}
        <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-3 outline-none focus:border-blue-500"
          placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-4 outline-none focus:border-blue-500"
          placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()} />
        <button onClick={handleAuth}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-2 text-sm transition-colors">
          {authMode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
        <p className="text-center text-gray-500 text-sm mt-4">
          {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="text-blue-400 hover:underline"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );

  // ── Main App ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">Job Tracker</h1>
          <p className="text-gray-500 text-xs">Backend Engineer · Germany 🇩🇪</p>
        </div>
        <button onClick={logout} className="text-gray-500 hover:text-white text-sm transition-colors">
          Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
            {(['TO_APPLY','APPLIED','INTERVIEW','OFFER','REJECTED'] as Status[]).map(s => {
              const found = stats.byStatus.find(b => b.status === s);
              return (
                <div key={s} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{found?.count ?? 0}</p>
                  <p className="text-gray-500 text-xs mt-1">{STATUS_LABELS[s]}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button onClick={() => { setShowForm(true); setEditingId(null);
            setForm({ companyName:'', companyUrl:'', jobRole:'', status:'APPLIED', notes:'' }); }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            + Add Application
          </button>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            className="bg-gray-900 border border-gray-800 text-gray-300 text-sm rounded-lg px-3 py-2 outline-none">
            <option value="ALL">All</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <span className="text-gray-600 text-sm ml-auto">{filtered.length} applications</span>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
              <h2 className="font-bold mb-4">{editingId ? 'Edit Application' : 'New Application'}</h2>
              <div className="flex flex-col gap-3">
                <input placeholder="Company name *" value={form.companyName}
                  onChange={e => setForm({...form, companyName: e.target.value})}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                <input placeholder="Company URL" value={form.companyUrl}
                  onChange={e => setForm({...form, companyUrl: e.target.value})}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                <input placeholder="Job role *" value={form.jobRole}
                  onChange={e => setForm({...form, jobRole: e.target.value})}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value as Status})}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
                  {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <textarea placeholder="Notes" value={form.notes}
                  onChange={e => setForm({...form, notes: e.target.value})} rows={3}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 resize-none" />
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={handleSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-2 text-sm transition-colors">
                  {editingId ? 'Save Changes' : 'Add Application'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg py-2 text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Company</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Role</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-600 py-12">
                  No applications yet — add your first one!
                </td></tr>
              ) : filtered.map(app => (
                <tr key={app.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{app.companyName}</p>
                    {app.companyUrl && (
                      <a href={app.companyUrl} target="_blank" rel="noreferrer"
                        className="text-gray-500 text-xs hover:text-blue-400 transition-colors">
                        {app.companyUrl.replace(/https?:\/\//, '')}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{app.jobRole}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[app.status]}`}>
                      {STATUS_LABELS[app.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                    {new Date(app.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(app)}
                        className="text-gray-500 hover:text-white text-xs transition-colors">Edit</button>
                      <button onClick={() => handleDelete(app.id)}
                        className="text-gray-500 hover:text-red-400 text-xs transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}