// Deliberate module boundary for future offline USB licensing.
// MVP always permits use and stores no device identifiers.
export function licenseStatus() {
  return { enabled: false, valid: true, mode: 'unlicensed-mvp' };
}
