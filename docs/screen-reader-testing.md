# Screen reader testing with VoiceOver

[Guidepup](https://www.guidepup.dev) drives the real VoiceOver on a Mac and records what it
announces, so the game can be checked as a screen reader user hears it without someone
listening along.

## Set up a Mac (once per machine)

Steps 1–3 are manual. With System Integrity Protection on, as it should be, Guidepup's
automated setup (`@guidepup/setup setup`) can't make them.

1. **Let VoiceOver be scripted.** Open VoiceOver Utility (Spotlight: "VoiceOver Utility"),
   go to General, tick "Allow VoiceOver to be controlled with AppleScript", and untick
   "Display welcome dialog when VoiceOver starts" (it would stop a script at each start).
2. **Let your terminal control the Mac.** In System Settings → Privacy & Security, open
   the pane of apps that may control the computer, and turn on the app the scripts run
   from (the terminal, or the IDE if you run them there), adding it with + if it isn't
   listed. macOS 27 calls the pane "Device Control and Data Access"; earlier versions call
   it "Accessibility". This opens it whatever it's called:
   `open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"`.
   This is a broad permission: anything run from that app can then drive the Mac's
   interface, so turn it off again when you no longer need it.
3. **Let your terminal reach VoiceOver's settings.** Guidepup starts VoiceOver with its own
   preferences, leaving yours alone, by linking them into VoiceOver's app data
   (`~/Library/Group Containers/group.com.apple.VoiceOver/`), which macOS protects without
   asking. Turn the same app on in System Settings → Privacy & Security → Full Disk Access
   (`open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"`). It
   applies to new processes at once; there's no need to restart the terminal. This too is
   broad: it lets the app read all your files.
4. **Download Guidepup's VoiceOver settings** (into `~/Library/Caches/guidepup/`), from
   `packages/client`, and again after upgrading `@guidepup/guidepup`:
   `nix develop -c pnpm dlx @guidepup/setup install voiceover`.

On the first run macOS asks whether the app may control "VoiceOver.app" and
"Google Chrome.app" (Privacy & Security → Automation): allow both. Until then the run
fails with "AppleEvent timed out".

Guidepup's `setup` command is not needed: steps 1–3 are what it would do.

Checked on macOS 27.0.1 with Guidepup 0.40.0 (November 2026). See Guidepup's
[manual setup guide](https://www.guidepup.dev/docs/guides/manual-voiceover-setup) for
other versions.

## While it runs

VoiceOver takes over the Mac: it speaks aloud, moves keyboard focus, and needs the browser
window frontmost. It can't run headless or while someone is using the machine, so it is
not part of `task iwft` or CI.

## Listening to a screen

Write a throwaway spec, `packages/client/browser/voiceover/<name>.voiceover.ts`, and run it:

```sh
nix develop -c task voiceover -- <name>
```

These specs are for exploring and for checking a fix, not a suite: nothing else runs them.
Copy `lobby.voiceover.ts`, the worked example. A spec gets the IWFT fixtures (`game`, a `tab`
on the in-process server and the offline world) and drives the app with page objects to
the state it wants, quickly and with VoiceOver still off. Then `await listen()` starts
VoiceOver on the tab and returns a `ScreenReader`:

- `readAll()`: every item from VoiceOver's place to the end of the page, as VO-Right
  reads them.
- `heard(action)`: what VoiceOver said after something done to the app (a page-object
  click, a server event: `game.seat`, `game.server.player("Bob").join(code)`…), or nothing.
  This is how to check what's announced. It uses Guidepup's `capture`, since Guidepup
  only records speech around actions it's told about.
- `command(run)`: what VoiceOver said for its own commands, e.g.
  `command((vo) => vo.press("Tab"))`. Don't run those inside `heard`: they share one
  queue, so it would wait forever.
- `report(title, phrases)`: prints them, and adds them to `heard.txt` in the test's
  folder under `smoke-out/voiceover/`.
- `voiceOver`: Guidepup's
  [VoiceOver](https://www.guidepup.dev/docs/api/class-voiceover) for anything else
  (`next`, `nextHeading`, `press("Shift+Tab")`, `act`, `itemText`…).
- `enterPage()`: puts VoiceOver back in the page after `tab.open`.

Start with a VoiceOver move (`vo.next()`): in one spec that began with `press("Tab")`,
nothing was heard all run.

VoiceOver takes about a minute to start and settle, then a second or so per item, so a
long `readAll` takes a few minutes. VoiceOver stops after the test, pass or fail.
