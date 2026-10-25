// Links the app is opened with, before they become screens. A Shufflevale file opened in the app from elsewhere
// (Files, Messages, Mail, AirDrop: its type is registered in app.json) comes as the file's own address, which
// isn't a screen: it's sent to the screen that offers to add what's in it (see open.tsx).
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^file:/i.test(path)) return `/open?file=${encodeURIComponent(path)}`;
    return path;
  } catch {
    return '/';
  }
}
