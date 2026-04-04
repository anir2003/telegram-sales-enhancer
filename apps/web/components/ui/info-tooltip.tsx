'use client';

import { useRef, useState } from 'react';

export function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const show = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
    }
    setVisible(true);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onFocus={show}
        onBlur={() => setVisible(false)}
        aria-label={text}
        style={{
          background: 'none', border: 'none', outline: 'none',
          padding: 0, cursor: 'default', display: 'inline-flex',
          color: 'rgba(255,255,255,0.22)',
          transition: 'color 0.15s',
          flexShrink: 0,
        }}
      >
        {/* Minimal SVG info circle */}
        <svg
          width="13" height="13" viewBox="0 0 16 16"
          fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
          style={{ display: 'block' }}
          onMouseEnter={show}
        >
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="7.5" x2="8" y2="11" />
          <circle cx="8" cy="5.2" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {visible && pos && (
        <div style={{
          position: 'fixed',
          zIndex: 9999,
          top: pos.top,
          left: pos.left,
          transform: 'translate(-50%, -100%)',
          background: '#1c1c1c',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 5,
          padding: '5px 9px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
          letterSpacing: '0.01em',
          lineHeight: 1.4,
        }}>
          {text}
          <span style={{
            position: 'absolute',
            top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '4px solid #1c1c1c',
          }} />
        </div>
      )}
    </span>
  );
}
