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

## Exploring a screen

Write a script of commands, one per line, and run it:

```sh
nix develop -c task voiceover -- my-script.txt
```

It opens Home in Chrome, served as in the IWFTs (the in-process game server and the offline
world), starts VoiceOver, moves it into the page, then runs each line and prints what
VoiceOver said. The transcript is also saved under `smoke-out/voiceover/`. For example:

```
# Home, item by item, then by Tab
next 12
press Tab Tab Tab
heading
# practice
open /solo
next 5
```

The commands are `next [n]`, `previous [n]`, `heading`, `landmark`, `act` (press what
VoiceOver is on), `press <keys…>` (e.g. `Tab`, `Shift+Tab`, `Escape`), `type <text>`,
`open <route>`, `seat <names…>` (players with no tab, in the hosted game) and `item` (what
VoiceOver says about the current item). A line it can't read stops the run before VoiceOver
starts, with the list. They're in `packages/client/browser/voiceover/commands.ts`.

It takes about a minute for VoiceOver to start and settle, then a second or two per step.
