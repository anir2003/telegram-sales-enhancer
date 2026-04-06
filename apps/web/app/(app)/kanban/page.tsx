'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

type KanbanColumn = { id: string; name: string; position: number };
type KanbanCard = {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  position: number;
};

const COLUMN_ACCENT = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6'];

// Fixed card height so all cards are the same size
const CARD_HEIGHT = 110;

export default function KanbanPage() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const [modalCard, setModalCard] = useState<KanbanCard | null>(null);
  const [modalForm, setModalForm] = useState({ title: '', description: '', assigned_to: '', column_id: '' });
  const [modalSaving, setModalSaving] = useState(false);

  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const colNameInputRef = useRef<HTMLInputElement>(null);

  const [addingCardColId, setAddingCardColId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<{ columns: KanbanColumn[]; cards: KanbanCard[] }>('/api/kanban');
    setColumns((data.columns ?? []).sort((a, b) => a.position - b.position));
    setCards(data.cards ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (editingColId && colNameInputRef.current) colNameInputRef.current.focus(); }, [editingColId]);

  // ── Column actions ──────────────────────────────────────────────────
  const startEditCol = (col: KanbanColumn) => { setEditingColId(col.id); setEditingColName(col.name); };

  const saveColName = async (colId: string) => {
    const name = editingColName.trim();
    if (!name) { setEditingColId(null); return; }
    setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, name } : c));
    setEditingColId(null);
    await fetchJson(`/api/kanban/columns/${colId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  };

  const deleteColumn = async (colId: string) => {
    if (!confirm('Delete this column and all its cards?')) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
    setCards((prev) => prev.filter((c) => c.column_id !== colId));
    await fetchJson(`/api/kanban/columns/${colId}`, { method: 'DELETE' });
  };

  const addColumn = async () => {
    const name = newColName.trim();
    if (!name) { setAddingColumn(false); return; }
    setAddingColumn(false);
    setNewColName('');
    const data = await fetchJson<{ column: KanbanColumn }>('/api/kanban', { method: 'POST', body: JSON.stringify({ name }) });
    if (data.column) setColumns((prev) => [...prev, data.column]);
  };

  // ── Card actions ────────────────────────────────────────────────────
  const addCard = async (colId: string) => {
    const title = newCardTitle.trim();
    if (!title) { setAddingCardColId(null); return; }
    setAddingCardColId(null);
    const t = newCardTitle.trim();
    const d = newCardDesc.trim() || null;
    setNewCardTitle('');
    setNewCardDesc('');
    const data = await fetchJson<{ card: KanbanCard }>('/api/kanban/cards', {
      method: 'POST',
      body: JSON.stringify({ column_id: colId, title: t, description: d }),
    });
    if (data.card) setCards((prev) => [...prev, data.card]);
  };

  const openCard = (card: KanbanCard) => {
    setModalCard(card);
    setModalForm({ title: card.title, description: card.description ?? '', assigned_to: card.assigned_to ?? '', column_id: card.column_id });
  };

  const saveCard = async () => {
    if (!modalCard) return;
    setModalSaving(true);
    const patch = {
      title: modalForm.title.trim() || modalCard.title,
      description: modalForm.description.trim() || null,
      assigned_to: modalForm.assigned_to.trim() || null,
      column_id: modalForm.column_id,
    };
    setCards((prev) => prev.map((c) => c.id === modalCard.id ? { ...c, ...patch } : c));
    setModalCard(null);
    await fetchJson(`/api/kanban/cards/${modalCard.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setModalSaving(false);
  };

  const deleteCard = async (cardId: string) => {
    if (!confirm('Delete this card?')) return;
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setModalCard(null);
    await fetchJson(`/api/kanban/cards/${cardId}`, { method: 'DELETE' });
  };

  // ── Drag & drop ─────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, cardId: string) => { setDraggingId(cardId); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e: React.DragEvent, colId: string) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverColId(colId); };
  const onDragEnd = () => { setDraggingId(null); setDragOverColId(null); };

  const onDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverColId(null);
    if (!draggingId) return;
    const card = cards.find((c) => c.id === draggingId);
    if (!card || card.column_id === colId) { setDraggingId(null); return; }
    const newPos = cards.filter((c) => c.column_id === colId).length;
    setCards((prev) => prev.map((c) => c.id === draggingId ? { ...c, column_id: colId, position: newPos } : c));
    setDraggingId(null);
    await fetchJson(`/api/kanban/cards/${draggingId}`, { method: 'PATCH', body: JSON.stringify({ column_id: colId, position: newPos }) });
  };

  const colCards = (colId: string) => cards.filter((c) => c.column_id === colId).sort((a, b) => a.position - b.position);

  if (loading) return <div className="page-content"><div className="empty-state" style={{ marginTop: 80 }}>Loading board…</div></div>;

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
        <div>
          <div className="page-title">Kanban Board</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>Shared across your organization · Drag cards between columns</div>
        </div>
        <button
          className="btn-secondary"
          onClick={() => setAddingColumn(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add Column
        </button>
      </div>

      {/* Board */}
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 16, alignItems: 'flex-start' }}>
        {columns.map((col, colIdx) => {
          const accent = COLUMN_ACCENT[colIdx % COLUMN_ACCENT.length];
          const cc = colCards(col.id);
          const isDragOver = dragOverColId === col.id;

          return (
            <div
              key={col.id}
              style={{
                width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
                background: 'var(--panel)', borderRadius: 6,
                border: isDragOver ? `1.5px solid ${accent}` : '1px solid var(--border-soft)',
                transition: 'border-color 0.12s',
              }}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDrop={(e) => onDrop(e, col.id)}
              onDragLeave={() => setDragOverColId(null)}
            >
              {/* Column header — top accent bar + title row */}
              <div style={{ height: 3, background: accent, borderRadius: '6px 6px 0 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 11px', borderBottom: '1px solid var(--border-soft)' }}>
                {editingColId === col.id ? (
                  <input
                    ref={colNameInputRef}
                    value={editingColName}
                    onChange={(e) => setEditingColName(e.target.value)}
                    onBlur={() => saveColName(col.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveColName(col.id); if (e.key === 'Escape') setEditingColId(null); }}
                    style={{
                      flex: 1, background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                      borderRadius: 4, padding: '3px 7px', fontSize: 12, fontWeight: 700,
                      color: 'var(--text)', fontFamily: 'inherit', letterSpacing: '0.02em',
                    }}
                  />
                ) : (
                  <div
                    style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text)', cursor: 'text', letterSpacing: '0.02em', textTransform: 'uppercase' }}
                    onClick={() => startEditCol(col)}
                    title="Click to rename"
                  >
                    {col.name}
                  </div>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 600, color: accent,
                  background: `${accent}1a`, borderRadius: 4, padding: '2px 8px', minWidth: 20, textAlign: 'center',
                }}>
                  {cc.length}
                </span>
                <button
                  onClick={() => deleteColumn(col.id)}
                  title="Delete column"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px 2px', display: 'flex', alignItems: 'center', opacity: 0.4, borderRadius: 3 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Cards list */}
              <div style={{ padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 40 }}>
                {cc.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, card.id)}
                    onDragEnd={onDragEnd}
                    onClick={() => openCard(card)}
                    style={{
                      background: 'var(--panel-strong)',
                      border: '1px solid var(--border-soft)',
                      borderLeft: `3px solid ${accent}`,
                      borderRadius: 4,
                      padding: '12px 13px',
                      cursor: 'grab',
                      height: CARD_HEIGHT,
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      opacity: draggingId === card.id ? 0.35 : 1,
                      transition: 'opacity 0.1s, box-shadow 0.12s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 10px rgba(0,0,0,0.25), 0 0 0 1px ${accent}44`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                  >
                    {/* Title */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {card.title}
                    </div>
                    {/* Description preview */}
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginTop: 4, flex: 1 }}>
                      {card.description ? card.description : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>No description</span>}
                    </div>
                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      {card.assigned_to ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 3, background: accent,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0,
                          }}>
                            {card.assigned_to.replace('@', '').charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{card.assigned_to}</span>
                        </div>
                      ) : <div />}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: 'var(--text-dim)', opacity: 0.4 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </div>
                  </div>
                ))}

                {/* Add card */}
                {addingCardColId === col.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-soft)', borderRadius: 4, padding: 10, background: 'var(--panel-strong)' }}>
                    <input
                      autoFocus
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setAddingCardColId(null); }}
                      placeholder="Card title…"
                      style={{
                        background: 'var(--panel)', border: '1px solid var(--border-soft)',
                        borderRadius: 3, padding: '6px 9px', fontSize: 12, fontWeight: 600,
                        color: 'var(--text)', fontFamily: 'inherit',
                      }}
                    />
                    <textarea
                      value={newCardDesc}
                      onChange={(e) => setNewCardDesc(e.target.value)}
                      placeholder="Description (optional)…"
                      rows={2}
                      style={{
                        background: 'var(--panel)', border: '1px solid var(--border-soft)',
                        borderRadius: 3, padding: '6px 9px', fontSize: 11,
                        color: 'var(--text)', fontFamily: 'inherit', resize: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 14px' }} onClick={() => addCard(col.id)}>Add</button>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setAddingCardColId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingCardColId(col.id); setNewCardTitle(''); setNewCardDesc(''); }}
                    style={{
                      background: 'none', border: '1px dashed var(--border-soft)', borderRadius: 4,
                      cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11,
                      padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 5, width: '100%',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.color = accent; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-soft)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)'; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                    Add card
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add column ghost */}
        {addingColumn ? (
          <div style={{
            width: 300, flexShrink: 0, background: 'var(--panel)', borderRadius: 6,
            border: '1px solid var(--border-soft)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <input
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addColumn(); if (e.key === 'Escape') setAddingColumn(false); }}
              placeholder="Column name…"
              style={{
                background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                borderRadius: 3, padding: '7px 10px', fontSize: 12, fontWeight: 600,
                color: 'var(--text)', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ fontSize: 11, padding: '4px 14px' }} onClick={addColumn}>Add</button>
              <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setAddingColumn(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Card detail modal */}
      {modalCard && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalCard(null); }}
        >
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--border-soft)',
            borderRadius: 6, width: '100%', maxWidth: 520,
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}>
            {/* Modal accent bar */}
            <div style={{ height: 3, background: COLUMN_ACCENT[columns.findIndex((c) => c.id === modalForm.column_id) % COLUMN_ACCENT.length] ?? '#6366f1' }} />
            <div style={{ padding: '22px 24px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Edit Card</div>

              <div className="form-grid">
                <div>
                  <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Title</label>
                  <input
                    className="input"
                    value={modalForm.title}
                    onChange={(e) => setModalForm((f) => ({ ...f, title: e.target.value }))}
                    autoFocus
                    style={{ fontWeight: 600, fontSize: 13 }}
                  />
                </div>
                <div>
                  <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Description</label>
                  <textarea
                    className="textarea"
                    value={modalForm.description}
                    onChange={(e) => setModalForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Add notes, links, context…"
                    rows={5}
                    style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.6 }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Assigned To</label>
                    <input
                      className="input"
                      value={modalForm.assigned_to}
                      onChange={(e) => setModalForm((f) => ({ ...f, assigned_to: e.target.value }))}
                      placeholder="Name or @handle"
                    />
                  </div>
                  <div>
                    <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Move to Column</label>
                    <select
                      className="input"
                      value={modalForm.column_id}
                      onChange={(e) => setModalForm((f) => ({ ...f, column_id: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    >
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>{col.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
                <button
                  onClick={() => deleteCard(modalCard.id)}
                  style={{
                    background: 'none', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4,
                    color: '#ef4444', fontSize: 11, padding: '6px 13px', cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setModalCard(null)} style={{ fontSize: 12 }}>Cancel</button>
                  <button className="btn" onClick={saveCard} disabled={modalSaving} style={{ fontSize: 12 }}>
                    {modalSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
