// Whether two pictures are the same, byte for byte: two saved here, or one saved here and one in a file (see
// deckMatch). Sizes first, so pictures that differ are told apart without reading them; each picture's bytes are
// read once per comparer.
import { File, Paths } from 'expo-file-system';

import type { FilePicture } from './deckFile';

const sameBytes = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** A base64 picture's size in bytes, without decoding it. */
const base64Size = (data: string) => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
const fromBase64 = (data: string) => Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));

/** Comparers for one run of comparisons, remembering what they've read. */
export function pictureComparer() {
  const sizes = new Map<string, number>();
  const bytes = new Map<string, Uint8Array>();
  const sizeOf = (path: string) => {
    if (!sizes.has(path)) {
      let size = -1;
      try {
        size = new File(Paths.document, path).size ?? -1;
      } catch {}
      sizes.set(path, size);
    }
    return sizes.get(path)!;
  };
  const bytesOf = (path: string) => {
    if (!bytes.has(path)) bytes.set(path, new File(Paths.document, path).bytesSync());
    return bytes.get(path)!;
  };
  const fileBytes = new Map<string, Uint8Array>();
  const pictureBytes = (p: FilePicture) => {
    const key = 'data' in p ? p.data : p.name;
    if (!fileBytes.has(key)) fileBytes.set(key, 'data' in p ? fromBase64(p.data) : p.bytes());
    return fileBytes.get(key)!;
  };
  /** Two pictures saved here. */
  const saved = (a: string, b: string) => {
    if (a === b) return true;
    const size = sizeOf(a);
    if (size < 0 || size !== sizeOf(b)) return false;
    try {
      return sameBytes(bytesOf(a), bytesOf(b));
    } catch {
      return false;
    }
  };
  /** A picture saved here and one in a file. */
  const withFile = (path: string, p: FilePicture) => {
    const size = sizeOf(path);
    if (size < 0) return false;
    try {
      if ('data' in p) return base64Size(p.data) === size && sameBytes(bytesOf(path), pictureBytes(p));
      const theirs = pictureBytes(p);
      return theirs.length === size && sameBytes(bytesOf(path), theirs);
    } catch {
      return false;
    }
  };
  return { saved, withFile };
}
