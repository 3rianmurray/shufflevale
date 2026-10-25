// Sharing and backing up Shufflevale files from a menu, saying how it went (see deckExport.ts for the files).
import { Alert } from 'react-native';

import { backUpFile, shareFile } from './deckExport';
import type { FileContents } from './deckExport';
import * as haptics from './haptics';

/** Opens the share sheet with the file (Messages, AirDrop, Mail…). */
export async function shareWithNotice(contents: FileContents) {
  try {
    await shareFile(contents);
  } catch (e) {
    Alert.alert('Couldn’t share', e instanceof Error ? e.message : String(e));
  }
}

/** Saves the file (in parts, if it's too big for one) into a folder picked in Files, and says where it went. */
export async function backUpWithNotice(contents: FileContents) {
  try {
    const saved = await backUpFile(contents);
    if (!saved) return;
    haptics.success();
    Alert.alert(
      'Backed up',
      saved.parts > 1
        ? `“${contents.name}” is saved in ${saved.parts} parts in “${saved.folder}” in the Files app.`
        : `“${contents.name}” is saved in “${saved.folder}” in the Files app.`,
    );
  } catch (e) {
    Alert.alert('Couldn’t back up', e instanceof Error ? e.message : String(e));
  }
}
