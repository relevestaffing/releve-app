/* Opening a signed link in a new tab, in a way Safari allows.
   ----------------------------------------------------------
   Safari (and iOS) only let a page open a new tab synchronously inside the
   tap itself. Fetching the short-lived link first and calling window.open()
   after the await was silently blocked: the button did nothing at all. This
   opens the tab immediately, then points it at the link once it arrives, and
   closes it with a clear message if the link never comes. Browser-only. */
export async function openSignedLink(
  getUrl: () => Promise<string | null | undefined>,
  onFail: (message: string) => void,
  failMessage = 'That file did not open. Please try again.'
) {
  let tab: Window | null = null;
  try {
    tab = window.open('', '_blank');
    if (tab) {
      try { tab.opener = null; tab.document.title = 'Opening…'; } catch { /* cross-origin later; fine */ }
    }
  } catch { tab = null; }

  try {
    const url = await getUrl();
    if (!url) throw new Error('no link');
    if (tab && !tab.closed) tab.location.href = url;
    else window.location.assign(url);           // pop-ups blocked entirely: same tab, still works
  } catch (e: any) {
    try { tab?.close(); } catch { /* already gone */ }
    onFail(typeof e?.message === 'string' && e.message !== 'no link' ? e.message : failMessage);
  }
}
