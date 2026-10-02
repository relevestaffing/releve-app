import type { Manager } from '@/lib/experience-public';
import { REPLY_PROMISE } from '@/lib/experience-public';

/* The person who looks after you, by name and face, with the one promise
   that matters about them: how soon they answer. Presentational only, so it
   renders the same in a server page or inside a client thread. */
export default function ManagerLine({ manager, compact = false, onDark = false }: {
  manager: Manager; compact?: boolean; onDark?: boolean;
}) {
  const initials = manager.id
    ? manager.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
    : 'R';
  return (
    <div className={`mgr-line${compact ? ' compact' : ''}${onDark ? ' on-dark' : ''}`}>
      {manager.photo
        ? <span className="mgr-face" role="img" aria-label={manager.name}
            style={{ backgroundImage: `url("${manager.photo}")` }} />
        : <span className="mgr-face plate" aria-hidden="true">{initials}</span>}
      <span className="mgr-text">
        <b>{manager.name}</b>
        <span className="xs">{manager.id ? `Your ${manager.title}` : `${manager.title.replace(/ Manager$/, '')}, at Relève`}</span>
        {!compact && <span className="xs mgr-promise">{REPLY_PROMISE}</span>}
      </span>
    </div>
  );
}
