'use client';

import React from 'react';

/** Inline shimmer block — use for a single line or rectangular area. */
export function Skeleton({
  width,
  height = 14,
  style,
  className,
}: {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`skeleton${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: 4, ...style }}
    />
  );
}

/** A row of skeleton lines — looks like a block of text. */
export function SkeletonLines({
  lines = 3,
  gap = 8,
  lastWidth = '60%',
}: {
  lines?: number;
  gap?: number;
  lastWidth?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={13} width={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </div>
  );
}

/** Skeleton that mimics a stat card (title + big number + subtitle). */
export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="card" style={style}>
      <Skeleton height={10} width={90} style={{ marginBottom: 10 }} />
      <Skeleton height={28} width={60} style={{ marginBottom: 8 }} />
      <Skeleton height={10} width={130} />
    </div>
  );
}

/** Skeleton row that mimics a table row. */
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <div
      className="table-row"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '10px 16px', alignItems: 'center' }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} height={12} width={`${55 + (i % 3) * 15}%`} />
      ))}
    </div>
  );
}

/** Skeleton for a full table (header + N rows). */
export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="table" style={{ pointerEvents: 'none' }}>
      {/* Header */}
      <div
        className="table-header"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '10px 16px' }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={10} width={`${40 + (i % 4) * 10}%`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

/** Full-page skeleton for stat cards + a table. */
export function SkeletonPageContent({
  cards = 4,
  tableRows = 6,
  tableCols = 4,
}: {
  cards?: number;
  tableRows?: number;
  tableCols?: number;
}) {
  return (
    <div className="page-content">
      <div className={`grid grid-${cards}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <Skeleton height={10} width={120} style={{ margin: '24px 0 12px' }} />
      <SkeletonTable rows={tableRows} cols={tableCols} />
    </div>
  );
}
