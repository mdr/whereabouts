import "./style.css";
import { render } from "preact";
import { App } from "./app";
import { installSound } from "./sound";

installSound();

render(<App />, document.getElementById("app")!);
