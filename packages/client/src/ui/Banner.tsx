import hero800 from "../assets/hero-800.webp";
import hero1448 from "../assets/hero-1448.webp";
import type { ComponentChildren } from "preact";

/**
 * The title on the card screens: a strip of the front-page picture, cropped
 * to the spray, with "Whereabouts" over it. Children sit over the top left
 * (the lobby's Leave button).
 */
export function Banner({ children }: { children?: ComponentChildren }) {
  return (
    <header class="banner">
      <img
        src={hero1448}
        srcset={`${hero800} 800w, ${hero1448} 1448w`}
        sizes="(max-width: 880px) 100vw, 824px"
        alt=""
      />
      <h1>Whereabouts</h1>
      {children}
    </header>
  );
}
