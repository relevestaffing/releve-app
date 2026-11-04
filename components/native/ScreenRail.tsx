import Link from 'next/link';

/* The opening of every first-level screen on the phone (Nona, 3 November
   2026: feature cards, from Open's Discover). A row of large photo cards you
   swipe: the first is this screen, its name and its key item set on the
   picture; the rooms that follow peek in from the right and open with a tap.
   Each card wears its room's material, the same as its tile on Home. */
export type RailCard = { href: string; label: string; mat: string };

export default function ScreenRail({ here, eyebrow, title, meta, next }: {
  here: RailCard; eyebrow?: string; title: string; meta?: string; next: RailCard[];
}) {
  return (
    <div className="nv-feat" role="list" aria-label="Rooms">
      <div className="nv-card here" role="listitem" aria-current="page"
        style={{ ['--hero' as any]: `url(/atmos/tiles/${here.mat}.webp)` }}>
        <span className="nv-card-eye">{eyebrow || here.label}</span>
        <h1 className="nv-card-title">{title}</h1>
        {meta && <span className="nv-card-meta">{meta}</span>}
      </div>
      {next.map((c, i) => (
        <Link key={c.href} href={c.href} className="nv-card" role="listitem" data-title={c.label}
          style={{ ['--hero' as any]: `url(/atmos/tiles/${c.mat}.webp)`, ['--kb' as any]: `${-4 * (i + 1)}s` }}>
          <span className="nv-card-eye">Next</span>
          <span className="nv-card-title">{c.label}</span>
        </Link>
      ))}
    </div>
  );
}
