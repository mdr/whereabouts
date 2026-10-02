// Touch on the map in practice mode, against the Vite dev server: one finger
// paints; two fingers pan and zoom and leave no paint behind.
// Usage, from packages/client: node browser/e2e/touch.ts [outDir]
import { Checks, launchChrome, openApp, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();
const you = await openApp(browser, "touch", {
  context: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true },
});

await you.openPractice();
await you.solo.waitUntilShown();
await you.map.waitUntilSettled();

await you.map.fingerDrag({ across: 0.49, down: 0.52 });
const afterOneFinger = await you.map.yourPaintCells();
checks.check(afterOneFinger > 0, `one finger paints (${afterOneFinger} cells)`);
await you.screenshot(`${out}/touch-1-painted.png`);

await you.paintTools.clear();
await you.map.pinchOut({ across: 0.49, down: 0.52 });
const afterPinch = await you.map.yourPaintCells();
checks.check(afterPinch === 0, `a pinch paints nothing (${afterPinch} cells)`);
await you.screenshot(`${out}/touch-2-pinched.png`);

await browser.close();
checks.finish();
