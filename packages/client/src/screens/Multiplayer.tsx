/** Online game: lobby, timed guessing, reveal, results. One Connection per mount. */
import { useEffect, useMemo } from "preact/hooks";
import { Connection } from "../net";
import { playerName, playerToken } from "../settings";
import { navigate } from "../router";
import { MapView } from "../ui/MapView";
import { Lobby } from "./Lobby";
import { InGame } from "./InGame";
import { Results } from "./Results";

export function Multiplayer({ code, create }: { code: string; create: boolean }) {
  const conn = useMemo(() => new Connection(), []);
  const name = playerName.value.trim();

  useEffect(() => {
    if (!name) {
      navigate("/");
      return;
    }
    conn.connect(create ? { token: playerToken.value, name, create: true } : { token: playerToken.value, name, code });
    return () => conn.disconnect();
  }, [conn]);

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
