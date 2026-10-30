import "./style.css"
import { render } from "preact"
import { App } from "./app"
import { installSound } from "./sound"
import { reloadOnStaleBuild } from "./stale-build"

reloadOnStaleBuild()
installSound()

render(<App />, document.getElementById("app")!)
