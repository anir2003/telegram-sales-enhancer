'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AvatarCircle } from '@/components/ui/avatar';
import { CustomSelect } from '@/components/ui/select';
import { fetchJson } from '@/lib/web/fetch-json';
import { swrFetcher } from '@/lib/web/swr-fetcher';
import type {
  TgConsoleAccountRecord,
  TgGroupLeadResultRecord,
  TgGroupLeadScrapeJobRecord,
} from '@telegram-enhancer/shared';

type GroupLeadsData = {
  serverConfigured: boolean;
  connectorMode?: 'live' | 'mock';
  accounts: TgConsoleAccountRecord[];
  jobs: TgGroupLeadScrapeJobRecord[];
  selectedJob: TgGroupLeadScrapeJobRecord | null;
  results: TgGroupLeadResultRecord[];
};

type CredentialState = {
  source: 'env' | 'organization' | 'missing';
  apiId: string | null;
  apiHashConfigured: boolean;
  canEdit: boolean;
};

type OpenAiKeyState = {
  source: 'env' | 'organization' | 'missing';
  configured: boolean;
  canEdit: boolean;
};

type GroupOption = {
  id: string;
  title: string;
  username: string | null;
  ref: string;
};

function statusTone(status: string | null | undefined) {
  if (status === 'completed' || status === 'authenticated') return '#22c55e';
  if (status === 'failed' || status === 'needs_reauth') return '#ef4444';
  if (status === 'running' || status === 'queued' || status === 'pending_code') return '#f59e0b';
  return 'var(--text-dim)';
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(results: TgGroupLeadResultRecord[], job: TgGroupLeadScrapeJobRecord | null) {
  const header = ['Name', 'Username', 'Bio', 'Company', 'Premium', 'Profile Picture'];
  const rows = results.map((result) => [
    result.name,
    result.username ? `@${result.username}` : '',
    result.bio ?? '',
    result.company_name ?? '',
    result.premium ? 'Yes' : 'No',
    result.avatar_data_url ?? '',
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(job?.group_title || job?.group_ref || 'telegram-group').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-leads.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function cleanPhone(value: string) {
  return value.trim();
}

export default function GroupLeadsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showScrapedGroups, setShowScrapedGroups] = useState(false);
  const dataKey = `/api/experimental/group-leads${selectedJobId ? `?jobId=${encodeURIComponent(selectedJobId)}` : ''}`;
  const { data, mutate } = useSWR<GroupLeadsData>(dataKey, swrFetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
  });

  const running = data?.selectedJob?.status === 'running' || data?.selectedJob?.status === 'queued';

  return (
    <div className="page-content group-leads-page">
      <div className="tgc-page-header">
        <div>
          <div className="tgc-page-title">
            <span className="exp-badge-label">Beta Experimental</span>
            Get Leads From Group
          </div>
          <div className="tgc-page-subtitle">Scrape Telegram group members into a reviewable lead list.</div>
        </div>
        <div className="tgc-connected-pill">
          <span className="tgc-online-dot" style={{ background: running ? '#f59e0b' : '#22c55e' }} />
          {running ? 'Scrape running' : `${data?.results.length ?? 0} leads ready`}
        </div>
      </div>

      {data?.connectorMode === 'mock' && (
        <div className="status-callout" style={{ marginBottom: 16 }}>
          Local mock mode is active. Use OTP <strong>12345</strong> for login previews.
        </div>
      )}

      <div className="group-leads-layout">
        <div className="group-leads-side">
          <CredentialsPanel onSaved={mutate} />
          <OpenAiKeyPanel onSaved={mutate} />
          <LoginPanel serverConfigured={Boolean(data?.serverConfigured)} onDone={mutate} />
          <ScrapePanel data={data} selectedJobId={selectedJobId} onSelectJob={setSelectedJobId} onStarted={mutate} />
          <button className={`group-leads-library-toggle ${showScrapedGroups ? 'active' : ''}`} onClick={() => setShowScrapedGroups((value) => !value)}>
            <span>Groups scraped</span>
            <strong>{data?.jobs.length ?? 0}</strong>
          </button>
          {showScrapedGroups && (
            <JobsPanel jobs={data?.jobs ?? []} selectedJobId={data?.selectedJob?.id ?? selectedJobId} onSelect={setSelectedJobId} />
          )}
        </div>
        <ResultsPanel job={data?.selectedJob ?? null} results={data?.results ?? []} onSaved={mutate} />
      </div>
    </div>
  );
}

function CredentialsPanel({ onSaved }: { onSaved: () => void }) {
  const { data, mutate } = useSWR<CredentialState>('/api/experimental/group-leads/credentials', swrFetcher);
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.apiId) setApiId(data.apiId);
  }, [data?.apiId]);

  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      await fetchJson('/api/experimental/group-leads/credentials', {
        method: 'POST',
        body: JSON.stringify({ api_id: apiId, api_hash: apiHash }),
      });
      setApiHash('');
      setStatus('Telegram API keys saved.');
      await mutate();
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save API keys.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Telegram API Keys</div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <input className="input" placeholder="API ID" value={apiId} onChange={(event) => setApiId(event.target.value)} disabled={data?.canEdit === false} />
        <input className="input" placeholder={data?.apiHashConfigured ? 'API hash saved' : 'API hash'} type="password" value={apiHash} onChange={(event) => setApiHash(event.target.value)} disabled={data?.canEdit === false} />
        <button className="btn" disabled={busy || data?.canEdit === false || !apiId.trim() || !apiHash.trim()} onClick={save}>
          {busy ? 'Saving...' : 'Save API keys'}
        </button>
        <div className="card-subtitle">
          {data?.source === 'env' ? 'Using server environment keys.' : data?.apiHashConfigured ? 'Organization keys are saved.' : 'Organization keys missing.'}
        </div>
        {status && <div className="card-subtitle" style={{ color: status.includes('saved') ? '#22c55e' : '#ef4444' }}>{status}</div>}
      </div>
    </section>
  );
}

function OpenAiKeyPanel({ onSaved }: { onSaved: () => void }) {
  const { data, mutate } = useSWR<OpenAiKeyState>('/api/experimental/group-leads/openai-key', swrFetcher);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      await fetchJson('/api/experimental/group-leads/openai-key', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey }),
      });
      setApiKey('');
      setStatus('OpenAI key saved.');
      await mutate();
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save OpenAI key.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">AI Auto-clean</div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <input className="input" placeholder={data?.configured ? 'OpenAI key saved' : 'OpenAI API key'} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={data?.canEdit === false} />
        <button className="btn" disabled={busy || data?.canEdit === false || !apiKey.trim()} onClick={save}>
          {busy ? 'Saving...' : 'Save OpenAI key'}
        </button>
        <div className="card-subtitle">
          {data?.source === 'env' ? 'Using server environment key.' : data?.configured ? 'Organization AI key is saved.' : 'Organization AI key missing.'}
        </div>
        {status && <div className="card-subtitle" style={{ color: status.includes('saved') ? '#22c55e' : '#ef4444' }}>{status}</div>}
      </div>
    </section>
  );
}

function LoginPanel({ serverConfigured, onDone }: { serverConfigured: boolean; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    setStatus('');
    try {
      const result = await fetchJson<{ account: TgConsoleAccountRecord; step: string }>('/api/experimental/tg-console/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'send-code', phone: cleanPhone(phone) }),
      });
      setAccountId(result.account.id);
      setStep('code');
      setStatus('Code sent.');
      onDone();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not send code.');
    }
    setBusy(false);
  };

  const verify = async () => {
    if (!accountId) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await fetchJson<{ step: string }>('/api/experimental/tg-console/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', accountId, code, password: password || undefined }),
      });
      if (result.step === '2fa') {
        setStep('2fa');
      } else {
        setStep('phone');
        setPhone('');
        setCode('');
        setPassword('');
        setAccountId(null);
        setStatus('Telegram login saved.');
        onDone();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not verify login.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Telegram Login</div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <input className="input" placeholder="+1 555 010 0001" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={step !== 'phone'} />
        {step !== 'phone' && (
          <input className="input" placeholder="Telegram code" value={code} onChange={(event) => setCode(event.target.value)} />
        )}
        {step === '2fa' && (
          <input className="input" placeholder="2FA password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        )}
        <button className="btn" disabled={busy || !serverConfigured || (step === 'phone' ? !phone.trim() : !code.trim())} onClick={step === 'phone' ? sendCode : verify}>
          {busy ? 'Working...' : step === 'phone' ? 'Send OTP' : 'Verify OTP'}
        </button>
        {status && <div className="card-subtitle">{status}</div>}
      </div>
    </section>
  );
}

function ScrapePanel({
  data,
  selectedJobId,
  onSelectJob,
  onStarted,
}: {
  data?: GroupLeadsData;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onStarted: () => void;
}) {
  const accounts = data?.accounts ?? [];
  const [accountId, setAccountId] = useState('');
  const [groupRef, setGroupRef] = useState('');
  const [mode, setMode] = useState('auto');
  const [minDelay, setMinDelay] = useState('1200');
  const [maxDelay, setMaxDelay] = useState('3200');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.display_name || account.phone} (${account.status})`,
  }));

  const loadGroups = async () => {
    if (!accountId) return;
    setLoadingGroups(true);
    setStatus('');
    try {
      const result = await fetchJson<{ groups: GroupOption[] }>(`/api/experimental/group-leads/groups?accountId=${encodeURIComponent(accountId)}`);
      setGroups(result.groups);
      if (result.groups[0]) setGroupRef(result.groups[0].ref);
      setStatus(`${result.groups.length} groups loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load groups.');
    }
    setLoadingGroups(false);
  };

  const start = async () => {
    setBusy(true);
    setStatus('');
    try {
      const result = await fetchJson<{ job: TgGroupLeadScrapeJobRecord }>('/api/experimental/group-leads', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          group_ref: groupRef,
          mode,
          limit: 10000,
          include_profile_pictures: true,
          min_delay_ms: Number(minDelay),
          max_delay_ms: Number(maxDelay),
        }),
      });
      onSelectJob(result.job.id);
      setStatus('Scrape started.');
      onStarted();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start scrape.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Group Scrape</div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions.length ? accountOptions : [{ value: '', label: 'No Telegram login' }]} />
        <div className="btn-row">
          <button className="btn-secondary" disabled={!accountId || loadingGroups} onClick={loadGroups}>
            {loadingGroups ? 'Loading...' : 'Load joined groups'}
          </button>
        </div>
        {groups.length > 0 && (
          <CustomSelect
            value={groupRef}
            onChange={setGroupRef}
            options={groups.map((group) => ({ value: group.ref, label: group.username ? `${group.title} (@${group.username})` : group.title }))}
          />
        )}
        <input className="input" placeholder="@group, t.me/group, or group id" value={groupRef} onChange={(event) => setGroupRef(event.target.value)} />
        <CustomSelect value={mode} onChange={setMode} options={[
          { value: 'auto', label: 'Auto' },
          { value: 'members', label: 'Members list' },
          { value: 'messages', label: 'Message scan' },
        ]} />
        <div className="form-grid columns-2">
          <input className="input" placeholder="Min delay ms" value={minDelay} onChange={(event) => setMinDelay(event.target.value)} />
          <input className="input" placeholder="Max delay ms" value={maxDelay} onChange={(event) => setMaxDelay(event.target.value)} />
        </div>
        <button className="btn" disabled={busy || !data?.serverConfigured || !accountId || !groupRef.trim()} onClick={start}>
          {busy ? 'Starting...' : 'Start scrape'}
        </button>
        {selectedJobId && <div className="card-subtitle">Selected job: {selectedJobId.slice(0, 8)}</div>}
        {status && <div className="card-subtitle">{status}</div>}
      </div>
    </section>
  );
}

function JobsPanel({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: TgGroupLeadScrapeJobRecord[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}) {
  return (
    <section className="tg-console-panel">
      <div className="card-title">Scrape Jobs</div>
      <div className="group-leads-job-list">
        {jobs.map((job) => (
          <button key={job.id} className={`group-leads-job ${selectedJobId === job.id ? 'active' : ''}`} onClick={() => onSelect(job.id)}>
            <span>
              <strong>{job.group_title || job.group_ref}</strong>
              <small>{formatDate(job.created_at)} - {job.processed_count} found</small>
            </span>
            <i style={{ color: statusTone(job.status) }}>{job.status}</i>
          </button>
        ))}
      </div>
      {jobs.length === 0 && <div className="empty-state" style={{ minHeight: 90 }}>No scrapes yet.</div>}
    </section>
  );
}

function ResultsPanel({
  job,
  results,
  onSaved,
}: {
  job: TgGroupLeadScrapeJobRecord | null;
  results: TgGroupLeadResultRecord[];
  onSaved: () => void;
}) {
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const usernames = useMemo(() => results.filter((result) => result.username).length, [results]);
  const cleaned = useMemo(() => results.filter((result) => result.ai_cleaned_at).length, [results]);
  const cleanCompanies = useMemo(() => results.filter((result) => result.company_name).length, [results]);
  const saveableCleanLeads = useMemo(() => results.filter((result) => result.username && result.company_name).length, [results]);
  const cleanable = Boolean(job && job.status === 'completed' && results.length > 0);
  const pendingClean = Math.max(0, results.length - cleaned);

  const save = async () => {
    if (!job) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await fetchJson<{ inserted: number; updated: number; skipped: number }>('/api/experimental/group-leads/save', {
        method: 'POST',
        body: JSON.stringify({ job_id: job.id, tag }),
      });
      setStatus(`${result.inserted} added, ${result.updated} updated, ${result.skipped} skipped.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save leads.');
    }
    setBusy(false);
  };

  const clean = async () => {
    if (!job) return;
    setCleaning(true);
    setStatus('');
    try {
      const result = await fetchJson<{ cleaned: number; withCompany: number; total: number }>('/api/experimental/group-leads/clean', {
        method: 'POST',
        body: JSON.stringify({ job_id: job.id }),
      });
      setStatus(`Cleaned ${result.cleaned} leads. ${result.withCompany} have company names.`);
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not clean leads.');
    }
    setCleaning(false);
  };

  const progressPct = job?.status === 'completed'
    ? 100
    : Math.min(99, Math.max(0, Math.round(((job?.processed_count ?? 0) / Math.max(1, job?.total_found || job?.processed_count || 1)) * 100)));

  return (
    <section className="tg-console-panel group-leads-results">
      <div className="group-leads-results-head">
        <div>
          <div className="card-title">{job?.group_title || job?.group_ref || 'Lead Results'}</div>
          <div className="card-subtitle">
            {job ? `${job.status} - ${job.processed_count} processed - ${usernames} with usernames` : 'Start a scrape to collect group leads.'}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn-secondary" disabled={!cleanable || cleaning || pendingClean === 0} onClick={clean}>
            {cleaning ? 'Cleaning...' : pendingClean === 0 ? 'Auto-cleaned' : 'Auto-clean'}
          </button>
          <button className="btn-secondary" disabled={!results.length} onClick={() => exportCsv(results, job)}>Export CSV</button>
        </div>
      </div>

      {job && (
        <div className="group-leads-progress">
          <span style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {job?.error && <div className="status-callout danger" style={{ marginTop: 12 }}>{job.error}</div>}

      {cleaning && (
        <div className="ai-cleaning-stage" aria-live="polite">
          <div className="ai-cleaning-mark">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Reading names and bios</strong>
            <small>Looking for explicit company names before these move into leads.</small>
          </div>
        </div>
      )}

      {saveableCleanLeads > 0 ? (
        <div className="group-leads-save-row">
          <input className="input" placeholder="Tag for clean leads" value={tag} onChange={(event) => setTag(event.target.value)} />
          <button className="btn" disabled={busy || !job || !tag.trim()} onClick={save}>
            {busy ? 'Adding...' : `Add ${saveableCleanLeads} clean leads`}
          </button>
        </div>
      ) : (
        job && results.length > 0 && (
          <div className="status-callout" style={{ marginTop: 16 }}>
            {cleanCompanies > 0 ? 'Only cleaned leads with usernames can move into the main lead list.' : 'Auto-clean these leads to unlock adding them to the main lead list.'}
          </div>
        )
      )}
      {status && <div className="card-subtitle" style={{ marginTop: 8 }}>{status}</div>}

      <div className="group-leads-table">
        <div className="table-header">
          <span>Name</span>
          <span>Username</span>
          <span>Bio</span>
          <span>Company</span>
          <span>Premium</span>
        </div>
        {results.map((result) => (
          <div className="table-row" key={result.id}>
            <span className="group-leads-person">
              <AvatarCircle url={result.avatar_data_url} name={result.name} size={34} />
              <strong>{result.name}</strong>
            </span>
            <span>{result.username ? `@${result.username}` : 'No username'}</span>
            <span className="group-leads-bio">{result.bio || 'No bio'}</span>
            <span className={`group-leads-company ${result.company_name ? 'found' : ''}`} title={result.company_reason || undefined}>
              {result.company_name ? (
                <>
                  <strong>{result.company_name}</strong>
                  <small>{Math.round((result.company_confidence ?? 0) * 100)}% confidence</small>
                </>
              ) : result.ai_cleaned_at ? (
                <small>No company found</small>
              ) : (
                <small>Not cleaned</small>
              )}
            </span>
            <span>
              {result.premium ? (
                <svg className="premium-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-label="Premium">
                  <path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 3.8z" fill="currentColor" />
                </svg>
              ) : (
                <span className="muted">-</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {results.length === 0 && <div className="empty-state" style={{ minHeight: 180 }}>No group leads collected yet.</div>}
    </section>
  );
}
