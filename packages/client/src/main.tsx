import "./global.css"
import "./test-hooks"
import { render } from "preact"
import { App } from "./app"
import { installSound } from "./sound/sound"
import { reloadOnStaleBuild } from "./net/stale-build"
import { trackKeyboardFocus } from "./keyboard/keys"

reloadOnStaleBuild()
trackKeyboardFocus()
installSound()

render(<App />, document.getElementById("app")!)
