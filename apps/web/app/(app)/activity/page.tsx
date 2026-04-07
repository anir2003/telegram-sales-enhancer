'use client';

import useSWR from 'swr';
import { Skeleton } from '@/components/ui/skeleton';

export default function ActivityPage() {
  const { data, isLoading } = useSWR<{ activity: any[] }>('/api/activity');
  const activity = data?.activity ?? [];

  return (
    <div className="page-content">
      <div className="section-label">Recent Activity</div>
      <div className="table activity-table">
        <div className="table-header">
          <div>Event</div>
          <div>Type</div>
          <div>Payload</div>
          <div>When</div>
        </div>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, padding: '10px 16px', alignItems: 'center' }}>
              <Skeleton height={12} width="70%" />
              <Skeleton height={12} width="55%" />
              <Skeleton height={12} width="85%" />
              <Skeleton height={12} width="60%" />
            </div>
          ))
        ) : activity.length ? activity.map((item) => (
          <div key={item.id} className="table-row">
            <div>{item.event_label}</div>
            <div>{item.event_type}</div>
            <div className="dim">{JSON.stringify(item.payload)}</div>
            <div>{new Date(item.created_at).toLocaleString()}</div>
          </div>
        )) : <div className="empty-state">Launch a campaign or mark a bot task to start filling the audit log.</div>}
      </div>
    </div>
  );
}
