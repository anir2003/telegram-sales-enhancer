'use client';

import { useEffect, useRef, useState } from 'react';

type Option = { value: string; label: string };

export function CustomSelect({
  value,
  onChange,
  options,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', width: '100%', ...style }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '8px 11px', cursor: 'pointer',
          background: 'var(--panel-alt)', border: '1px solid var(--border-soft)',
          borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
          textAlign: 'left', transition: 'border-color 0.15s',
          ...(open ? { borderColor: 'var(--border-focus)' } : {}),
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-soft)'; }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? value}
        </span>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ flexShrink: 0, color: 'var(--text-dim)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown portal-style via fixed */}
      {open && dropPos && (
        <div
          style={{
            position: 'fixed', zIndex: 9999,
            top: dropPos.top, left: dropPos.left, width: dropPos.width,
            background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
            borderRadius: 6, padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            maxHeight: 260, overflowY: 'auto',
          }}
        >
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                padding: '7px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                color: opt.value === value ? 'var(--text)' : 'var(--text-dim)',
                background: opt.value === value ? 'var(--panel-alt)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel-alt)')}
              onMouseLeave={e => (e.currentTarget.style.background = opt.value === value ? 'var(--panel-alt)' : 'transparent')}
            >
              {opt.value === value && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text)' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {opt.value !== value && <span style={{ width: 10, flexShrink: 0 }} />}
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
