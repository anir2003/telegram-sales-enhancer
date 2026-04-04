'use client';

import { useRef, useState } from 'react';

export function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setVisible(true);
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setVisible(false)}
        style={{
          width: 14, height: 14, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'transparent',
          color: 'rgba(255,255,255,0.35)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 700, fontStyle: 'italic',
          cursor: 'default', padding: 0, outline: 'none',
          fontFamily: 'serif',
          flexShrink: 0,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onFocus={handleEnter}
        onBlur={() => setVisible(false)}
        aria-label={text}
      >
        i
      </button>

      {visible && pos && (
        <div style={{
          position: 'fixed',
          zIndex: 9999,
          top: pos.top,
          left: pos.left,
          transform: 'translate(-50%, -100%)',
          background: '#1c1c1c',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 5,
          padding: '6px 10px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
          letterSpacing: '0.01em',
          lineHeight: 1.4,
        }}>
          {text}
          {/* Arrow */}
          <span style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1c1c1c',
          }} />
        </div>
      )}
    </span>
  );
}
