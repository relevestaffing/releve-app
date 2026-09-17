/* What the bytes actually are, not what the browser said they were.
   ------------------------------------------------------------------
   `file.type` on an upload is whatever the uploader's OS, or a rename, or a
   hand-written multipart request claimed. It is not a fact about the file.
   /api/vetting has checked the real bytes since the September audit; apply,
   photo and video did not, so an executable could arrive labelled
   application/pdf and be stored, served and opened under that name.

   This is that check, shared, so a new upload route cannot quietly skip it. */

type Kind = 'document' | 'image' | 'video';

const startsWith = (b: Buffer, sig: number[]) =>
  b.length >= sig.length && sig.every((v, i) => b[i] === v);

const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

/* Documents: PDF, legacy .doc (an OLE2 compound file), and .docx (a zip). */
function isDocument(b: Buffer): boolean {
  if (ascii(b, 0, 5) === '%PDF-') return true;
  if (startsWith(b, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return true;   // .doc
  if (startsWith(b, [0x50, 0x4B, 0x03, 0x04])) return true;                            // .docx (zip)
  if (startsWith(b, [0x50, 0x4B, 0x05, 0x06])) return true;                            // empty zip
  return false;
}

function isImage(b: Buffer): boolean {
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;                     // jpeg
  if (startsWith(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return true;     // png
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return true;             // webp
  if (ascii(b, 0, 3) === 'GIF') return true;                                            // gif
  return false;
}

/* Video containers, by the handful that a phone or a laptop actually produces.
   MP4, M4V, MOV and 3GP all carry an `ftyp` box at offset 4; older QuickTime
   files lead with one of the other top-level box names instead. */
function isVideo(b: Buffer): boolean {
  const box = ascii(b, 4, 8);
  if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(box)) return true;
  if (startsWith(b, [0x1A, 0x45, 0xDF, 0xA3])) return true;                             // webm / matroska
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'AVI ') return true;             // avi
  return false;
}

/** True when the bytes really are the kind of thing claimed. */
export function looksLike(kind: Kind, bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (kind === 'document') return isDocument(bytes);
  if (kind === 'image') return isImage(bytes);
  return isVideo(bytes);
}
