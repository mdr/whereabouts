import { useState } from "preact/hooks";
import { nameHandoff, playerName } from "../settings";
import { navigate } from "../router";

export function Home() {
  const [code, setCode] = useState("");
  const name = playerName.value.trim();
  const ready = name.length > 0;
  return (
    <div class="home">
      <div class="home-card">
        <h1>Whereabouts</h1>
        <p class="tagline">Paint where you think it is. Hedge if you must. Honesty pays.</p>

        <label class="field">
          <span>Your name</span>
          <input
            type="text"
            maxLength={20}
            placeholder="e.g. Matt"
            value={playerName.value}
            onInput={(e) => (playerName.value = (e.target as HTMLInputElement).value)}
          />
        </label>

        <div class="home-actions">
          <button class="primary big" disabled={!ready} onClick={() => navigate("/game/new")}>
            Host a game
          </button>
          <form
            class="join"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.trim().toUpperCase();
              if (ready && c.length >= 4) {
                nameHandoff.value = name;
                navigate(`/game/${c}`);
              }
            }}
          >
            <input
              type="text"
              placeholder="CODE"
              maxLength={6}
              value={code}
              onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())}
              class="code-input"
            />
            <button type="submit" disabled={!ready || code.trim().length < 4}>
              Join
            </button>
          </form>
        </div>

        <p class="hint">
          Or <a href="#/solo">practise on your own</a>.
        </p>
      </div>
    </div>
  );
}
