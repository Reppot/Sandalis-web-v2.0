import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') throw new Error('The personal installer targets Windows only');
  const appDir = path.resolve(context.appOutDir);
  const exe = await stat(path.join(appDir, 'Chronum.exe'));
  const asar = await stat(path.join(appDir, 'resources', 'app.asar'));
  const escapedDir = appDir.replaceAll('$', () => '$$');
  await writeFile(path.join(context.outDir, 'personal-payload.nsh'), [
    '; Generated from the actual packaged files; never checked in.',
    '!define APP_BUILD_DIR "' + escapedDir + '"',
    '!define CHRONOMANCER_EXE_BYTES ' + exe.size,
    '!define CHRONOMANCER_ASAR_BYTES ' + asar.size,
    '',
  ].join('\n'));
}
