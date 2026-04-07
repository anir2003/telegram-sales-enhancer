'use client';

import { useState } from 'react';

const AVATAR_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6',
];

function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

type Props = {
  url?: string | null;
  name: string;
  size?: number;
  style?: React.CSSProperties;
};

export function AvatarCircle({ url, name, size = 28, style }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...style,
  };

  if (url && !imgFailed) {
    return (
      <div style={base}>
        <img
          src={url}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div style={{ ...base, background: colorForName(name) }}>
      <span style={{ fontSize: Math.round(size * 0.36), fontWeight: 700, color: '#fff', lineHeight: 1, userSelect: 'none' }}>
        {initials(name)}
      </span>
    </div>
  );
}
