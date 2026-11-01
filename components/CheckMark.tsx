/* A drawn tick, so a finished step is a mark in the type's own weight
   rather than a font's dingbat (which some systems render as an emoji). */
export default function CheckMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false" style={{ display: 'inline-block', verticalAlign: '-1px' }}>
      <path d="M2.4 6.3l2.3 2.3 4.9-5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
