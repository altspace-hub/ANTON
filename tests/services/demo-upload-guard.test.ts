/**
 * demo-upload-guard.test.ts — the one content check every upload path shares
 * (services/demo-upload-guard.ts, 2026-10-02).
 *
 * mammoth and SheetJS inflate a whole .docx/.xlsx in memory, in the process
 * every demo visitor shares. The check before this one summed the sizes the
 * local headers declare: an archive whose headers lie (declare a few bytes,
 * hold megabytes) passed it. The guard now walks the archive as the readers
 * do and inflates each entry, counting the bytes and stopping at the limit.
 *
 * Every refusal has its negative control: an ordinary file passes, and what
 * is held to a visitor only (the 100 MB ceiling, an archive that cannot be
 * walked) does not refuse anyone else.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  uploadContentRefusal, demoVisitorUploadRefusal, measureZipExpansion, declaredLocalExpansion,
  VISITOR_MAX_EXPANDED_BYTES,
} from '../../server/services/demo-upload-guard.js';
import { buildZip, buildDocx, docxBomb, PNG_BYTES, CFB_BYTES } from '../helpers/zip-fixtures';

const visitor = { visitor: true, env: {} };
const anyone = { visitor: false, env: {} };
const file = (originalname: string, buffer: Buffer) => ({ originalname, size: buffer.length, buffer });

describe('the shared upload content check', () => {
  const savedDemo = process.env.DEMO_MODE;
  afterEach(() => { if (savedDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = savedDemo; });

  it('refuses a .docx that expands past the ratio — for a visitor and for anyone', async () => {
    const bomb = docxBomb();
    expect(bomb.length).toBeLessThan(64 * 1024);
    for (const opts of [visitor, anyone]) {
      const r = await uploadContentRefusal(file('policy.docx', bomb), opts);
      expect(r?.code).toBe('ZIP_BOMB_DETECTED');
      expect(r?.error).toMatch(/^"policy\.docx" was refused: it expands to more than 100 times its size when opened\.$/);
    }
    // Negative control: the same document without the padding passes.
    const plain = buildDocx('A short policy text.');
    expect(await uploadContentRefusal(file('policy.docx', plain), visitor)).toBeNull();
    expect(await uploadContentRefusal(file('policy.docx', plain), anyone)).toBeNull();
  });

  it('refuses an archive whose headers lie about its size, which the earlier rule let through', async () => {
    const liar = buildDocx('A short policy text.', { padding: 8 * 1024 * 1024, declare: 120 });
    // The earlier rule (the sizes the local headers declare) sees nothing wrong.
    expect(declaredLocalExpansion(liar)).toBeLessThan(liar.length * 100);
    // Inflating the entries finds what mammoth would build in memory.
    const m = await measureZipExpansion(liar, liar.length * 100);
    expect(m).toMatchObject({ kind: 'measured', overBudget: true });
    for (const opts of [visitor, anyone]) {
      expect((await uploadContentRefusal(file('policy.docx', liar), opts))?.code).toBe('ZIP_BOMB_DETECTED');
    }
    // Negative control: an honest archive measures what it holds and stays under.
    const honest = buildDocx('A short policy text.');
    const h = await measureZipExpansion(honest, honest.length * 100);
    expect(h).toMatchObject({ kind: 'measured', overBudget: false, entries: 3 });
  });

  it('holds a visitor, and only a visitor, to the 100 MB ceiling whatever the ratio', async () => {
    const big = buildZip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(VISITOR_MAX_EXPANDED_BYTES + 1024 * 1024, 0x20) }]);
    const env = { ZIP_MAX_EXPANSION_RATIO: '1000000' };
    const r = await uploadContentRefusal(file('book.xlsx', big), { visitor: true, env });
    expect(r).toEqual({ error: '"book.xlsx" was refused: it expands to more than 100 MB when opened.', code: 'ZIP_BOMB_DETECTED' });
    // Negative control: anyone else is held to the ratio only.
    expect(await uploadContentRefusal(file('book.xlsx', big), { visitor: false, env })).toBeNull();
  }, 30_000);

  it('refuses content that is not what its extension says', async () => {
    for (const opts of [visitor, anyone]) {
      expect(await uploadContentRefusal(file('scan.pdf', PNG_BYTES), opts)).toEqual({
        error: '"scan.pdf" was refused: its content is not a .pdf file.', code: 'UPLOAD_CONTENT',
      });
      // A plain ZIP named .docx is not a Word document.
      const zip = buildZip([{ name: 'notes.txt', data: Buffer.from('hello') }]);
      expect((await uploadContentRefusal(file('report.docx', zip), opts))?.code).toBe('UPLOAD_CONTENT');
    }
    // Negative controls: an image named for what it is, text, and a .doc/.xls container pass.
    expect(await uploadContentRefusal(file('scan.png', PNG_BYTES), visitor)).toBeNull();
    expect(await uploadContentRefusal(file('notes.txt', Buffer.from('plain text')), visitor)).toBeNull();
    expect(await uploadContentRefusal(file('old.doc', CFB_BYTES), visitor)).toBeNull();
    expect(await uploadContentRefusal(file('old.xls', CFB_BYTES), visitor)).toBeNull();
  });

  it('goes by the stored extension too: the extractor opens the stored path', async () => {
    const bomb = docxBomb();
    // Sent as .txt, stored (and so extracted) as .docx.
    expect((await uploadContentRefusal({ originalname: 'a.txt', path: '/tmp/x.docx', buffer: bomb }, visitor))?.code).toBe('ZIP_BOMB_DETECTED');
    expect((await uploadContentRefusal({ originalname: 'a.txt', extension: '.docx', buffer: bomb }, visitor))?.code).toBe('ZIP_BOMB_DETECTED');
    // Negative control: a .txt is never opened as an archive.
    expect(await uploadContentRefusal({ originalname: 'a.txt', buffer: bomb }, visitor)).toBeNull();
  });

  it('refuses a visitor an archive it cannot walk; anyone else keeps the earlier rule', async () => {
    // Bytes before the archive: JSZip and SheetJS would place its entries differently.
    const prefixed = buildZip(
      [{ name: 'word/document.xml', data: Buffer.from('<w:document/>') }],
      { prefix: Buffer.from('a self-extractor stub\n'.repeat(4)) },
    );
    expect(await measureZipExpansion(prefixed, 1e9)).toMatchObject({ kind: 'unreadable' });
    const r = await uploadContentRefusal(file('stub.docx', prefixed), visitor);
    expect(r).toEqual({ error: '"stub.docx" was refused: it could not be opened as a .docx file to check it.', code: 'UPLOAD_CONTENT' });
    expect(await uploadContentRefusal(file('stub.docx', prefixed), anyone)).toBeNull();
  });

  it('demoVisitorUploadRefusal checks a demo visitor only', async () => {
    const req = (role: string) => ({ user: { id: 'u-guard', role } });
    const bomb = [file('policy.docx', docxBomb())];
    expect((await demoVisitorUploadRefusal(req('analyst'), bomb, { DEMO_MODE: 'true' }))?.code).toBe('ZIP_BOMB_DETECTED');
    // Negative controls: an admin on the demo, and a server that is not a demo.
    expect(await demoVisitorUploadRefusal(req('admin'), bomb, { DEMO_MODE: 'true' })).toBeNull();
    expect(await demoVisitorUploadRefusal(req('analyst'), bomb, {})).toBeNull();
  });
});
