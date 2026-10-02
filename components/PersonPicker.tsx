'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type Person = {
  id: string; full_name: string | null; email: string;
  role?: string; org_name?: string | null; headline?: string | null;
};

/* A picker you can type into.

   A dropdown is fine with eight people and unusable with eighty — and a
   staffing business is meant to end up with eighty. Type any part of a name,
   a company or an email; arrow keys and Enter work; the chosen person stays
   visible with a way to clear them. */
export default function PersonPicker({
  people, value, onChange, name, placeholder = 'Type a name…', label, autoFocus
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
  name?: string;                 // renders a hidden input, for plain <form> posts
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const chosen = people.find(p => p.id === value) ?? null;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = people.slice().sort((a, b) =>
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
    if (!needle) return all.slice(0, 60);
    return all.filter(p =>
      [p.full_name, p.email, p.org_name, p.headline]
        .filter(Boolean)
        .some(f => String(f).toLowerCase().includes(needle))
    ).slice(0, 60);
  }, [people, q]);

  useEffect(() => { setCursor(0); }, [q]);

  /* Clicking anywhere else closes it. */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function choose(p: Person) {
    onChange(p.id);
    setQ('');
    setOpen(false);
  }

  const fid = useId();

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(c + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[cursor]) { e.preventDefault(); choose(shown[cursor]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="ff picker" ref={box}>
      {label && <label htmlFor={fid}>{label}</label>}
      {name && <input type="hidden" name={name} value={value} />}

      {chosen ? (
        <div className="picker-chosen">
          <div>
            <b>{chosen.full_name ?? chosen.email}</b>
            {(chosen.org_name || chosen.headline) &&
              <div className="xs muted">{chosen.org_name ?? chosen.headline}</div>}
          </div>
          <button type="button" className="picker-clear"
            onClick={() => { onChange(''); setQ(''); setOpen(true); }}
            aria-label="Choose someone else">Change</button>
        </div>
      ) : (
        <>
          <input id={fid}
            aria-label={label ? undefined : (placeholder ?? 'Search people')}
            value={q} autoFocus={autoFocus} placeholder={placeholder}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={keys}
            role="combobox" aria-expanded={open} aria-autocomplete="list" />

          {open && (
            <div className="picker-list" role="listbox">
              {shown.length === 0 ? (
                <div className="picker-none">
                  {people.length === 0
                    ? 'Nobody on file yet.'
                    : `Nobody matches “${q.trim()}”.`}
                </div>
              ) : shown.map((p, i) => (
                <button key={p.id} type="button" role="option"
                  aria-selected={i === cursor}
                  className={i === cursor ? 'on' : ''}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(p)}>
                  <b>{p.full_name ?? p.email}</b>
                  <span className="xs">
                    {[p.org_name, p.headline, p.email].filter(Boolean)[0]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
