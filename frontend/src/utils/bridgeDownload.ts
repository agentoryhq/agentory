// bridgeDownload.ts — resolves where the user downloads the Electron desktop
// "bridge" from. The binaries (dmg/exe/AppImage) are NOT in the repo: they are
// published as assets of a GitHub Release by the `release-bridge.yml` workflow.
// Here we detect the visitor's OS (for the label) and point at the latest release,
// whose assets are named per-OS/arch so the user picks the right installer.
//
// The repo slug lives in ONE place — `VITE_BRIDGE_REPO` (frontend/.env). Set it to
// the public repo (e.g. `youracct/agentory`) when publishing.

export type BridgeOS = 'mac' | 'windows' | 'linux' | 'unknown';

// Falls back to the current git remote; override via VITE_BRIDGE_REPO at build time.
const REPO = (import.meta.env.VITE_BRIDGE_REPO as string | undefined) || 'andreagenovese/yesSir';

/** Best-effort OS detection from the browser, only used to label the button. */
export function detectBridgeOS(): BridgeOS {
  const s = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (/mac|iphone|ipad|darwin/.test(s)) return 'mac';
  if (/win/.test(s)) return 'windows';
  if (/linux|android|x11/.test(s)) return 'linux';
  return 'unknown';
}

/** Human label for the detected OS (proper nouns — same in every language). */
export function bridgeOSLabel(os: BridgeOS): string | null {
  switch (os) {
    case 'mac': return 'macOS';
    case 'windows': return 'Windows';
    case 'linux': return 'Linux';
    default: return null;
  }
}

/** Latest-release page — assets are named per OS/arch, so the user picks correctly. */
export function bridgeReleasesUrl(): string {
  return `https://github.com/${REPO}/releases/latest`;
}
