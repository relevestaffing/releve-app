export const metadata = { title: 'Add Relève to your devices' };

/* Step four: put Relève where it is one tap away. Public, so it works from
   the onboarding email and straight after the account is opened. */
export default function Install() {
  const Row = ({ k, t }: { k: string; t: string }) => (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--rule, rgba(53,68,58,.16))', textAlign: 'left' }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{k}</div>
      <div className="small">{t}</div>
    </div>
  );
  return (
    <div className="auth">
      <div style={{ maxWidth: 520, width: '100%' }}>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Step 4 of 4</div>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Keep Relève one tap away</h2>
          <p className="note" style={{ marginBottom: 14 }}>
            Add it to your home screen or dock and it opens full screen, like any other app.
          </p>
          <Row k="iPhone" t="Open app.relevestaffing.com/app in Safari. Tap Share, then Add to Home Screen." />
          <Row k="Android" t="Open it in Chrome. Tap the menu, then Install app." />
          <Row k="Mac" t="Open it in Safari. Choose File, then Add to Dock." />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
            <a className="btn solid" href="/app">Continue to your account</a>
            <a className="btn ghost" href="/guides/Add-Releve-to-your-device.pdf">Open the illustrated guide</a>
          </div>
        </div>
      </div>
    </div>
  );
}
