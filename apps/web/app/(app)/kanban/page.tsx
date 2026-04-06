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

export default function KanbanPage() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Card modal
  const [modalCard, setModalCard] = useState<KanbanCard | null>(null);
  const [modalForm, setModalForm] = useState({ title: '', description: '', assigned_to: '', column_id: '' });
  const [modalSaving, setModalSaving] = useState(false);

  // Inline editing
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const colNameInputRef = useRef<HTMLInputElement>(null);

  // Add card
  const [addingCardColId, setAddingCardColId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  // Add column
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

  useEffect(() => {
    if (editingColId && colNameInputRef.current) colNameInputRef.current.focus();
  }, [editingColId]);

  // ── Column actions ──────────────────────────────────────────────────
  const startEditCol = (col: KanbanColumn) => {
    setEditingColId(col.id);
    setEditingColName(col.name);
  };

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
    const data = await fetchJson<{ column: KanbanColumn }>('/api/kanban', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (data.column) setColumns((prev) => [...prev, data.column]);
  };

  // ── Card actions ────────────────────────────────────────────────────
  const addCard = async (colId: string) => {
    const title = newCardTitle.trim();
    if (!title) { setAddingCardColId(null); return; }
    setAddingCardColId(null);
    setNewCardTitle('');
    const data = await fetchJson<{ card: KanbanCard }>('/api/kanban/cards', {
      method: 'POST',
      body: JSON.stringify({ column_id: colId, title }),
    });
    if (data.card) setCards((prev) => [...prev, data.card]);
  };

  const openCard = (card: KanbanCard) => {
    setModalCard(card);
    setModalForm({
      title: card.title,
      description: card.description ?? '',
      assigned_to: card.assigned_to ?? '',
      column_id: card.column_id,
    });
  };

  const saveCard = async () => {
    if (!modalCard) return;
    setModalSaving(true);
    const patch = {
      title: modalForm.title.trim() || modalCard.title,
      description: modalForm.description || null,
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
  const onDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggingId(cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColId(colId);
  };

  const onDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverColId(null);
    if (!draggingId || draggingId === '') return;
    const card = cards.find((c) => c.id === draggingId);
    if (!card || card.column_id === colId) { setDraggingId(null); return; }

    const newPosition = cards.filter((c) => c.column_id === colId).length;
    setCards((prev) => prev.map((c) => c.id === draggingId ? { ...c, column_id: colId, position: newPosition } : c));
    setDraggingId(null);
    await fetchJson(`/api/kanban/cards/${draggingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ column_id: colId, position: newPosition }),
    });
  };

  const onDragEnd = () => { setDraggingId(null); setDragOverColId(null); };

  const colCards = (colId: string) =>
    cards.filter((c) => c.column_id === colId).sort((a, b) => a.position - b.position);

  if (loading) {
    return <div className="page-content"><div className="empty-state" style={{ marginTop: 80 }}>Loading board…</div></div>;
  }

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
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
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 16, alignItems: 'flex-start' }}>
        {columns.map((col, colIdx) => {
          const accent = COLUMN_ACCENT[colIdx % COLUMN_ACCENT.length];
          const cc = colCards(col.id);
          const isDragOver = dragOverColId === col.id;

          return (
            <div
              key={col.id}
              style={{
                width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0,
                background: 'var(--panel)', borderRadius: 10,
                border: isDragOver ? `1.5px solid ${accent}` : '1px solid var(--border-soft)',
                transition: 'border-color 0.15s',
              }}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDrop={(e) => onDrop(e, col.id)}
              onDragLeave={() => setDragOverColId(null)}
            >
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px 10px',
                borderBottom: '1px solid var(--border-soft)',
              }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />
                {editingColId === col.id ? (
                  <input
                    ref={colNameInputRef}
                    value={editingColName}
                    onChange={(e) => setEditingColName(e.target.value)}
                    onBlur={() => saveColName(col.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveColName(col.id); if (e.key === 'Escape') setEditingColId(null); }}
                    style={{
                      flex: 1, background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                      borderRadius: 4, padding: '2px 6px', fontSize: 12, fontWeight: 600,
                      color: 'var(--text)', fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <div
                    style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}
                    onClick={() => startEditCol(col)}
                    title="Click to rename"
                  >
                    {col.name}
                  </div>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 600, color: accent,
                  background: `${accent}18`, borderRadius: 20, padding: '1px 7px',
                }}>
                  {cc.length}
                </span>
                <button
                  onClick={() => deleteColumn(col.id)}
                  title="Delete column"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, borderRadius: 4 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Cards */}
              <div style={{ padding: '8px 8px 4px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 40 }}>
                {cc.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, card.id)}
                    onDragEnd={onDragEnd}
                    onClick={() => openCard(card)}
                    style={{
                      background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                      borderRadius: 7, padding: '9px 11px', cursor: 'pointer',
                      opacity: draggingId === card.id ? 0.4 : 1,
                      transition: 'opacity 0.1s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1.5px ${accent}55`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {card.title}
                    </div>
                    {card.assigned_to && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', background: accent,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0,
                        }}>
                          {card.assigned_to.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{card.assigned_to}</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add card inline */}
                {addingCardColId === col.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      autoFocus
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addCard(col.id); } if (e.key === 'Escape') setAddingCardColId(null); }}
                      placeholder="Card title…"
                      rows={2}
                      style={{
                        background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                        borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)',
                        fontFamily: 'inherit', resize: 'none', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => addCard(col.id)}>Add</button>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setAddingCardColId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingCardColId(col.id); setNewCardTitle(''); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-dim)', fontSize: 11, padding: '5px 4px',
                      display: 'flex', alignItems: 'center', gap: 4, borderRadius: 5, width: '100%', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)'; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                    Add card
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add column inline */}
        {addingColumn ? (
          <div style={{
            width: 272, flexShrink: 0, background: 'var(--panel)', borderRadius: 10,
            border: '1px solid var(--border-soft)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <input
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addColumn(); if (e.key === 'Escape') setAddingColumn(false); }}
              placeholder="Column name…"
              style={{
                background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ fontSize: 11, padding: '4px 12px' }} onClick={addColumn}>Add</button>
              <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setAddingColumn(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Card modal */}
      {modalCard && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalCard(null); }}
        >
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--border-soft)',
            borderRadius: 12, padding: 28, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Edit Card</div>

            <div className="form-grid">
              <div>
                <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Title</label>
                <input
                  className="input"
                  value={modalForm.title}
                  onChange={(e) => setModalForm((f) => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  className="textarea"
                  value={modalForm.description}
                  onChange={(e) => setModalForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Add a description…"
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div>
                <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Assigned To</label>
                <input
                  className="input"
                  value={modalForm.assigned_to}
                  onChange={(e) => setModalForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  placeholder="Name or @handle"
                />
              </div>
              <div>
                <label className="dim" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Column</label>
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
              <button
                onClick={() => deleteCard(modalCard.id)}
                style={{
                  background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
                  color: '#ef4444', fontSize: 11, padding: '6px 12px', cursor: 'pointer',
                }}
              >
                Delete Card
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
      )}
    </div>
  );
}
