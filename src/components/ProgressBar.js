import React from 'react';

function ProgressBar({ filled, total, height = 56 }) {
  return (
    <div className="progress-bars" style={{ height }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`progress-segment ${i < filled ? 'filled' : 'empty'}`}
        />
      ))}
    </div>
  );
}

export default ProgressBar;
