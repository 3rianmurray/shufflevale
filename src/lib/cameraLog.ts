// A short log of what moves the table's camera, for finding a bug seen only on a device. Only kept in tester builds
// (see TESTER_BUILD in lib/pro), and only the last few hundred lines; the tester box in About shares it.
import { TESTER_BUILD } from './pro';

const LIMIT = 400;
const lines: string[] = [];

/** Notes what happened, with the time (tester builds only). */
export function cameraLog(what: string) {
  if (!TESTER_BUILD) return;
  const at = new Date().toISOString().slice(11, 23);
  lines.push(`${at} ${what}`);
  if (lines.length > LIMIT) lines.splice(0, lines.length - LIMIT);
}

/** The log as text, oldest first. */
export const cameraLogText = () => lines.join('\n');
