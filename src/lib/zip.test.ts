import assert from 'node:assert/strict';
import { test } from 'node:test';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { crc32, entryBytes, entryHead, isZip, ZipError, zipEntries, ZipWriter } from './zip.ts';

/** A zip written with ZipWriter, as one array. */
function written(entries: [string, Uint8Array][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter((b) => chunks.push(b), new Date(2026, 9, 25, 12, 30));
  for (const [name, data] of entries) zip.add(name, data);
  zip.finish();
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const readerOf = (bytes: Uint8Array) => (offset: number, length: number) => bytes.subarray(offset, offset + length);

test('crc32 matches the known value', () => {
  assert.equal(crc32(strToU8('123456789')), 0xcbf43926);
});

test('a zip written an entry at a time opens in another zip library, names and all', () => {
  const picture = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256);
  const bytes = written([
    ['shufflevale.json', strToU8('{"kind":"x"}')],
    ['pictures/i1.jpg', picture],
    ['pictures/Ünïcode ♠.png', strToU8('hi')],
  ]);
  assert.ok(isZip(bytes));
  const opened = unzipSync(bytes);
  assert.equal(strFromU8(opened['shufflevale.json']), '{"kind":"x"}');
  assert.deepEqual(opened['pictures/i1.jpg'], picture);
  assert.equal(strFromU8(opened['pictures/Ünïcode ♠.png']), 'hi');
});

test('its entries read back one at a time, and a look at the start of one reads only that', () => {
  const bytes = written([
    ['a.txt', strToU8('first')],
    ['b.bin', Uint8Array.from([1, 2, 3, 4, 5])],
  ]);
  const read = readerOf(bytes);
  const entries = zipEntries(bytes.length, read);
  assert.deepEqual(
    entries.map((e) => [e.name, e.size]),
    [
      ['a.txt', 5],
      ['b.bin', 5],
    ],
  );
  assert.equal(strFromU8(entryBytes(entries[0], read)), 'first');
  assert.deepEqual([...entryHead(entries[1], read, 2)], [1, 2]);
});

test('a zip made elsewhere, packed or not, reads too', () => {
  const text = strToU8('hello '.repeat(1000));
  const bytes = zipSync({ 'packed.txt': [text, { level: 9 }], 'stored.txt': [strToU8('as is'), { level: 0 }] });
  const read = readerOf(bytes);
  const entries = zipEntries(bytes.length, read);
  const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
  assert.equal(byName['packed.txt'].method, 8);
  assert.deepEqual(entryBytes(byName['packed.txt'], read), text);
  assert.deepEqual(entryHead(byName['packed.txt'], read, 5), strToU8('hello'));
  assert.equal(strFromU8(entryBytes(byName['stored.txt'], read)), 'as is');
});

test('a damaged or cut short zip is turned away', () => {
  const bytes = written([['a.txt', strToU8('some words')]]);
  // A byte of its contents changed.
  const changed = bytes.slice();
  changed[30 + 'a.txt'.length] ^= 0xff;
  const entries = zipEntries(changed.length, readerOf(changed));
  assert.throws(() => entryBytes(entries[0], readerOf(changed)), ZipError);
  // Its end gone.
  const cut = bytes.subarray(0, bytes.length - 10);
  assert.throws(() => zipEntries(cut.length, readerOf(cut)), ZipError);
  assert.equal(isZip(strToU8('{"kind"')), false);
});
