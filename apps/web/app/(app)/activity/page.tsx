'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

export default function ActivityPage() {
  const [activity, setActivity] = useState<any[]>([]);

  useEffect(() => {
    void fetchJson('/api/activity').then((response) => setActivity(response.activity ?? []));
  }, []);

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
        {activity.length ? activity.map((item) => (
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
