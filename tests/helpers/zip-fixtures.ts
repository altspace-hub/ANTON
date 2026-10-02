/**
 * zip-fixtures.ts — ZIP archives built byte by byte for the upload-guard
 * tests (services/demo-upload-guard.ts): honest ones, ones whose headers lie
 * about their sizes, and ones with bytes before the archive.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
  /** 8 = deflate (default), 0 = stored. */
  method?: 0 | 8;
  /** The uncompressed size the headers declare; the true size when unset. */
  declare?: number;
}

/**
 * A ZIP archive of these entries. Offsets are counted from the start of the
 * archive; `prefix` bytes are put before it (as a self-extractor has).
 */
export function buildZip(entries: ZipEntry[], opts: { prefix?: Buffer } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(e.data, { level: 9 }) : e.data;
    const declared = e.declare ?? e.data.length;
    const crc = crc32(e.data) >>> 0;
    const name = Buffer.from(e.name, 'utf8');

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(declared, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(declared, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);

    locals.push(lh, name, body);
    centrals.push(ch, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([opts.prefix ?? Buffer.alloc(0), ...locals, cd, end]);
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '</Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>';

/**
 * A .docx mammoth reads: one paragraph of `text`, then `padding` bytes of
 * spaces inside an XML comment (they compress about 1000 to 1). The first
 * entry is word/document.xml, so file-type names it a .docx.
 */
export function buildDocx(text: string, opts: { padding?: number; declare?: number } = {}): Buffer {
  const pad = opts.padding ? `<!--${' '.repeat(opts.padding)}-->` : '';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>${pad}</w:body></w:document>`;
  return buildZip([
    { name: 'word/document.xml', data: Buffer.from(doc, 'utf8'), ...(opts.declare !== undefined ? { declare: opts.declare } : {}) },
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(RELS, 'utf8') },
  ]);
}

/** A .docx that expands about 1000 times: 8 MB of XML from a few kilobytes. */
export function docxBomb(): Buffer {
  return buildDocx('A short policy text.', { padding: 8 * 1024 * 1024 });
}

/** The first bytes of a PNG: file-type names it image/png. */
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  Buffer.alloc(64, 0),
]);

/** The first bytes of a Compound File Binary container (.doc, .xls): file-type names it application/x-cfb. */
export const CFB_BYTES = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504, 0)]);
