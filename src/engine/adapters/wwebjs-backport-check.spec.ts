import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isBackportMissing, isMediaIdBackportMissing } from './wwebjs-backport-check';

/**
 * Guards the startup diagnostic for an unpatched whatsapp-web.js (#889). The cost of getting this
 * wrong runs both ways: a missed detection restores the silence the check exists to break, and a
 * false alarm sends operators after a patch they do not need.
 */
describe('isBackportMissing', () => {
  const tmpDirs: string[] = [];

  /** A whatsapp-web.js install stubbed down to the one file the check reads. */
  function install(messageJs: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wwjs-check-'));
    tmpDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'src', 'structures'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'structures', 'Message.js'), messageJs);
    return dir;
  }

  afterAll(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('flags a tree that still reads the pre-rename id', () => {
    expect(isBackportMissing(install('this.id = data.id;'))).toBe(true);
  });

  it('accepts the shape our patcher lands', () => {
    expect(isBackportMissing(install('this.id = Base._normalizeId(data.id);'))).toBe(false);
  });

  it('accepts an upstream fix that inlines the $1 fallback instead', () => {
    // The check must stand down for any fix, not just ours — otherwise the first upstream release
    // that lands this differently makes every healthy install log a phantom error.
    expect(isBackportMissing(install('this.id = data.id._serialized || data.id.$1;'))).toBe(false);
  });

  it('stays quiet about an install it cannot inspect', () => {
    expect(isBackportMissing(path.join(os.tmpdir(), 'wwjs-not-installed-here'))).toBe(false);
  });

  it('can reach the file it reads in a real install', () => {
    // The no-argument path fails open, so a resolution that silently stopped working — an `exports`
    // map on a future whatsapp-web.js would do it — would retire the check without failing anything.
    const installed = path.dirname(require.resolve('whatsapp-web.js/package.json'));
    expect(fs.existsSync(path.join(installed, 'src', 'structures', 'Message.js'))).toBe(true);
  });
});

/**
 * Guards the startup diagnostic for a whatsapp-web.js without the media-id backport (media sends
 * broken on the WhatsApp Web builds of 2026-09-17). Same stakes as above, in both directions.
 */
describe('isMediaIdBackportMissing', () => {
  const tmpDirs: string[] = [];
  const ANCHOR = "        // Bot's won't reply if canonicalUrl is set (linking)\n";

  /** A whatsapp-web.js install stubbed down to the one file the check reads. */
  function install(utilsJs: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wwjs-media-id-'));
    tmpDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'src', 'util', 'Injected'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'util', 'Injected', 'Utils.js'), utilsJs);
    return dir;
  }

  afterAll(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('flags a recognised tree that does not strip the media model id', () => {
    expect(isMediaIdBackportMissing(install(`        };\n\n${ANCHOR}        if (botOptions) {\n`))).toBe(true);
  });

  it('accepts the shape our patcher lands', () => {
    expect(
      isMediaIdBackportMissing(install(`        };\n\n        delete message.__x_id;\n\n${ANCHOR}`)),
    ).toBe(false);
  });

  it('accepts an upstream fix that guards the delete', () => {
    expect(
      isMediaIdBackportMissing(install(`        if (message.__x_id) delete message.__x_id;\n${ANCHOR}`)),
    ).toBe(false);
  });

  it('stays quiet about a tree it does not recognise or cannot inspect', () => {
    expect(isMediaIdBackportMissing(install('module.exports = {};\n'))).toBe(false);
    expect(isMediaIdBackportMissing(path.join(os.tmpdir(), 'wwjs-not-installed-here'))).toBe(false);
  });

  it('can reach the file it reads in a real install', () => {
    const installed = path.dirname(require.resolve('whatsapp-web.js/package.json'));
    expect(fs.existsSync(path.join(installed, 'src', 'util', 'Injected', 'Utils.js'))).toBe(true);
  });
});
