/** Online game: lobby, timed guessing, reveal, results. One Connection per mount. */
import { useEffect, useMemo, useState } from "preact/hooks";
import { Connection } from "../net";
import { playerName, playerToken } from "../settings";
import { navigate } from "../router";
import { MapView } from "../ui/MapView";
import { Lobby } from "./Lobby";
import { InGame } from "./InGame";
import { Results } from "./Results";

export function Multiplayer({ code, create }: { code: string; create: boolean }) {
  const conn = useMemo(() => new Connection(), []);
  // Hosts have just typed their name on the home screen; anyone arriving by
  // link confirms or edits theirs first, so two tabs need not share a name.
  const [confirmedName, setConfirmedName] = useState<string | null>(create ? playerName.value.trim() || null : null);

  useEffect(() => {
    if (create && !confirmedName) {
      navigate("/");
      return;
    }
    if (!confirmedName) return;
    conn.connect(
      create
        ? { token: playerToken.value, name: confirmedName, create: true }
        : { token: playerToken.value, name: confirmedName, code },
    );
    return () => conn.disconnect();
  }, [conn, confirmedName]);

  if (!confirmedName) {
    return (
      <JoinAs
        code={code}
        onJoin={(name) => {
          playerName.value = name;
          setConfirmedName(name);
        }}
      />
    );
  }

  // Once the server assigns a code to a new game, put it in the URL for sharing.
  const assigned = conn.code.value;
  useEffect(() => {
    if (create && assigned) history.replaceState(null, "", `#/game/${assigned}`);
  }, [assigned]);

  const status = conn.status.value;
  const view = conn.view.value;

  if (status === "rejected" || (status === "disconnected" && !view)) {
    return (
      <div class="home">
        <div class="home-card">
          <h1>Whereabouts</h1>
          <p class="warn">{conn.lastError.value ?? "Could not join that game."}</p>
          <button class="primary" onClick={() => navigate("/")}>
            Back
          </button>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div class="home">
        <div class="home-card">
          <h1>Whereabouts</h1>
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

function JoinAs({ code, onJoin }: { code: string; onJoin: (name: string) => void }) {
  const [name, setName] = useState(playerName.value);
  const ready = name.trim().length > 0;
  return (
    <div class="home">
      <form
        class="home-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onJoin(name.trim());
        }}
      >
        <h1>Whereabouts</h1>
        <p class="tagline">
          Joining game <b>{code}</b>
        </p>
        <label class="field">
          <span>Your name</span>
          <input
            type="text"
            maxLength={20}
            placeholder="e.g. Matt"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            autoFocus
          />
        </label>
        <button class="primary big" type="submit" disabled={!ready}>
          Join
        </button>
        <p class="hint">
          <a href="#/">Back</a>
        </p>
      </form>
    </div>
  );
}
