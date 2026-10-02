'use client';

/* Print, or Save as PDF from the same dialog. No PDF library: the browser
   already makes a better PDF from the page than anything worth bundling. */
export default function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn sm solid no-print" onClick={() => window.print()}>{label}</button>
  );
}
