'use client';

import { useEffect, useRef, useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = parseDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

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
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) });
    }
    if (selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
    setOpen(o => !o);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    onChange(toISODate(d));
    setOpen(false);
  };

  const displayValue = selected
    ? `${selected.getDate()} ${MONTHS[selected.getMonth()].slice(0, 3)} ${selected.getFullYear()}`
    : '';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', width: '100%', ...style }}>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '8px 11px', cursor: 'pointer',
          background: 'var(--panel-alt)', border: '1px solid var(--border-soft)',
          borderRadius: 4, color: displayValue ? 'var(--text)' : 'var(--text-dim)',
          fontSize: 12, fontFamily: 'inherit', textAlign: 'left',
          transition: 'border-color 0.15s',
          ...(open ? { borderColor: 'var(--border-focus)' } : {}),
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-soft)'; }}
      >
        <span>{displayValue || placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-dim)' }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {open && dropPos && (
        <div style={{
          position: 'fixed', zIndex: 9999,
          top: dropPos.top, left: dropPos.left, width: dropPos.width,
          background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
          borderRadius: 6, padding: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: 240,
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 3, fontSize: 14, lineHeight: 1 }}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 3, fontSize: 14, lineHeight: 1 }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-dim)', padding: '2px 0', letterSpacing: '0.04em' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const thisDate = new Date(viewYear, viewMonth, day);
              thisDate.setHours(0, 0, 0, 0);
              const isSelected = selected && thisDate.getTime() === selected.getTime();
              const isToday = thisDate.getTime() === today.getTime();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(day)}
                  style={{
                    padding: '5px 2px', borderRadius: 3, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontFamily: 'inherit', textAlign: 'center',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? 'var(--bg)' : isToday ? 'var(--accent)' : 'var(--text)',
                    fontWeight: isSelected || isToday ? 600 : 400,
                    outline: isToday && !isSelected ? '1px solid var(--accent)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--panel-alt)'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Clear */}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-dim)', padding: '4px 0', textAlign: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
