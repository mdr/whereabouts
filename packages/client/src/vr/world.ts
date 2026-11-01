import {
  AmbientLight,
  ColorSchemeType,
  DirectionalLight,
  ReferenceSpaceType,
  SessionMode,
  World,
  type Scene
} from "@iwsdk/core"
import { STARS_DISTANCE } from "./space"

/**
 * IWSDK updates and draws its scene every frame from the start, on the page
 * too, where nobody sees it: twice the page's drawing, on a headset's
 * browser. Its loop calls these by name each frame, so they can wait.
 */
function idleOffHeadset(world: World): void {
  const update = world.update.bind(world)
  world.update = (delta, time) => {
    if (world.session) update(delta, time)
  }
  const renderer = world.renderer
  const render = renderer.render.bind(renderer)
  renderer.render = (scene, camera) => {
    if (world.session) render(scene, camera)
  }
}

export async function createWorld(host: HTMLElement): Promise<World> {
  const world = await World.create(host, {
    xr: {
      sessionMode: SessionMode.ImmersiveVR,
      referenceSpace: ReferenceSpaceType.LocalFloor,
      offer: "none"
    },
    features: { spatialUI: { preferredColorScheme: ColorSchemeType.Dark } },
    input: { canvasPointerEvents: false },
    // The moon of a globe zoomed right in is kilometres off.
    render: { far: STARS_DISTANCE * 1.2 }
  })
  idleOffHeadset(world)
  return world
}

/** A page holds only so many WebGL contexts; the next try makes its own. */
export function destroyWorld(world: World | undefined, host: HTMLElement): void {
  world?.destroy()
  world?.renderer.dispose()
  world?.renderer.forceContextLoss()
  host.remove()
}

export function addLights(scene: Scene): void {
  scene.add(new AmbientLight(0xffffff, 1.2))
  const sun = new DirectionalLight(0xffffff, 1.5)
  sun.position.set(1, 3, 2)
  scene.add(sun)
}
