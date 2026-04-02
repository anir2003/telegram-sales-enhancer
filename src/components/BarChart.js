import React, { useMemo } from 'react';

function BarChart({ count = 14, minH = 20, maxH = 90, trend = 'up', tall = false }) {
  const bars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const t = i / count;
      let h;
      if (trend === 'up') {
        h = minH + (maxH - minH) * (t * 0.6 + Math.random() * 0.4);
      } else if (trend === 'down') {
        h = maxH - (maxH - minH) * (t * 0.6 + Math.random() * 0.4);
      } else {
        h = minH + Math.random() * (maxH - minH);
      }
      h = Math.max(4, h);

      let brightness;
      if (trend === 'down') {
        brightness = 100 - t * 70;
      } else {
        brightness = 30 + t * 70;
      }

      return { height: h, brightness };
    });
  }, [count, minH, maxH, trend]);

  return (
    <div className={`bars${tall ? ' tall' : ''}`}>
      {bars.map((bar, i) => (
        <div
          key={i}
          className="bar"
          style={{
            height: `${bar.height}%`,
            background: `rgb(${bar.brightness}%,${bar.brightness}%,${bar.brightness}%)`
          }}
        />
      ))}
    </div>
  );
}

export default BarChart;
