/**
 * The land mask for the "Trim sea" button (land.json, ~110 KB gzipped): its
 * own chunk, fetched the first time the button is pressed and kept from then
 * on.
 */
import { LandMask } from "@whereabouts/shared";

let loading: Promise<LandMask> | null = null;

export function loadLandMask(): Promise<LandMask> {
  loading ??= import("@whereabouts/shared/land.json").then(
    (m) => new LandMask(m.default),
    (err: unknown) => {
      // Let the next press try again, after a dropped connection say.
      loading = null;
      throw err;
    },
  );
  return loading;
}
