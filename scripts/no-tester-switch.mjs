// Stops an EAS build while the tester switch is on (`extra.testerSwitch` in app.json: see TESTER_BUILD in
// src/lib/pro.ts). Every build can be submitted to the App Store, and App Review rejected 1.2.0 for a tester switch,
// so none is ever made with it. Run by EAS before it installs anything (the `eas-build-pre-install` script).
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
if (config.expo?.extra?.testerSwitch) {
  console.error(
    '\nThe tester switch is on (extra.testerSwitch in app.json). Remove it before building: no build may have it,\n' +
      'since any build can go to the App Store. Before submitting for review, it must be off in the latest update\n' +
      'too (App Review gets updates as well).\n',
  );
  process.exit(1);
}
