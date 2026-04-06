'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

type CredStatus = {
  api_id: string;
  phone: string;
  is_authenticated: boolean;
  has_code_pending: boolean;
} | null;

type TgUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  premium: boolean;
  verified: boolean;
  fake: boolean;
  bot: boolean;
  restricted: boolean;
  scam: boolean;
  bio: string | null;
  commonChats: number;
  lastSeen: string;
  photoBase64?: string | null;
};

type LookupResult =
  | { found: true; user: TgUser }
  | { found: false; message: string }
  | null;

// ─── Step indicator ─────────────────────────────────────────────────
function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="tgc-step">
      <div className={`tgc-step-circle ${active ? 'active' : done ? 'done' : ''}`}>
        {done ? (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 8 6.5 12 13 4" /></svg>
        ) : n}
      </div>
      <span className={`tgc-step-label ${active ? 'active' : done ? 'done' : ''}`}>{label}</span>
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: `${color}15`, border: `1px solid ${color}40`, color,
      letterSpacing: '0.02em',
    }}>{label}</span>
  );
}

// ─── Stat item ───────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tgc-stat">
      <div className="tgc-stat-value">{value}</div>
      <div className="tgc-stat-label">{label}</div>
    </div>
  );
}

// ─── Inline icon with hover tooltip ─────────────────────────────────
function InlineIcon({ tooltip, children }: { tooltip: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.top - 6, left: r.left + r.width / 2 });
    }
    setVisible(true);
  };

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setVisible(false)}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}>
      {children}
      {visible && pos && (
        <div style={{
          position: 'fixed', zIndex: 9999,
          top: pos.top, left: pos.left,
          transform: 'translate(-50%, -100%)',
          background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 5, padding: '4px 8px',
          fontSize: 11, color: 'rgba(255,255,255,0.55)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          {tooltip}
          <span style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderTop: '4px solid #1c1c1c',
          }} />
        </div>
      )}
    </span>
  );
}

// ─── Add Lead Modal ──────────────────────────────────────────────────
function AddLeadModal({ user, onClose, onSaved }: {
  user: TgUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [company, setCompany] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState(user.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number } | null>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchJson<{leads: {tags: string[]}[]}>('/api/leads').then(res => {
      const t = new Set<string>();
      res.leads?.forEach(l => l.tags?.forEach(tag => t.add(tag)));
      setAllTags(Array.from(t));
    }).catch(() => {});
  }, []);

  const openTagPicker = () => {
    if (tagPickerOpen) { setTagPickerOpen(false); return; }
    if (tagBtnRef.current) {
      const rect = tagBtnRef.current.getBoundingClientRect();
      setTagPickerPos({ top: rect.bottom + 4, left: rect.left });
    }
    setTagPickerOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)
        && e.target !== tagBtnRef.current) {
        setTagPickerOpen(false);
      }
    };
    if (tagPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [tagPickerOpen]);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  };

  const save = async () => {
    if (!firstName.trim() && !username.trim()) { setErr('First name or username is required.'); return; }
    setSaving(true); setErr(null);
    try {
      await fetchJson('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          telegram_username: username.trim().replace(/^@/, ''),
          company_name: company.trim(),
          tags,
          notes: notes.trim() || null,
          source: 'Telegram Checker',
        }),
      });
      onSaved();
    } catch (e) { setErr(String(e)); setSaving(false); }
  };

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 10, width: '100%', maxWidth: 460,
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        animation: 'tgcFadeIn 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid var(--border-soft)',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Add to Leads</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Review and edit before saving
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="tgc-field">
              <label className="tgc-label">First Name</label>
              <input className="auth-input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="tgc-field">
              <label className="tgc-label">Last Name</label>
              <input className="auth-input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            </div>
          </div>

          {/* Username */}
          <div className="tgc-field">
            <label className="tgc-label">Telegram Username</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 13, pointerEvents: 'none' }}>@</span>
              <input className="auth-input" style={{ paddingLeft: 22 }} value={username} onChange={e => setUsername(e.target.value.replace(/^@/, ''))} placeholder="username" />
            </div>
          </div>

          {/* Company */}
          <div className="tgc-field">
            <label className="tgc-label">Company</label>
            <input className="auth-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name (optional)" />
          </div>

          {/* Tags */}
          <div className="tgc-field" style={{ position: 'relative' }}>
            <label className="tgc-label">Tags</label>
            <div style={{ position: 'relative' }}>
              <div
                className="tgc-tag-input-wrap"
                onClick={() => tagInputRef.current?.focus()}
                style={{ paddingRight: 32 }}
              >
                {tags.map(t => (
                  <span key={t} className="tgc-tag-pill">
                    {t}
                    <button onClick={(e) => { e.stopPropagation(); removeTag(t); }} className="tgc-tag-remove">✕</button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  className="tgc-tag-inner-input"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKey}
                  onBlur={() => tagInput.trim() && addTag(tagInput)}
                  placeholder={tags.length === 0 ? 'Add tags…' : ''}
                />
              </div>
              <button
                type="button"
                ref={tagBtnRef}
                onClick={(e) => { e.stopPropagation(); openTagPicker(); }}
                title="Pick existing tag"
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: '2px 4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
              >+</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>Press Enter or comma to add a tag</div>
            
            {tagPickerOpen && tagPickerPos && (
              <div
                ref={tagPickerRef}
                style={{
                  position: 'fixed', zIndex: 10000,
                  top: tagPickerPos.top, left: tagPickerPos.left,
                  background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                  borderRadius: 6, padding: 4, minWidth: 160,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {allTags.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-dim)' }}>No tags yet</div>
                ) : allTags.map(tag => (
                  <div
                    key={tag}
                    onClick={() => { addTag(tag); setTagPickerOpen(false); }}
                    style={{
                      padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 12, color: 'var(--text-dim)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-alt)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)'; }}
                  >{tag}</div>
                ))}
              </div>
            )}
          </div>

          {/* Notes / Bio */}
          <div className="tgc-field">
            <label className="tgc-label">Notes</label>
            <textarea
              className="auth-input"
              style={{ minHeight: 64, resize: 'vertical', lineHeight: 1.5 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes about this lead (bio pre-filled if available)"
            />
          </div>

          {err && (
            <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px' }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '12px 20px 18px', borderTop: '1px solid var(--border-soft)',
        }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }}>Cancel</button>
          <button onClick={save} disabled={saving} className="btn" style={{ fontSize: 12, padding: '7px 18px' }}>
            {saving ? 'Saving…' : 'Add to Leads'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Avatar ─────────────────────────────────────────────────────
function UserAvatar({ user }: { user: TgUser }) {
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map(n => n![0].toUpperCase())
    .join('')
    || (user.username ? user.username[0].toUpperCase() : '?');

  // Stable colour derived from user id
  const colours = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f97316','#0ea5e9','#10b981'];
  const colourIdx = Number(BigInt(user.id || '0') % BigInt(colours.length));
  const bg = colours[colourIdx] ?? '#6366f1';

  if (user.photoBase64) {
    return (
      <div style={{
        width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden', border: '2px solid rgba(255,255,255,0.06)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${user.photoBase64}`}
          alt="Profile"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div style={{
      width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 20, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em',
      border: '2px solid rgba(255,255,255,0.06)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    }}>
      {initials}
    </div>
  );
}

// ─── Telegram-style Premium sparkle icon ─────────────────────────────
function IconPremium({ size = 15 }: { size?: number }) {
  // useId ensures each rendered instance gets a unique gradient ID,
  // preventing SVG <defs> collisions when multiple cards are on the page.
  const uid = useId();
  const gradId = `tgPremGrad-${uid.replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L13.6 10.4L22 12L13.6 13.6L12 22L10.4 13.6L2 12L10.4 10.4L12 2Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
}

// ─── User Result Card ────────────────────────────────────────────────
function UserCard({ user, onOpenModal, addLeadState }: {
  user: TgUser;
  onOpenModal: (u: TgUser) => void;
  addLeadState: 'idle' | 'done';
}) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown';
  const hasFlagBadges = user.bot || user.fake || user.restricted || user.scam;

  return (
    <div className="tgc-result-card">
      {/* ── Identity */}
      <div className="tgc-result-identity">
        <UserAvatar user={user} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tgc-result-name">
            {displayName}
            {user.premium && (
              <Badge label="Premium" color="#f59e0b" />
            )}
            {user.verified && (
              <InlineIcon tooltip="Verified by Telegram — notable public figure, organisation, or media outlet">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="11" fill="#2563eb" />
                  <polyline points="7 12.5 10.5 16 17 8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </InlineIcon>
            )}
          </div>
          {user.username && <div className="tgc-result-handle">@{user.username}</div>}
          {hasFlagBadges && (
            <div className="tgc-result-badges" style={{ marginTop: 6 }}>
              {user.bot && <Badge label="Bot" color="#14b8a6" />}
              {user.scam && <Badge label="⚠ Scam" color="#ef4444" />}
              {user.fake && <Badge label="⚠ Fake" color="#ef4444" />}
              {user.restricted && <Badge label="Restricted" color="#f97316" />}
            </div>
          )}
        </div>
      </div>

      {/* ── Bio */}
      <div className="tgc-result-bio">
        <div className="tgc-section-label">Bio</div>
        {user.bio
          ? <div className="tgc-bio-text">{user.bio}</div>
          : <div className="tgc-bio-empty">No bio set</div>
        }
      </div>

      {/* ── Stats */}
      <div className="tgc-result-stats">
        <Stat label="Last seen" value={user.lastSeen} />
        <div className="tgc-stat-divider" />
        <Stat label="Telegram ID" value={user.id} />
        {user.commonChats > 0 && <>
          <div className="tgc-stat-divider" />
          <Stat label="Common chats" value={String(user.commonChats)} />
        </>}
        {user.phone && <>
          <div className="tgc-stat-divider" />
          <Stat label="Phone" value={user.phone} />
        </>}
      </div>

      {/* ── Actions */}
      <div className="tgc-result-footer">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn"
            onClick={() => onOpenModal(user)}
            disabled={addLeadState === 'done'}
            style={{ fontSize: 12, padding: '7px 16px' }}
          >
            {addLeadState === 'done'
              ? <><span style={{ color: '#22c55e', marginRight: 5 }}>✓</span>Added to Leads</>
              : '+ Add to Leads'
            }
          </button>
          {user.username && (
            <a href={`https://t.me/${user.username}`} target="_blank" rel="noopener noreferrer"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '7px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              Open in Telegram
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function TelegramCheckerPage() {
  const [cred, setCred] = useState<CredStatus>(undefined as unknown as CredStatus);
  const [loading, setLoading] = useState(true);

  // Setup form
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [savingCred, setSavingCred] = useState(false);

  // Auth
  const [authStep, setAuthStep] = useState<'idle' | 'sending' | 'code' | 'verifying' | '2fa' | 'done'>('idle');
  const [code, setCode] = useState('');
  const [twoFaPass, setTwoFaPass] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Lookup
  const [username, setUsername] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [result, setResult] = useState<LookupResult>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-lead modal
  const [modalUser, setModalUser] = useState<TgUser | null>(null);
  const [addLeadState, setAddLeadState] = useState<'idle' | 'done'>('idle');

  const loadCred = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJson<{ credential: CredStatus }>('/api/experimental/tg-credentials');
      setCred(res.credential);
      if (res.credential?.is_authenticated) setAuthStep('done');
      else if (res.credential?.has_code_pending) setAuthStep('code');
      else if (res.credential) setAuthStep('idle');
    } catch { setCred(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void loadCred(); }, [loadCred]);
  useEffect(() => { if (authStep === 'code') setTimeout(() => codeInputRef.current?.focus(), 100); }, [authStep]);

  const saveCred = async () => {
    if (!apiId || !apiHash || !phone) { setError('All fields are required.'); return; }
    setSavingCred(true); setError(null);
    try {
      await fetchJson('/api/experimental/tg-credentials', {
        method: 'POST', body: JSON.stringify({ api_id: apiId, api_hash: apiHash, phone }),
      });
      await loadCred();
    } catch (e) { setError(String(e)); }
    setSavingCred(false);
  };

  const sendCode = async () => {
    setAuthStep('sending'); setError(null);
    try {
      const res = await fetchJson<{ ok: boolean; error?: string }>('/api/experimental/tg-auth', {
        method: 'POST', body: JSON.stringify({ action: 'send-code' }),
      });
      if (res.error) { setError(res.error); setAuthStep('idle'); return; }
      setAuthStep('code'); await loadCred();
    } catch (e) { setError(String(e)); setAuthStep('idle'); }
  };

  const verifyCode = async () => {
    if (!code.trim()) { setError('Enter the code.'); return; }
    setAuthStep('verifying'); setError(null);
    try {
      const res = await fetchJson<{ ok: boolean; step?: string; error?: string }>('/api/experimental/tg-auth', {
        method: 'POST', body: JSON.stringify({ action: 'verify', code: code.trim(), password: twoFaPass || undefined }),
      });
      if (res.error) { setError(res.error); setAuthStep('code'); return; }
      if (res.step === '2fa') { setAuthStep('2fa'); return; }
      setAuthStep('done'); await loadCred();
    } catch (e) { setError(String(e)); setAuthStep('code'); }
  };

  const disconnect = async () => {
    setError(null);
    try {
      await fetchJson('/api/experimental/tg-credentials', { method: 'DELETE' });
      setCred(null); setAuthStep('idle'); setResult(null);
      setApiId(''); setApiHash(''); setPhone('');
    } catch (e) { setError(String(e)); }
  };

  const lookupUser = async () => {
    if (!username.trim()) return;
    setLookupLoading(true); setResult(null); setError(null); setAddLeadState('idle');
    try {
      const res = await fetchJson<LookupResult & { error?: string }>('/api/experimental/tg-lookup', {
        method: 'POST', body: JSON.stringify({ username: username.trim() }),
      });
      if ((res as { error?: string })?.error) setError((res as { error: string }).error);
      else setResult(res as LookupResult);
    } catch (e) { setError(String(e)); }
    setLookupLoading(false);
  };

  const isAuthenticated = authStep === 'done' || cred?.is_authenticated;
  const hasCredentials = Boolean(cred);
  const currentStep = !hasCredentials ? 1 : !isAuthenticated ? 2 : 3;

  if (loading) {
    return <div className="page-content"><div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div></div>;
  }

  return (
    <div className="page-content">

      {/* Add Lead Modal */}
      {modalUser && (
        <AddLeadModal
          user={modalUser}
          onClose={() => setModalUser(null)}
          onSaved={() => { setModalUser(null); setAddLeadState('done'); }}
        />
      )}

      {/* ── Header */}
      <div className="tgc-page-header">
        <div>
          <div className="tgc-page-title">
            <span className="exp-badge-label">β Experimental</span>
            Telegram Username Checker
          </div>
          <div className="tgc-page-subtitle">Look up any Telegram username — bio, status, account flags, and more.</div>
        </div>
        {isAuthenticated && cred && (
          <div className="tgc-connected-pill">
            <span className="tgc-online-dot" />
            Connected · {cred.phone}
            <button className="tgc-disconnect-btn" onClick={disconnect}>Disconnect</button>
          </div>
        )}
      </div>

      {/* ── Steps */}
      <div className="tgc-steps">
        <Step n={1} label="Add API Credentials" active={currentStep === 1} done={currentStep > 1} />
        <div className="tgc-step-line" />
        <Step n={2} label="Connect Account" active={currentStep === 2} done={currentStep > 2} />
        <div className="tgc-step-line" />
        <Step n={3} label="Look Up Users" active={currentStep === 3} done={false} />
      </div>

      {error && (
        <div className="tgc-error-banner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px', fontSize: 14 }}>✕</button>
        </div>
      )}

      <div className="tgc-layout">
        {/* ── Left panel */}
        <div className="tgc-left">
          {!hasCredentials && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Add your Telegram API</div>
              <div className="card-subtitle" style={{ marginBottom: 20 }}>
                Get <code style={{ color: 'var(--accent)', fontSize: 11 }}>api_id</code> &amp; <code style={{ color: 'var(--accent)', fontSize: 11 }}>api_hash</code> from{' '}
                <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>my.telegram.org/apps</a>.
                Stored per profile, not shared.
              </div>
              <div className="tgc-form">
                <div className="tgc-field">
                  <label className="tgc-label">API ID</label>
                  <input className="auth-input" placeholder="12345678" value={apiId} onChange={e => setApiId(e.target.value)} type="text" />
                </div>
                <div className="tgc-field">
                  <label className="tgc-label">API Hash</label>
                  <input className="auth-input" placeholder="abcdef1234…" value={apiHash} onChange={e => setApiHash(e.target.value)} type="password" />
                </div>
                <div className="tgc-field">
                  <label className="tgc-label">Phone Number</label>
                  <input className="auth-input" placeholder="+1 234 567 8900" value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
                </div>
                <button className="btn" onClick={saveCred} disabled={savingCred} style={{ marginTop: 4 }}>
                  {savingCred ? 'Saving…' : 'Save & Continue →'}
                </button>
              </div>
            </div>
          )}

          {hasCredentials && !isAuthenticated && (
            <div className="card">
              <div className="tgc-auth-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.7a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </div>
              <div className="card-title" style={{ marginBottom: 4, textAlign: 'center' }}>Connect your Account</div>
              <div className="card-subtitle" style={{ marginBottom: 20, textAlign: 'center' }}>
                Sending to <strong style={{ color: 'var(--text-muted)' }}>{cred?.phone}</strong>
              </div>
              {(authStep === 'idle' || authStep === 'sending') && (
                <button className="btn" onClick={sendCode} disabled={authStep === 'sending'} style={{ width: '100%' }}>
                  {authStep === 'sending' ? 'Sending code…' : 'Send Telegram Code'}
                </button>
              )}
              {(authStep === 'code' || authStep === 'verifying' || authStep === '2fa') && (
                <div className="tgc-form">
                  <div className="tgc-field">
                    <label className="tgc-label">Verification Code</label>
                    <input ref={codeInputRef} className="auth-input" placeholder="12345" value={code}
                      onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verifyCode()}
                      type="text" maxLength={8} />
                  </div>
                  {authStep === '2fa' && (
                    <div className="tgc-field">
                      <label className="tgc-label">2FA Password</label>
                      <input className="auth-input" placeholder="Two-factor password" value={twoFaPass} onChange={e => setTwoFaPass(e.target.value)} type="password" />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={verifyCode} disabled={authStep === 'verifying'} style={{ flex: 1 }}>
                      {authStep === 'verifying' ? 'Verifying…' : 'Verify →'}
                    </button>
                    <button className="btn-secondary" onClick={sendCode} style={{ fontSize: 11 }}>Resend</button>
                  </div>
                </div>
              )}
              <button onClick={disconnect} style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                Use a different account
              </button>
            </div>
          )}

          {isAuthenticated && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Check a Username</div>
              <div className="card-subtitle" style={{ marginBottom: 16 }}>Enter any Telegram handle to look up their profile.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 13, fontWeight: 500, pointerEvents: 'none' }}>@</span>
                  <input className="auth-input" style={{ paddingLeft: 22 }} placeholder="username"
                    value={username} onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
                    onKeyDown={e => e.key === 'Enter' && lookupUser()} type="text" />
                </div>
                <button className="btn" onClick={lookupUser} disabled={lookupLoading || !username.trim()} style={{ flexShrink: 0, padding: '0 16px', minWidth: 44 }}>
                  {lookupLoading
                    ? <span className="tgc-spinner" />
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  }
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel */}
        <div className="tgc-right">
          {lookupLoading && (
            <div className="tgc-empty-state">
              <div className="tgc-pulse-dot" />
              <span>Querying Telegram…</span>
            </div>
          )}
          {!lookupLoading && result === null && isAuthenticated && (
            <div className="tgc-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ opacity: 0.15 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span>Enter a username and press search</span>
            </div>
          )}
          {!lookupLoading && result !== null && !result.found && (
            <div className="tgc-empty-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.25 }}>
                <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
              </svg>
              <span style={{ color: 'var(--text-muted)' }}>{result.message}</span>
            </div>
          )}
          {!lookupLoading && result?.found && (
            <UserCard
              user={result.user}
              onOpenModal={setModalUser}
              addLeadState={addLeadState}
            />
          )}
          {!isAuthenticated && !lookupLoading && (
            <div className="tgc-placeholder-card">
              <div style={{ flex: 1 }}>
                <div className="tgc-placeholder-line wide" />
                <div className="tgc-placeholder-line medium" style={{ marginTop: 8 }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                  <div className="tgc-placeholder-pill" /><div className="tgc-placeholder-pill" style={{ width: 48 }} />
                </div>
                <div style={{ height: 1, background: 'var(--border-soft)', margin: '18px 0' }} />
                <div className="tgc-placeholder-line" style={{ width: '85%' }} />
                <div className="tgc-placeholder-line wide" style={{ marginTop: 6 }} />
                <div className="tgc-placeholder-line medium" style={{ marginTop: 6 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
