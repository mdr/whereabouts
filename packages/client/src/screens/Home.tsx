import { useState } from "preact/hooks";
import { MAP_DETAILS } from "@whereabouts/shared";
import { nameHandoff, playerName, soloMapDetail, watchHandoff } from "../settings";
import { navigate } from "../router";
import { Icon } from "../ui/icons";
import { MapDetailPicker } from "../ui/MapDetailPicker";
import hero800 from "../assets/hero-800.webp";
import hero1448 from "../assets/hero-1448.webp";

/**
 * The front door: a hero picture, your name, then three clearly separate
 * ways in (host, join, practise) and a short how-to-play.
 */
export function Home() {
  const [code, setCode] = useState("");
  const name = playerName.value.trim();
  const ready = name.length > 0;
  const needName = ready ? undefined : "Enter your name first";
  return (
    <div class="home">
      <div class="home-page">
        <header class="hero">
          <img
            src={hero1448}
            srcset={`${hero800} 800w, ${hero1448} 1448w`}
            sizes="(max-width: 960px) 100vw, 960px"
            alt="A figure spray-painting glowing hexagons onto a globe"
          />
          <div class="hero-text">
            <h1>Whereabouts</h1>
            <p class="tagline">Paint where you think it is. Hedge when you're not sure.</p>
          </div>
        </header>

        <label class="field home-name">
          <span>Your name</span>
          <input
            type="text"
            maxLength={20}
            placeholder="Your name"
            value={playerName.value}
            onInput={(e) => (playerName.value = (e.target as HTMLInputElement).value)}
          />
        </label>

        <div class="modes">
          <section class="mode">
            <h2>Host a game</h2>
            <p>Start a room and share the code with friends.</p>
            <button class="primary big" disabled={!ready} title={needName} onClick={() => navigate("/game/new")}>
              <Icon name="play" /> Host a game
            </button>
          </section>
          <section class="mode">
            <h2>Join a game</h2>
            <p>Got a code from a friend? Type it here.</p>
            <form
              class="join"
              onSubmit={(e) => {
                e.preventDefault();
                const c = code.trim().toUpperCase();
                if (ready && c.length >= 4) {
                  nameHandoff.value = name;
                  // The "Just watch" button submits too, and says which it was.
                  const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
                  watchHandoff.value = submitter?.value === "watch";
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
                aria-label="Game code"
              />
              <button type="submit" class="big" disabled={!ready || code.trim().length < 4} title={needName}>
                Join
              </button>
              <button
                type="submit"
                value="watch"
                class="watch"
                disabled={!ready || code.trim().length < 4}
                title="See every round without playing"
              >
                <Icon name="eye" size={14} /> Just watch
              </button>
            </form>
          </section>
          <section class="mode">
            <h2>Practise</h2>
            <p>On your own, no clock. See how the scoring works.</p>
            <button class="big" onClick={() => navigate("/solo")}>
              <Icon name="brush" /> Practise
            </button>
            <details class="practice-detail">
              <summary>Map detail: {MAP_DETAILS.find((d) => d.id === soloMapDetail.value)?.label ?? "Minimal"}</summary>
              <MapDetailPicker value={soloMapDetail.value} onChange={(v) => (soloMapDetail.value = v)} />
            </details>
          </section>
        </div>

        <section class="how">
          <h2>How to play</h2>
          <ol>
            <li>
              <b>Read the clue.</b> Each round names a place or shows a photo of one.
            </li>
            <li>
              <b>Paint the map.</b> Paint where you think it is, heavier where you're surer. Torn between two places?
              Paint both.
            </li>
            <li>
              <b>Score.</b> Points go to paint near the answer. A tight guess pays big when right and costs when wrong;
              a wider one plays it safe.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
