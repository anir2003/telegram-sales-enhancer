'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/web/fetch-json';
import { swrFetcher } from '@/lib/web/swr-fetcher';

const LOCAL_PLAYER_ORIGIN = 'http://127.0.0.1:4312';

type TraceSummary = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  initialUrl: string | null;
  eventCount: number;
  eventCounts: Record<string, number>;
};

type WorkspaceTraceSummary = TraceSummary & {
  source: string;
  syncedByProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

type TracePayload = {
  version: number;
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  meta: Record<string, unknown> & {
    initialUrl?: string | null;
    sourceViewport?: Record<string, unknown>;
  };
  tabs: Record<string, unknown>;
  events: Array<Record<string, unknown> & { at: number; type?: string; url?: string | null }>;
};

type WorkspaceTraceResponse = {
  trace: TracePayload;
  summary: WorkspaceTraceSummary;
};

type LocalTraceResponse = {
  trace: TracePayload;
  summary: TraceSummary;
};

type LocalTraceState = {
  connected: boolean;
  traces: TraceSummary[];
  error: string;
  checking: boolean;
};

function formatDateTime(value: number | string | null | undefined) {
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

function formatDuration(ms: number) {
  if (!ms) return '0s';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function statusToneClass(tone: 'success' | 'error' | 'neutral') {
  if (tone === 'success') return 'success';
  if (tone === 'error') return 'danger';
  return '';
}

async function fetchLocalJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${LOCAL_PLAYER_ORIGIN}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? 'Could not reach the local Demo Guilds renderer.');
  }
  return payload as T;
}

function downloadJsonFile(traceId: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${traceId}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function TraceCard({
  trace,
  subtitle,
  badges,
  actions,
}: {
  trace: TraceSummary;
  subtitle: string;
  badges: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="card dg-trace-card">
      <div className="dg-trace-header">
        <div>
          <div className="dg-trace-name">{trace.name || trace.id}</div>
          <div className="card-subtitle">{subtitle}</div>
        </div>
        <div className="dg-trace-badges">{badges}</div>
      </div>

      <div className="dg-trace-meta">
        <div>
          <span className="dg-trace-meta-label">Events</span>
          <strong>{trace.eventCount}</strong>
        </div>
        <div>
          <span className="dg-trace-meta-label">Duration</span>
          <strong>{formatDuration(trace.durationMs)}</strong>
        </div>
        <div>
          <span className="dg-trace-meta-label">Started</span>
          <strong>{formatDateTime(trace.startedAt)}</strong>
        </div>
      </div>

      <div className="card-subtitle" style={{ marginTop: 12 }}>
        {trace.initialUrl || 'No initial URL captured.'}
      </div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        {actions}
      </div>
    </div>
  );
}

export default function DemoGuildsPage() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [localState, setLocalState] = useState<LocalTraceState>({
    connected: false,
    traces: [],
    error: '',
    checking: true,
  });
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | 'neutral'>('neutral');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ traces: WorkspaceTraceSummary[] }>('/api/experimental/demo-guilds/traces', swrFetcher);

  const orgTraces = data?.traces ?? [];
  const orgTraceIds = useMemo(() => new Set(orgTraces.map((trace) => trace.id)), [orgTraces]);

  const setUiStatus = (message: string, tone: 'success' | 'error' | 'neutral' = 'neutral') => {
    setStatus(message);
    setStatusTone(tone);
  };

  const refreshLocalTraces = async () => {
    setLocalState((current) => ({ ...current, checking: true }));
    try {
      const result = await fetchLocalJson<{ traces: TraceSummary[] }>('/api/traces');
      setLocalState({
        connected: true,
        traces: result.traces ?? [],
        error: '',
        checking: false,
      });
    } catch (localError) {
      setLocalState({
        connected: false,
        traces: [],
        error: localError instanceof Error ? localError.message : 'Local renderer not detected.',
        checking: false,
      });
    }
  };

  useEffect(() => {
    void refreshLocalTraces();
  }, []);

  const syncTracePayloadsToOrg = async (payloads: TracePayload[], source: string) => {
    if (!payloads.length) {
      setUiStatus('No trace payloads were found to sync.', 'neutral');
      return;
    }

    await fetchJson<{ traces: WorkspaceTraceSummary[] }>('/api/experimental/demo-guilds/traces', {
      method: 'POST',
      body: JSON.stringify({ traces: payloads, source }),
    });
    await mutate();
  };

  const loadLocalTrace = async (traceId: string) => {
    return fetchLocalJson<LocalTraceResponse>(`/api/traces/${encodeURIComponent(traceId)}`);
  };

  const loadOrgTrace = async (traceId: string) => {
    return fetchJson<WorkspaceTraceResponse>(`/api/experimental/demo-guilds/traces/${encodeURIComponent(traceId)}`);
  };

  const syncAllLocalTraces = async () => {
    if (!localState.connected) {
      setUiStatus('Start the local Demo Guilds renderer first so this page can read your local trace files.', 'error');
      return;
    }

    if (!localState.traces.length) {
      setUiStatus('No local traces were found to sync yet.', 'neutral');
      return;
    }

    setBusyAction('sync-all-local');
    try {
      const details = await Promise.all(localState.traces.map((trace) => loadLocalTrace(trace.id)));
      await syncTracePayloadsToOrg(details.map((item) => item.trace), 'local-player');
      setUiStatus(`Synced ${details.length} local trace${details.length === 1 ? '' : 's'} into the organization library.`, 'success');
    } catch (syncError) {
      setUiStatus(syncError instanceof Error ? syncError.message : 'Could not sync local traces.', 'error');
    }
    setBusyAction(null);
  };

  const syncSingleLocalTrace = async (traceId: string) => {
    setBusyAction(`sync-local:${traceId}`);
    try {
      const detail = await loadLocalTrace(traceId);
      await syncTracePayloadsToOrg([detail.trace], 'local-player');
      setUiStatus(`Synced "${detail.summary.name || detail.summary.id}" to the organization library.`, 'success');
    } catch (syncError) {
      setUiStatus(syncError instanceof Error ? syncError.message : 'Could not sync the local trace.', 'error');
    }
    setBusyAction(null);
  };

  const sendOrgTraceToLocal = async (traceId: string) => {
    setBusyAction(`send-local:${traceId}`);
    try {
      const detail = await loadOrgTrace(traceId);
      await fetchLocalJson<{ ok: boolean; trace: TraceSummary }>('/api/import-trace', {
        method: 'POST',
        body: JSON.stringify(detail.trace),
      });
      await refreshLocalTraces();
      setUiStatus(`Copied "${detail.summary.name || detail.summary.id}" into the local renderer. Existing local trace files were left in place.`, 'success');
    } catch (sendError) {
      setUiStatus(sendError instanceof Error ? sendError.message : 'Could not send the trace to the local renderer.', 'error');
    }
    setBusyAction(null);
  };

  const downloadOrgTrace = async (traceId: string) => {
    setBusyAction(`download:${traceId}`);
    try {
      const detail = await loadOrgTrace(traceId);
      downloadJsonFile(detail.summary.id, detail.trace);
      setUiStatus(`Downloaded "${detail.summary.name || detail.summary.id}" as JSON.`, 'success');
    } catch (downloadError) {
      setUiStatus(downloadError instanceof Error ? downloadError.message : 'Could not download the trace JSON.', 'error');
    }
    setBusyAction(null);
  };

  const uploadTraceFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    setBusyAction('upload-json');
    try {
      const payloads: TracePayload[] = [];
      for (const file of Array.from(files)) {
        const text = await file.text();
        payloads.push(JSON.parse(text) as TracePayload);
      }
      await syncTracePayloadsToOrg(payloads, 'json-upload');
      setUiStatus(`Imported ${payloads.length} trace JSON file${payloads.length === 1 ? '' : 's'} into the organization library.`, 'success');
    } catch (uploadError) {
      setUiStatus(uploadError instanceof Error ? uploadError.message : 'Could not import the selected JSON file.', 'error');
    }
    setBusyAction(null);

    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  return (
    <div className="page-content demo-guilds-page">
      <div className="status-callout success" style={{ marginBottom: 16 }}>
        Demo Guilds keeps the raw trace JSON on the user&apos;s machine. Syncing copies those traces into the shared organization library, and every video render still runs locally through the user&apos;s own Demo Guilds renderer.
      </div>

      {(status || error) && (
        <div className={`status-callout ${status ? statusToneClass(statusTone) : 'danger'}`} style={{ marginBottom: 16 }}>
          {status || (error instanceof Error ? error.message : 'Could not load the organization trace library.')}
        </div>
      )}

      <div className="grid grid-3 dg-setup-grid">
        <section className="card dg-setup-card">
          <div className="card-title-row">
            <div className="card-title">Step 1</div>
            <span className="badge">Required</span>
          </div>
          <div className="dg-lead-title">Ok first add the Chrome extension.</div>
          <div className="card-subtitle" style={{ marginBottom: 14 }}>
            The recorder is what captures the click-path trace. It keeps existing traces in Chrome local storage and can still export each trace as JSON.
          </div>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <a className="btn" href="/downloads/demo-guilds-recorder-extension.zip" download>
              Download Chrome Extension
            </a>
          </div>
          <ol className="dg-steps">
            <li>Download the zip and extract it.</li>
            <li>Open <code>chrome://extensions</code>.</li>
            <li>Enable <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and choose the extracted <code>recorder-extension</code> folder.</li>
            <li>Record a demo, then either download the JSON or send it into the local renderer.</li>
          </ol>
          <div className="status-callout" style={{ marginTop: 16 }}>
            Existing traces are not removed when you sync. Syncing copies them into the organization library so the team can reuse the same template trace.
          </div>
        </section>

        <section className="card dg-setup-card">
          <div className="card-title-row">
            <div className="card-title">Step 2</div>
            <span className="badge">{localState.connected ? 'Local renderer online' : 'Runs on this machine'}</span>
          </div>
          <div className="dg-lead-title">Keep rendering local.</div>
          <div className="card-subtitle" style={{ marginBottom: 14 }}>
            Video generation stays on the machine being used by the person making the demo. This page only syncs trace JSON and hands traces off to the local renderer when it is available.
          </div>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <a className="btn-secondary" href="/downloads/demo-guilds-local-toolkit.zip" download>
              Download Local Renderer Kit
            </a>
            <button className="btn-secondary" onClick={() => void refreshLocalTraces()} disabled={localState.checking}>
              {localState.checking ? 'Checking…' : 'Refresh Local Status'}
            </button>
            {localState.connected && (
              <a className="btn" href={LOCAL_PLAYER_ORIGIN} target="_blank" rel="noreferrer">
                Open Local Renderer
              </a>
            )}
          </div>
          <ol className="dg-steps">
            <li>Download the local renderer kit.</li>
            <li>Inside that folder run <code>npm install</code>.</li>
            <li>Run <code>npm run player</code>.</li>
            <li>Leave the renderer running while you record, sync, or render.</li>
          </ol>
          <div className={`status-callout ${localState.connected ? 'success' : ''}`} style={{ marginTop: 16 }}>
            {localState.connected
              ? `${localState.traces.length} local trace${localState.traces.length === 1 ? '' : 's'} detected at ${LOCAL_PLAYER_ORIGIN}.`
              : localState.error || 'The local renderer is not running yet.'}
          </div>
        </section>

        <section className="card dg-setup-card">
          <div className="card-title-row">
            <div className="card-title">Step 3</div>
            <span className="badge">{orgTraces.length} org trace{orgTraces.length === 1 ? '' : 's'}</span>
          </div>
          <div className="dg-lead-title">Sync into the organization.</div>
          <div className="card-subtitle" style={{ marginBottom: 14 }}>
            Save reusable traces into the shared organization library so anyone on the team can pull them into their own local renderer without losing the original local JSON.
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => void syncAllLocalTraces()} disabled={busyAction === 'sync-all-local' || !localState.connected}>
              {busyAction === 'sync-all-local' ? 'Syncing…' : 'Sync Local Traces'}
            </button>
            <button className="btn-secondary" onClick={() => uploadInputRef.current?.click()} disabled={busyAction === 'upload-json'}>
              {busyAction === 'upload-json' ? 'Importing…' : 'Upload Trace JSON'}
            </button>
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".json,application/json"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => void uploadTraceFiles(event.target.files)}
          />
          <div className="dg-summary-stack">
            <div className="dg-summary-row">
              <span>Organization library</span>
              <strong>{isLoading ? 'Loading…' : `${orgTraces.length} traces`}</strong>
            </div>
            <div className="dg-summary-row">
              <span>Local renderer</span>
              <strong>{localState.connected ? `${localState.traces.length} traces` : 'Offline'}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="section-label">Organization Library</div>
      <div className="dg-trace-grid">
        {!orgTraces.length && (
          <div className="card dg-empty-card">
            <div className="dg-lead-title" style={{ fontSize: 18 }}>No shared traces yet.</div>
            <div className="card-subtitle">
              Import a trace JSON or sync the current local traces to start building the shared Demo Guilds library for this organization.
            </div>
          </div>
        )}

        {orgTraces.map((trace) => (
          <TraceCard
            key={trace.id}
            trace={trace}
            subtitle={`Updated ${formatDateTime(trace.updatedAt)} • Source ${trace.source}`}
            badges={
              <>
                <span className="badge">{trace.source}</span>
                <span className="badge">{trace.id}</span>
              </>
            }
            actions={
              <>
                <button
                  className="btn"
                  onClick={() => void sendOrgTraceToLocal(trace.id)}
                  disabled={busyAction === `send-local:${trace.id}`}
                >
                  {busyAction === `send-local:${trace.id}` ? 'Sending…' : 'Send To Local Renderer'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => void downloadOrgTrace(trace.id)}
                  disabled={busyAction === `download:${trace.id}`}
                >
                  {busyAction === `download:${trace.id}` ? 'Preparing…' : 'Download JSON'}
                </button>
              </>
            }
          />
        ))}
      </div>

      <div className="section-label">Local Renderer</div>
      <div className="dg-trace-grid">
        {!localState.connected && (
          <div className="card dg-empty-card">
            <div className="dg-lead-title" style={{ fontSize: 18 }}>Local renderer not detected.</div>
            <div className="card-subtitle">
              Start the local Demo Guilds renderer on this machine, then refresh local status here. Once it is online, you can sync or pull organization traces without moving rendering onto the server.
            </div>
          </div>
        )}

        {localState.connected && !localState.traces.length && (
          <div className="card dg-empty-card">
            <div className="dg-lead-title" style={{ fontSize: 18 }}>No local traces yet.</div>
            <div className="card-subtitle">
              Record a trace from the Chrome extension, or send one from the organization library into the local renderer first.
            </div>
          </div>
        )}

        {localState.connected && localState.traces.map((trace) => {
          const alreadySynced = orgTraceIds.has(trace.id);
          return (
            <TraceCard
              key={trace.id}
              trace={trace}
              subtitle={`${alreadySynced ? 'Already in organization library' : 'Local only'} • Updated locally ${formatDateTime(trace.endedAt || trace.startedAt)}`}
              badges={
                <>
                  <span className="badge">{alreadySynced ? 'Shared' : 'Local only'}</span>
                  <span className="badge">{trace.id}</span>
                </>
              }
              actions={
                <button
                  className="btn"
                  onClick={() => void syncSingleLocalTrace(trace.id)}
                  disabled={busyAction === `sync-local:${trace.id}`}
                >
                  {busyAction === `sync-local:${trace.id}` ? 'Syncing…' : alreadySynced ? 'Resync To Org' : 'Sync To Org'}
                </button>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
