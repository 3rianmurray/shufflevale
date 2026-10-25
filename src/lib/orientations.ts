import type { ModalProps } from 'react-native';

/**
 * Every way up a screen can be held. A Modal (a menu, a sheet, a full-screen editor) only turns to portrait unless
 * told otherwise, which made the whole app jump upright whenever one opened on a turned iPad (and flash mirrored
 * if the iPad was upside down). On iPhone the app stays portrait anyway (see app.json).
 */
export const ALL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
];
