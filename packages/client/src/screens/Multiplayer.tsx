/** Online game: lobby, timed guessing, reveal, results. One Connection per mount. */
import { useEffect, useMemo, useState } from "preact/hooks";
import { Connection } from "../net";
import {
  askedToWatch,
  joinedCode,
  nameHandoff,
  playerName,
  playerToken,
  resetPlayerToken,
  watchHandoff,
} from "../settings";
import { navigate } from "../router";
import { MapView } from "../ui/MapView";
import { Lobby } from "./Lobby";
import { InGame } from "./InGame";
import { Results } from "./Results";
import { Banner } from "../ui/Banner";
import { Icon } from "../ui/icons";
import { useGameSounds } from "../ui/useGameSounds";
import { useSavedSetup } from "../host-setup";

export function Multiplayer({ code, create }: { code: string; create: boolean }) {
  const conn = useMemo(() => new Connection(), []);
  // "Just watch" from the home screen or the join screen below.
  const [watch, setWatch] = useState(() => {
    const handed = watchHandoff.value;
    watchHandoff.value = false;
    return handed;
  });
  // Hosts and code-joiners have just typed their name on the home screen;
  // anyone arriving by link confirms or edits theirs first, so two tabs need
  // not share a name.
  const [confirmedName, setConfirmedName] = useState<string | null>(() => {
    if (create) return playerName.value.trim() || null;
    const handed = nameHandoff.value;
    nameHandoff.value = null;
    if (handed) return handed;
    // A refresh of a tab that already holds a seat in this game.
    if (code && joinedCode.value === code) return playerName.value.trim() || null;
    return null;
  });

  useEffect(() => {
    if (create && !confirmedName) {
      navigate("/");
      return;
    }
    if (!confirmedName) return;
    askedToWatch.value = watch;
    conn.connect(
      create
        ? { token: playerToken.value, name: confirmedName, create: true }
        : { token: playerToken.value, name: confirmedName, code, ...(watch ? { watch } : {}) },
    );
    return () => conn.disconnect();
  }, [conn, confirmedName]);

  if (!confirmedName) {
    return (
      <JoinAs
        code={code}
        onJoin={(name, asWatcher) => {
          playerName.value = name;
          setWatch(asWatcher);
          setConfirmedName(name);
        }}
      />
    );
  }

  // Once the server assigns a code to a new game, put it in the URL for sharing.
  const assigned = conn.code.value;
  useEffect(() => {
    if (!assigned) return;
    joinedCode.value = assigned;
    if (create) history.replaceState(null, "", `#/game/${assigned}`);
  }, [assigned]);

  // Removed by the host: this tab's token is banned from that game, so drop
  // it (and the remembered code) and rejoin, if at all, as a new player.
  const removed = conn.rejection.value?.removed ?? false;
  useEffect(() => {
    if (!removed) return;
    resetPlayerToken();
    joinedCode.value = "";
  }, [removed]);

  const status = conn.status.value;
  const view = conn.view.value;
  useGameSounds(conn, view);
  useSavedSetup(conn, view, create);

  if (status === "rejected" || (status === "disconnected" && !view)) {
    const why = conn.rejection.value ?? {
      title: "Could not join that game",
      detail: conn.lastError.value ?? "The game server did not let us in.",
    };
    return (
      <div class="home">
        <div class="home-card">
          <Banner />
          <h2>{why.title}</h2>
          <p class="tagline">{why.detail}</p>
          <div class="home-actions">
            <button class="primary big" onClick={() => navigate("/game/new")}>
              Host a new game
            </button>
            <button onClick={() => navigate("/")}>Back to start</button>
          </div>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div class="home">
        <div class="home-card">
          <Banner />
          <p class="hint">{create ? "Creating your game…" : `Joining ${code}…`}</p>
        </div>
      </div>
    );
  }
  if (view.phase === "lobby") return <Lobby conn={conn} view={view} />;
  if (view.phase === "results") return <Results conn={conn} view={view} />;
  return (
    <MapView>
      <InGame conn={conn} view={view} />
    </MapView>
  );
}

function JoinAs({ code, onJoin }: { code: string; onJoin: (name: string, watch: boolean) => void }) {
  const [name, setName] = useState(playerName.value);
  const ready = name.trim().length > 0;
  return (
    <div class="home">
      <form
        class="home-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onJoin(name.trim(), false);
        }}
      >
        <Banner />
        <p class="tagline">
          Joining game <b>{code}</b>
        </p>
        <label class="field">
          <span>Your name</span>
          <input
            type="text"
            maxLength={20}
            placeholder="Your name"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            autoFocus
          />
        </label>
        <button class="primary big" type="submit" disabled={!ready}>
          Join
        </button>
        <button class="big" type="button" disabled={!ready} onClick={() => onJoin(name.trim(), true)}>
          <Icon name="eye" /> Just watch
        </button>
        <p class="hint">
          <a href="#/">Back</a>
        </p>
      </form>
    </div>
  );
}
