/** The two controllers: gripping, choosing tools, and spraying. */
import type { CssColour } from "@whereabouts/shared/colours"
import { InputComponent, Vector3, type Object3D, type World } from "@iwsdk/core"
import { THEME } from "../../map/themes"
import { Tool } from "../../paint/tool"
import type { Pointer } from "../globe/flag-pins"
import type { Globe } from "../globe/globe"
import { HANDS, Hand, XR_HAND } from "./hand"
import type { Picture } from "../picture/picture"
import { HandTool, TRIGGER_DEAD } from "../spray/spray"
import { nextTool, offeredTool } from "../spray/spray-rules"
import { PairedStroke, strokeTool, type Strokes } from "../spray/stroke"
import type { VrRound } from "../view/view"
import type { Seconds } from "@whereabouts/shared/units"

export class Hands {
  readonly tools: Record<Hand, HandTool>
  private readonly world: World
  private readonly stroke: PairedStroke

  constructor(world: World, paint: () => Strokes | undefined) {
    this.world = world
    this.stroke = new PairedStroke(paint)
    const { gripSpaces, raySpaces } = world.player
    const tool = (h: Hand) => new HandTool(gripSpaces[XR_HAND[h]], raySpaces[XR_HAND[h]], world.scene, THEME)
    this.tools = { [Hand.LEFT]: tool(Hand.LEFT), [Hand.RIGHT]: tool(Hand.RIGHT) }
    this.tools[Hand.LEFT].setTool(Tool.ERASE)
  }

  endStroke(): void {
    this.stroke.end()
  }

  setColour(colour: CssColour | undefined): void {
    for (const h of HANDS) this.tools[h].setColour(colour)
  }

  /**
   * While painting, the can and eraser stand in for the controllers. Not
   * toggleVisual(): IWSDK sets the model itself visible again every frame,
   * but leaves the parts inside it alone. The model loads some frames into
   * the session.
   */
  showControllers(on: boolean): void {
    for (const h of HANDS) {
      const model = this.world.input.xr.visualAdapters.controller[XR_HAND[h]].visual?.model
      if (model) for (const part of model.children) part.visible = on
    }
  }

  /** Squeezes: grabbing and letting go the picture, and grips and the thumbsticks for turning the globe. */
  grip(
    picture: Picture,
    pictureHome: Object3D
  ): { grips: Partial<Record<Hand, Vector3>>; stick: { x: number; y: number } } {
    const pads = this.world.input.xr.gamepads
    const grips: Partial<Record<Hand, Vector3>> = {}
    const stick = { x: 0, y: 0 }
    for (const h of HANDS) {
      const pad = pads[XR_HAND[h]]
      this.tools[h].busy = false
      if (!pad) continue
      const grip = this.world.player.gripSpaces[XR_HAND[h]].getWorldPosition(new Vector3())
      const squeezed = pad.getButtonPressed(InputComponent.Squeeze)
      this.tools[h].busy = squeezed
      this.gripPicture(picture, pictureHome, h, pad.getButtonDown(InputComponent.Squeeze), squeezed, grip)
      if (squeezed && picture.heldBy !== h) grips[h] = grip
      const s = pad.getAxesValues(InputComponent.Thumbstick)
      stick.x += s?.x ?? 0
      stick.y += s?.y ?? 0
    }
    return { grips, stick }
  }

  pointers(globe: Globe): Pointer[] {
    return HANDS.map((h) => ({ ...this.tools[h].pointer(), globe: this.tools[h].aim(globe) }))
  }

  showBeams(globe: Globe | undefined): void {
    for (const h of HANDS) this.tools[h].showBeam(globe)
  }

  hold(on: boolean): void {
    for (const h of HANDS) this.tools[h].hold(on)
  }

  /** Not painting: tools away, droplets still settle. */
  rest(now: Seconds): void {
    for (const h of HANDS) {
      this.tools[h].hide()
      this.tools[h].settle(now)
    }
  }

  /** One frame of painting; true if either hand sprayed. Ends the stroke when neither did. */
  paint(now: Seconds, globe: Globe, paint: VrRound["paint"], onMenu: boolean, wristOpen: boolean): boolean {
    const pads = this.world.input.xr.gamepads
    this.cycleTools(paint.fillable.value)
    const triggers = this.triggers(wristOpen)
    // Both hands make one undo step; the first sets the stroke's sound.
    this.stroke.begin(
      strokeTool(
        HANDS.map((h, i) => ({
          tool: this.tools[h].tool,
          touching: this.tools[h].touching(globe) !== undefined,
          busy: this.tools[h].busy,
          trigger: triggers[i]!,
          aimed: this.tools[h].aim(globe) !== undefined
        })),
        onMenu,
        TRIGGER_DEAD
      )
    )
    // Every hand updates, even once one has sprayed: each moves its own spot.
    const sprayed = HANDS.map((h, i) =>
      this.tools[h].update(now, globe, triggers[i]!, onMenu, paint, pads[XR_HAND[h]]?.gamepad)
    ).includes(true)
    if (!sprayed) this.stroke.end()
    return sprayed
  }

  /** Grab on a squeeze, release on letting go. */
  private gripPicture(
    picture: Picture,
    pictureHome: Object3D,
    h: Hand,
    pressed: boolean,
    squeezed: boolean,
    grip: Vector3
  ): void {
    const { player, scene } = this.world
    if (pressed && !picture.heldBy) {
      const ray = player.raySpaces[XR_HAND[h]]
      const origin = ray.getWorldPosition(new Vector3())
      if (picture.reaches(grip, origin, ray.getWorldDirection(new Vector3()).negate()))
        picture.grab(h, scene, player.gripSpaces[XR_HAND[h]], player.head.getWorldPosition(new Vector3()))
    }
    if (picture.heldBy === h && !squeezed) picture.release(pictureHome)
  }

  // A steps through the right hand's tools, X the left's: Fill too on a country round.
  private cycleTools(fillable: boolean): void {
    const pads = this.world.input.xr.gamepads
    for (const [h, button] of [
      [Hand.RIGHT, InputComponent.A_Button],
      [Hand.LEFT, InputComponent.X_Button]
    ] as const) {
      const tool = this.tools[h]
      const offered = offeredTool(tool.tool, fillable, h)
      if (offered !== tool.tool) tool.setTool(offered)
      if (pads[XR_HAND[h]]?.getButtonDown(button)) tool.setTool(nextTool(tool.tool, fillable))
    }
  }

  private triggers(wristOpen: boolean): number[] {
    const pads = this.world.input.xr.gamepads
    // The left hand is turned to show the wrist menu, not to erase.
    return HANDS.map((h) =>
      h === Hand.LEFT && wristOpen ? 0 : (pads[XR_HAND[h]]?.getButtonValue(InputComponent.Trigger) ?? 0)
    )
  }
}
