import { getAdminSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

type WorkspaceContext = {
  workspaceId: string;
  profileId: string | null;
};

type JsonObject = Record<string, unknown>;

export type DemoGuildTraceEvent = JsonObject & {
  at: number;
  type?: string;
  url?: string | null;
};

export type DemoGuildTracePayload = {
  version: number;
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  meta: JsonObject & {
    initialUrl?: string | null;
    sourceViewport?: JsonObject;
  };
  tabs: JsonObject;
  events: DemoGuildTraceEvent[];
};

export type DemoGuildTraceSummary = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  initialUrl: string | null;
  eventCount: number;
  eventCounts: Record<string, number>;
};

export type WorkspaceDemoGuildTraceSummary = DemoGuildTraceSummary & {
  source: string;
  syncedByProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemoryTraceRow = WorkspaceDemoGuildTraceSummary & {
  workspaceId: string;
  trace: DemoGuildTracePayload;
};

const memoryTraceStore: MemoryTraceRow[] = [];

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? { ...(value as JsonObject) } : {};
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asTimestamp(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toIsoFromMillis(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeDemoGuildTrace(input: unknown): DemoGuildTracePayload {
  if (!isObject(input)) {
    throw new Error('Trace payload must be an object.');
  }

  const clone = structuredClone(input);
  const startedAt = asTimestamp(clone.startedAt, Date.now());
  const meta = asObject(clone.meta);
  const events = Array.isArray(clone.events) ? clone.events : [];

  const normalized: DemoGuildTracePayload = {
    version: asTimestamp(clone.version, 1),
    id: typeof clone.id === 'string' && clone.id.trim() ? clone.id.trim() : `trace-${Date.now()}`,
    name: typeof clone.name === 'string' && clone.name.trim() ? clone.name.trim() : `trace-${Date.now()}`,
    startedAt,
    endedAt: asTimestamp(clone.endedAt, startedAt),
    meta,
    tabs: asObject(clone.tabs),
    events: events
      .filter(isObject)
      .map((event, index) => ({
        ...event,
        at: asTimestamp(event.at, startedAt + index),
      }))
      .sort((a, b) => a.at - b.at),
  };

  if (!normalized.meta.initialUrl) {
    normalized.meta.initialUrl = asOptionalString(normalized.events.find((event) => typeof event.url === 'string')?.url) ?? null;
  }

  if (!isObject(normalized.meta.sourceViewport)) {
    normalized.meta.sourceViewport = (
      normalized.events.find((event) => isObject(event.viewport))?.viewport as JsonObject | undefined
    ) ?? {
      width: 1440,
      height: 900,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
    };
  }

  return normalized;
}

export function summarizeDemoGuildTrace(input: unknown): DemoGuildTraceSummary {
  const trace = normalizeDemoGuildTrace(input);
  const eventCounts = trace.events.reduce<Record<string, number>>((accumulator, event) => {
    const key = typeof event.type === 'string' && event.type.trim() ? event.type : 'UNKNOWN';
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  const lastEventAt = trace.events[trace.events.length - 1]?.at ?? trace.endedAt;

  return {
    id: trace.id,
    name: trace.name,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
    durationMs: Math.max(0, lastEventAt - trace.startedAt),
    initialUrl: asOptionalString(trace.meta.initialUrl) ?? null,
    eventCount: trace.events.length,
    eventCounts,
  };
}

function mapRowToSummary(row: any): WorkspaceDemoGuildTraceSummary {
  return {
    id: row.trace_id,
    name: row.name,
    startedAt: Number(row.started_at_ms ?? 0),
    endedAt: Number(row.ended_at_ms ?? 0),
    durationMs: Number(row.duration_ms ?? 0),
    initialUrl: row.initial_url ?? null,
    eventCount: Number(row.event_count ?? 0),
    eventCounts: isObject(row.event_counts) ? (row.event_counts as Record<string, number>) : {},
    source: row.source ?? 'manual',
    syncedByProfileId: row.synced_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkspaceDemoGuildTraces(context: WorkspaceContext): Promise<WorkspaceDemoGuildTraceSummary[]> {
  if (!isSupabaseConfigured()) {
    return memoryTraceStore
      .filter((row) => row.workspaceId === context.workspaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('workspace_demo_guild_traces')
    .select('trace_id, name, initial_url, event_count, event_counts, started_at_ms, ended_at_ms, duration_ms, source, synced_by, created_at, updated_at')
    .eq('workspace_id', context.workspaceId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRowToSummary);
}

export async function getWorkspaceDemoGuildTrace(
  context: WorkspaceContext,
  traceId: string,
): Promise<{ trace: DemoGuildTracePayload; summary: WorkspaceDemoGuildTraceSummary } | null> {
  if (!isSupabaseConfigured()) {
    const row = memoryTraceStore.find((item) => item.workspaceId === context.workspaceId && item.id === traceId);
    if (!row) return null;
    return {
      trace: normalizeDemoGuildTrace(row.trace),
      summary: row,
    };
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('workspace_demo_guild_traces')
    .select('trace_id, name, initial_url, event_count, event_counts, started_at_ms, ended_at_ms, duration_ms, source, synced_by, created_at, updated_at, payload')
    .eq('workspace_id', context.workspaceId)
    .eq('trace_id', traceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    trace: normalizeDemoGuildTrace(data.payload),
    summary: mapRowToSummary(data),
  };
}

export async function upsertWorkspaceDemoGuildTraces(
  context: WorkspaceContext,
  traces: unknown[],
  source = 'manual',
): Promise<WorkspaceDemoGuildTraceSummary[]> {
  const normalizedTraces = traces.map((trace) => normalizeDemoGuildTrace(trace));
  const summaries = normalizedTraces.map((trace) => summarizeDemoGuildTrace(trace));
  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    for (const [index, trace] of normalizedTraces.entries()) {
      const summary = summaries[index];
      const existingIndex = memoryTraceStore.findIndex((row) => row.workspaceId === context.workspaceId && row.id === summary.id);
      const nextRow: MemoryTraceRow = {
        ...summary,
        source,
        syncedByProfileId: context.profileId,
        createdAt: existingIndex === -1 ? nowIso : memoryTraceStore[existingIndex].createdAt,
        updatedAt: nowIso,
        workspaceId: context.workspaceId,
        trace,
      };

      if (existingIndex === -1) {
        memoryTraceStore.push(nextRow);
      } else {
        memoryTraceStore[existingIndex] = nextRow;
      }
    }

    return memoryTraceStore
      .filter((row) => row.workspaceId === context.workspaceId && normalizedTraces.some((trace) => trace.id === row.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const rows = normalizedTraces.map((trace, index) => {
    const summary = summaries[index];
    return {
      workspace_id: context.workspaceId,
      trace_id: summary.id,
      name: summary.name,
      initial_url: summary.initialUrl,
      event_count: summary.eventCount,
      event_counts: summary.eventCounts,
      started_at_ms: summary.startedAt,
      ended_at_ms: summary.endedAt,
      duration_ms: summary.durationMs,
      started_at: toIsoFromMillis(summary.startedAt),
      ended_at: toIsoFromMillis(summary.endedAt),
      source,
      synced_by: context.profileId,
      payload: trace,
    };
  });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase!
    .from('workspace_demo_guild_traces')
    .upsert(rows, { onConflict: 'workspace_id,trace_id' })
    .select('trace_id, name, initial_url, event_count, event_counts, started_at_ms, ended_at_ms, duration_ms, source, synced_by, created_at, updated_at');

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRowToSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
