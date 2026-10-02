// Practice mode against the Vite dev server: paint two blobs, undo and redo
// the second with the keyboard, submit, and see a score. Saves screenshots.
// Usage, from packages/client: node browser/e2e/solo.ts [outDir]
import { Checks, launchChrome, openApp, outDir } from "./support.ts";

const out = outDir();
const checks = new Checks();
const browser = await launchChrome();
const you = await openApp(browser, "solo", { context: { viewport: { width: 1400, height: 900 } }, dev: true });

await you.openPractice();
await you.solo.waitUntilShown();
await you.map.waitUntilSettled();
await you.screenshot(`${out}/1-start.png`);

await you.map.drag({ across: 0.5, down: 0.45 }, { distancePx: 120, steps: 20 });
await you.map.dab({ across: 0.7, down: 0.54 });
const twoBlobs = await you.map.yourPaintCells();
await you.screenshot(`${out}/2-painted.png`);

await you.paintTools.undoWithKeyboard();
const oneBlob = await you.map.yourPaintCells();
await you.paintTools.redoWithKeyboard();
const back = await you.map.yourPaintCells();
checks.check(oneBlob < twoBlobs && back === twoBlobs, `undo then redo: ${twoBlobs} -> ${oneBlob} -> ${back} cells`);
console.log("blobs:", await you.devDrawer.blobs());

await you.solo.submit();
const score = await you.solo.roundScore();
checks.check(/^-?\d+$/.test(score), `a score on the reveal (${score})`);
await you.map.hover({ across: 0.55, down: 0.4 });
await you.screenshot(`${out}/3-reveal.png`);

await browser.close();
checks.finish();
