/* A tiny tap under the finger where the phone allows it (Android and some
   browsers). iPhone Safari does not expose vibration to web pages, so there
   it is silently nothing: the press feedback in appfeel.css carries it. */
export function haptic(ms = 8) {
  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms); } catch { /* never matters */ }
}
