'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

function PanelTitle({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <div className="group-leads-panel-title">
      <span className="group-leads-panel-icon" aria-hidden>{icon}</span>
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="group-leads-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function IconKey() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="7.5" cy="14.5" r="3.5" stroke="currentColor" strokeWidth="1.6" /><path d="M10 12l8-8 2 2-2 2 1.5 1.5-2 2L16 10l-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconPhone() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 4h8a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 16 20H8a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 8 4z" stroke="currentColor" strokeWidth="1.6" /><path d="M10.5 17.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function IconSliders() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M5 17h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="9" cy="7" r="2" fill="var(--panel-alt)" stroke="currentColor" strokeWidth="1.6" /><circle cx="15" cy="17" r="2" fill="var(--panel-alt)" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function IconGroup() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" /><circle cx="17" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 19c.7-3.3 2.6-5 5.5-5s4.8 1.7 5.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M14.5 15.2c2.4.2 4 1.5 4.7 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function IconArchive() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h16v12H4V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3 5h18v3H3V5zM9 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconDownload() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconChevron() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconPremium() {
  return <svg className="premium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-label="Premium"><path d="M12 3.6l2.5 5.4 5.8.6-4.4 4 1.3 5.8L12 16.6 6.8 19.4l1.3-5.8-4.4-4 5.8-.6L12 3.6z" fill="currentColor" /></svg>;
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
          <ScrapePanel data={data} selectedJobId={selectedJobId} onSelectJob={setSelectedJobId} onStarted={mutate} />
          <ScrapeSettingsPanel serverConfigured={Boolean(data?.serverConfigured)} onSaved={mutate} />
          <button className={`group-leads-library-toggle ${showScrapedGroups ? 'active' : ''}`} onClick={() => setShowScrapedGroups((value) => !value)}>
            <span><IconArchive /> Groups scraped</span>
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

function ScrapeSettingsPanel({ serverConfigured, onSaved }: { serverConfigured: boolean; onSaved: () => void }) {
  return (
    <details className="tg-console-panel group-leads-setup-panel">
      <summary>
        <PanelTitle icon={<IconSliders />} title="Scrape settings" detail="API and Telegram login" />
        <span className="group-leads-chevron"><IconChevron /></span>
      </summary>
      <div className="group-leads-settings-grid">
        <CredentialsPanel onSaved={onSaved} />
        <LoginPanel serverConfigured={serverConfigured} onDone={onSaved} />
      </div>
    </details>
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
    <div className="group-leads-settings-block">
      <PanelTitle icon={<IconKey />} title="API keys" detail={data?.apiHashConfigured ? 'Saved' : 'Required'} />
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="API ID">
          <input className="input" placeholder="123456" value={apiId} onChange={(event) => setApiId(event.target.value)} disabled={data?.canEdit === false} />
        </Field>
        <Field label="API hash">
          <input className="input" placeholder={data?.apiHashConfigured ? 'Saved hash' : 'Paste hash'} type="password" value={apiHash} onChange={(event) => setApiHash(event.target.value)} disabled={data?.canEdit === false} />
        </Field>
        <button className="btn" disabled={busy || data?.canEdit === false || !apiId.trim() || !apiHash.trim()} onClick={save}>
          {busy ? 'Saving...' : 'Save keys'}
        </button>
        <div className="card-subtitle">
          {data?.source === 'env' ? 'Using server environment keys.' : data?.apiHashConfigured ? 'Organization keys are saved.' : 'Organization keys missing.'}
        </div>
        {status && <div className="card-subtitle" style={{ color: status.includes('saved') ? '#22c55e' : '#ef4444' }}>{status}</div>}
      </div>
    </div>
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
    <div className="group-leads-settings-block">
      <PanelTitle icon={<IconPhone />} title="Telegram login" detail={step === 'phone' ? 'Phone' : 'Verify'} />
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Phone number">
          <input className="input" placeholder="+1 555 010 0001" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={step !== 'phone'} />
        </Field>
        {step !== 'phone' && (
          <Field label="Telegram code">
            <input className="input" placeholder="12345" value={code} onChange={(event) => setCode(event.target.value)} />
          </Field>
        )}
        {step === '2fa' && (
          <Field label="2FA password">
            <input className="input" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        )}
        <button className="btn" disabled={busy || !serverConfigured || (step === 'phone' ? !phone.trim() : !code.trim())} onClick={step === 'phone' ? sendCode : verify}>
          {busy ? 'Working...' : step === 'phone' ? 'Send OTP' : 'Verify OTP'}
        </button>
        {status && <div className="card-subtitle">{status}</div>}
      </div>
    </div>
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
    <section className="tg-console-panel group-leads-primary-panel">
      <PanelTitle icon={<IconGroup />} title="Scrape a group" detail="Primary workflow" />
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Telegram account">
          <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions.length ? accountOptions : [{ value: '', label: 'No Telegram login' }]} />
        </Field>
        <div className="btn-row">
          <button className="btn-secondary" disabled={!accountId || loadingGroups} onClick={loadGroups}>
            {loadingGroups ? 'Loading...' : 'Load joined groups'}
          </button>
        </div>
        {groups.length > 0 && (
          <Field label="Joined group">
            <CustomSelect
              value={groupRef}
              onChange={setGroupRef}
              options={groups.map((group) => ({ value: group.ref, label: group.username ? `${group.title} (@${group.username})` : group.title }))}
            />
          </Field>
        )}
        <Field label="Group link or ID">
          <input className="input group-leads-group-input" placeholder="@group, t.me/group, or group id" value={groupRef} onChange={(event) => setGroupRef(event.target.value)} />
        </Field>
        <div className="group-leads-scrape-options">
          <Field label="Scrape mode">
            <CustomSelect value={mode} onChange={setMode} options={[
              { value: 'auto', label: 'Auto' },
              { value: 'members', label: 'Members list' },
              { value: 'messages', label: 'Message scan' },
            ]} />
          </Field>
          <Field label="Delay window">
            <div className="group-leads-delay-pair">
              <input className="input" aria-label="Minimum delay in milliseconds" value={minDelay} onChange={(event) => setMinDelay(event.target.value)} />
              <span>to</span>
              <input className="input" aria-label="Maximum delay in milliseconds" value={maxDelay} onChange={(event) => setMaxDelay(event.target.value)} />
            </div>
          </Field>
        </div>
        <button className="btn group-leads-start-btn" disabled={busy || !data?.serverConfigured || !accountId || !groupRef.trim()} onClick={start}>
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
      <PanelTitle icon={<IconArchive />} title="Scrape jobs" />
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
  const [leadFilter, setLeadFilter] = useState<'all' | 'premium' | 'standard' | 'company'>('all');
  const usernames = useMemo(() => results.filter((result) => result.username).length, [results]);
  const cleaned = useMemo(() => results.filter((result) => result.ai_cleaned_at).length, [results]);
  const cleanCompanies = useMemo(() => results.filter((result) => result.company_name).length, [results]);
  const saveableCleanLeads = useMemo(() => results.filter((result) => result.username && result.company_name).length, [results]);
  const filteredResults = useMemo(() => {
    if (leadFilter === 'premium') return results.filter((result) => result.premium);
    if (leadFilter === 'standard') return results.filter((result) => !result.premium);
    if (leadFilter === 'company') return results.filter((result) => result.company_name);
    return results;
  }, [leadFilter, results]);
  const cleanable = Boolean(job && job.status === 'completed' && results.length > 0);
  const pendingClean = Math.max(0, results.length - cleaned);
  const savedCount = job?.saved_count ?? 0;
  const alreadySaved = savedCount > 0 && savedCount >= saveableCleanLeads;

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
    <section className={`tg-console-panel group-leads-results ${cleaning ? 'is-cleaning-panel' : ''}`}>
      <div className="group-leads-results-head">
        <div>
          <div className="card-title">{job?.group_title || job?.group_ref || 'Lead Results'}</div>
          <div className="card-subtitle">
            {job ? `${job.status} - ${job.processed_count} processed - ${usernames} with usernames` : 'Start a scrape to collect group leads.'}
          </div>
        </div>
        <div className="btn-row">
          {pendingClean === 0 && results.length > 0 ? (
            <span className="group-leads-status-chip">Auto-cleaned</span>
          ) : (
            <button className="btn-secondary" disabled={!cleanable || cleaning} onClick={clean}>
              {cleaning ? 'Cleaning...' : 'Auto-clean'}
            </button>
          )}
          <button className="btn-secondary" disabled={!results.length} onClick={() => exportCsv(results, job)}><IconDownload /> CSV</button>
        </div>
      </div>

      {job && (
        <div className="group-leads-progress">
          <span style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {job?.error && <div className="status-callout danger" style={{ marginTop: 12 }}>{job.error}</div>}

      <div className={`group-leads-results-workspace ${cleaning ? 'is-cleaning' : ''}`}>
        {cleaning && (
          <div className="ai-cleaning-stage" aria-live="polite">
            <div className="ai-cleaning-orbit" aria-hidden>
              <svg viewBox="0 0 48 48" width="48" height="48">
                <circle cx="24" cy="24" r="19" fill="none" stroke="var(--border-strong)" strokeWidth="2" />
                <circle
                  cx="24"
                  cy="24"
                  r="19"
                  fill="none"
                  stroke="url(#ai-clean-grad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="30 90"
                />
                <defs>
                  <linearGradient id="ai-clean-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#60a5fa" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="ai-cleaning-body">
              <strong>Cleaning {pendingClean} lead{pendingClean === 1 ? '' : 's'} with AI</strong>
              <small>Finding company signals. The lead list is locked while cleanup runs.</small>
              <div className="ai-cleaning-bar">
                <span />
              </div>
            </div>
          </div>
        )}

        <div className="group-leads-results-content">
          {alreadySaved ? (
            <div className="group-leads-saved-note">{savedCount} lead{savedCount === 1 ? '' : 's'} added to your main list.</div>
          ) : saveableCleanLeads > 0 ? (
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

          {results.length > 0 && (
            <div className="group-leads-filter-row" aria-label="Lead filters">
              {[
                ['all', 'All'],
                ['premium', 'Premium'],
                ['standard', 'Standard'],
                ['company', 'Company found'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={leadFilter === value ? 'active' : ''}
                  onClick={() => setLeadFilter(value as typeof leadFilter)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="group-leads-table">
            <div className="table-header">
              <span>Name</span>
              <span>Username</span>
              <span>Bio</span>
              <span>Company</span>
              <span>Premium</span>
            </div>
            {filteredResults.map((result) => (
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
                    <span className="group-leads-premium" title="Telegram Premium"><IconPremium /></span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {results.length === 0 && (
            <div className="group-leads-empty">
              <IconGroup />
              <strong>No group leads yet</strong>
              <span>Choose a Telegram account, enter a group, then start the scrape.</span>
            </div>
          )}

          {results.length > 0 && filteredResults.length === 0 && (
            <div className="group-leads-empty compact">
              <strong>No leads match this filter</strong>
              <span>Switch filters to see the rest of this scrape.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
