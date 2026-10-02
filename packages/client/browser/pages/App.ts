import type { Page } from "playwright-core";
import { ConfirmDialog } from "./ConfirmDialog.ts";
import { DevDrawer } from "./DevDrawer.ts";
import { Home } from "./Home.ts";
import { Hud } from "./Hud.ts";
import { InGame } from "./InGame.ts";
import { JoinAs } from "./JoinAs.ts";
import { Layout } from "./Layout.ts";
import { Lobby } from "./Lobby.ts";
import { MapPanel } from "./MapPanel.ts";
import { PaintTools } from "./PaintTools.ts";
import { PlayersPanel } from "./PlayersPanel.ts";
import { Results } from "./Results.ts";
import { Reveal } from "./Reveal.ts";
import { Solo } from "./Solo.ts";
import { TurnedAway } from "./TurnedAway.ts";

/** One browser tab of Whereabouts, with a page object for each screen and panel. */
export class App {
  readonly page: Page;
  readonly #baseUrl: string;
  readonly #dev: boolean;

  readonly home: Home;
  readonly joinAs: JoinAs;
  readonly turnedAway: TurnedAway;
  readonly lobby: Lobby;
  readonly hud: Hud;
  readonly map: MapPanel;
  readonly paintTools: PaintTools;
  readonly inGame: InGame;
  readonly playersPanel: PlayersPanel;
  readonly reveal: Reveal;
  readonly results: Results;
  readonly solo: Solo;
  readonly dialog: ConfirmDialog;
  readonly devDrawer: DevDrawer;
  readonly layout: Layout;

  /** `dev` opens every page with the playtest drawer. */
  constructor(page: Page, baseUrl: string, { dev = false } = {}) {
    this.page = page;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#dev = dev;
    this.home = new Home(page);
    this.joinAs = new JoinAs(page);
    this.turnedAway = new TurnedAway(page);
    this.lobby = new Lobby(page);
    this.hud = new Hud(page);
    this.map = new MapPanel(page);
    this.paintTools = new PaintTools(page);
    this.inGame = new InGame(page);
    this.playersPanel = new PlayersPanel(page);
    this.reveal = new Reveal(page);
    this.results = new Results(page);
    this.solo = new Solo(page);
    this.dialog = new ConfirmDialog(page);
    this.devDrawer = new DevDrawer(page);
    this.layout = new Layout(page);
  }

  async #open(route: string): Promise<void> {
    await this.page.goto(`${this.#baseUrl}/${this.#dev ? "?dev" : ""}#${route}`, { waitUntil: "networkidle" });
  }

  async openHome(): Promise<void> {
    await this.#open("/");
  }

  async openPractice(): Promise<void> {
    await this.#open("/solo");
  }

  /** The link a host shares. */
  async openGameLink(code: string): Promise<void> {
    await this.#open(`/game/${code}`);
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: "networkidle" });
  }

  /** Wait a while, for something that should not happen. */
  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path });
  }
}
