/**
 * Detect whether the browser can run ffmpeg.wasm.
 * Checks for SharedArrayBuffer (requires COOP/COEP headers) and Web Worker support.
 */

let _canUse: boolean | null = null;

export function canUseClientFFmpeg(): boolean {
  if (_canUse !== null) return _canUse;

  _canUse =
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Worker !== "undefined";

  return _canUse;
}
