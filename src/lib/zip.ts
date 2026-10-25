// Zip files, as Shufflevale files are (see deckFile.ts): written an entry at a time and read an entry at a time,
// so a file of any size is never all in memory. Only what the app needs: entries are written stored, as they are
// (pictures are compressed already), and read stored or deflated (a file zipped again elsewhere); no Zip64 (so up
// to 4 GB), no encryption.
import { inflateSync, strFromU8, strToU8 } from 'fflate';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of some bytes, as a zip keeps for each entry. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Thrown for a zip that's damaged, or one this can't read. */
export class ZipError extends Error {}

/** The most a zip can be (without Zip64), and the most entries it can have. */
const MAX_BYTES = 0xffffffff;
const MAX_ENTRIES = 0xffff;

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** Names are UTF-8. */
const UTF8 = 0x0800;

/** A time as a zip keeps it (to two seconds, in local time). */
function dosTime(when: Date): { time: number; date: number } {
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    date: (Math.max(0, when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** Builds a little-endian record of 16- and 32-bit numbers, then a name. */
function record(fields: [number, 2 | 4][], name: Uint8Array): Uint8Array {
  const size = fields.reduce((sum, [, n]) => sum + n, 0);
  const out = new Uint8Array(size + name.length);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const [value, n] of fields) {
    if (n === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value >>> 0, true);
    at += n;
  }
  out.set(name, size);
  return out;
}

/**
 * Writes a zip through `write` (given its bytes in order), an entry at a time: `add` each, then `finish`. Throws a
 * ZipError if it would be over 4 GB.
 */
export class ZipWriter {
  private at = 0;
  private entries: { name: Uint8Array; crc: number; size: number; at: number }[] = [];
  private write: (bytes: Uint8Array) => void;
  private stamp: { time: number; date: number };

  constructor(write: (bytes: Uint8Array) => void, when = new Date()) {
    this.write = write;
    this.stamp = dosTime(when);
  }

  private put(bytes: Uint8Array) {
    this.write(bytes);
    this.at += bytes.length;
  }

  add(name: string, data: Uint8Array) {
    const encoded = strToU8(name);
    if (this.entries.length >= MAX_ENTRIES || this.at + 30 + encoded.length + data.length > MAX_BYTES) {
      throw new ZipError('It’s too big to save as one file (over 4 GB).');
    }
    const crc = crc32(data);
    const { time, date } = this.stamp;
    this.entries.push({ name: encoded, crc, size: data.length, at: this.at });
    // Version 2.0, UTF-8 name, stored.
    const header: [number, 2 | 4][] = [[LOCAL, 4], [20, 2], [UTF8, 2], [0, 2], [time, 2], [date, 2], [crc, 4], [data.length, 4], [data.length, 4], [encoded.length, 2], [0, 2]];
    this.put(record(header, encoded));
    this.put(data);
  }

  finish() {
    const start = this.at;
    const { time, date } = this.stamp;
    for (const e of this.entries) {
      const fields: [number, 2 | 4][] = [
        [CENTRAL, 4], [20, 2], [20, 2], [UTF8, 2], [0, 2], [time, 2], [date, 2], [e.crc, 4], [e.size, 4], [e.size, 4],
        [e.name.length, 2], [0, 2], [0, 2], [0, 2], [0, 2], [0, 4], [e.at, 4],
      ];
      this.put(record(fields, e.name));
    }
    const count = this.entries.length;
    if (this.at + 22 > MAX_BYTES) throw new ZipError('It’s too big to save as one file (over 4 GB).');
    this.put(record([[END, 4], [0, 2], [0, 2], [count, 2], [count, 2], [this.at - start, 4], [start, 4], [0, 2]], new Uint8Array()));
  }
}

/** An entry in a zip, as its directory lists it: where its header is, and its sizes. */
export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  /** As it is (unpacked). */
  size: number;
  /** As it's kept in the zip. */
  packed: number;
  /** Where its own header is. */
  at: number;
}

/** Reads `length` bytes of a file from `offset` (fewer at its end). */
export type ReadAt = (offset: number, length: number) => Uint8Array;

/** Whether bytes are the start of a zip. */
export const isZip = (head: Uint8Array) => head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** The entries of a zip `size` bytes long, from its directory (at its end). Throws a ZipError if it's damaged. */
export function zipEntries(size: number, readAt: ReadAt): ZipEntry[] {
  // The end record is in the last 22 bytes, or before a comment of up to 64 KB.
  const tailAt = Math.max(0, size - 22 - 0xffff);
  const tail = readAt(tailAt, size - tailAt);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new ZipError('No zip directory.');
  const e = view(tail.subarray(end));
  const count = e.getUint16(10, true);
  const dirSize = e.getUint32(12, true);
  const dirAt = e.getUint32(16, true);
  if (dirAt + dirSize > size) throw new ZipError('The zip directory is cut short.');
  const dir = readAt(dirAt, dirSize);
  const d = view(dir);
  const entries: ZipEntry[] = [];
  for (let i = 0, at = 0; i < count; i++) {
    if (at + 46 > dir.length || d.getUint32(at, true) !== CENTRAL) throw new ZipError('The zip directory is damaged.');
    const nameLength = d.getUint16(at + 28, true);
    const extra = d.getUint16(at + 30, true);
    const comment = d.getUint16(at + 32, true);
    entries.push({
      name: strFromU8(dir.subarray(at + 46, at + 46 + nameLength)),
      method: d.getUint16(at + 10, true),
      crc: d.getUint32(at + 16, true),
      packed: d.getUint32(at + 20, true),
      size: d.getUint32(at + 24, true),
      at: d.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

/** Where an entry's bytes start (past its own header). */
function dataAt(entry: ZipEntry, readAt: ReadAt): number {
  const header = readAt(entry.at, 30);
  const h = view(header);
  if (header.length < 30 || h.getUint32(0, true) !== LOCAL) throw new ZipError('A zip entry is damaged.');
  return entry.at + 30 + h.getUint16(26, true) + h.getUint16(28, true);
}

/** An entry's bytes, unpacked and checked. Throws a ZipError if it's damaged, or packed in a way this can't read. */
export function entryBytes(entry: ZipEntry, readAt: ReadAt): Uint8Array {
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError('A zip entry is packed in a way that can’t be read.');
  const packed = readAt(dataAt(entry, readAt), entry.packed);
  if (packed.length < entry.packed) throw new ZipError('A zip entry is cut short.');
  let bytes: Uint8Array;
  try {
    bytes = entry.method === 0 ? packed : inflateSync(packed, { out: new Uint8Array(entry.size) });
  } catch {
    throw new ZipError('A zip entry is damaged.');
  }
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new ZipError('A zip entry is damaged.');
  return bytes;
}

/**
 * The first `length` bytes of an entry, unpacked (read without the rest, if it's stored), for a look at what it
 * is. Not checked: `entryBytes` checks it as it's read for good.
 */
export function entryHead(entry: ZipEntry, readAt: ReadAt, length: number): Uint8Array {
  if (entry.method === 0) return readAt(dataAt(entry, readAt), Math.min(length, entry.size));
  return entryBytes(entry, readAt).subarray(0, length);
}
