/** The two controllers: gripping, choosing tools, and spraying. */
import type { CssColour } from "@whereabouts/shared/colours"
import { InputComponent, Vector3, type Object3D, type World } from "@iwsdk/core"
import { THEME } from "../../map/themes"
import { Tool } from "../../paint/tool"
import type { Pointer } from "../globe/flag-pins"
import type { Globe } from "../globe/globe"
import { HANDS, Hand, XR_HAND } from "./hand"
import type { Picture } from "../picture/picture"
import { HandTool, TRIGGER_DEAD_ZONE } from "../spray/spray"
import { nextTool, offeredTool } from "../spray/spray-rules"
import { PairedStroke, strokeTool, type Strokes } from "../spray/stroke"
import type { PaintController } from "../../paint/paint-controller"
import type { Seconds } from "@whereabouts/shared/units"

export class Hands {
  readonly tools: Record<Hand, HandTool>
  private readonly world: World
  private readonly stroke: PairedStroke

  constructor(world: World, paint: () => Strokes | undefined) {
    this.world = world
    this.stroke = new PairedStroke(paint)
    const { gripSpaces, raySpaces } = world.player
    const tool = (hand: Hand): HandTool =>
      new HandTool(gripSpaces[XR_HAND[hand]], raySpaces[XR_HAND[hand]], world.scene, THEME)
    this.tools = { [Hand.LEFT]: tool(Hand.LEFT), [Hand.RIGHT]: tool(Hand.RIGHT) }
    this.tools[Hand.LEFT].setTool(Tool.ERASE)
  }

  endStroke(): void {
    this.stroke.end()
  }

  setColour(colour: CssColour | undefined): void {
    for (const hand of HANDS) this.tools[hand].setColour(colour)
  }

  /**
   * While painting, the can and eraser stand in for the controllers. Not
   * toggleVisual(): IWSDK sets the model itself visible again every frame,
   * but leaves the parts inside it alone. The model loads some frames into
   * the session.
   */
  showControllers(on: boolean): void {
    for (const hand of HANDS) {
      const model = this.world.input.xr.visualAdapters.controller[XR_HAND[hand]].visual?.model
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
    for (const hand of HANDS) {
      const pad = pads[XR_HAND[hand]]
      this.tools[hand].busy = false
      if (!pad) continue
      const grip = this.world.player.gripSpaces[XR_HAND[hand]].getWorldPosition(new Vector3())
      const squeezed = pad.getButtonPressed(InputComponent.Squeeze)
      this.tools[hand].busy = squeezed
      this.gripPicture(picture, pictureHome, hand, pad.getButtonDown(InputComponent.Squeeze), squeezed, grip)
      if (squeezed && picture.heldBy !== hand) grips[hand] = grip
      const axes = pad.getAxesValues(InputComponent.Thumbstick)
      stick.x += axes?.x ?? 0
      stick.y += axes?.y ?? 0
    }
    return { grips, stick }
  }

  pointers(globe: Globe): Pointer[] {
    return HANDS.map((hand) => ({ ...this.tools[hand].pointer(), globe: this.tools[hand].aim(globe) }))
  }

  showBeams(globe: Globe | undefined): void {
    for (const hand of HANDS) this.tools[hand].showBeam(globe)
  }

  hold(on: boolean): void {
    for (const hand of HANDS) this.tools[hand].hold(on)
  }

  /** Not painting: tools away, droplets still settle. */
  rest(now: Seconds): void {
    for (const hand of HANDS) {
      this.tools[hand].hide()
      this.tools[hand].settle(now)
    }
  }

  /** One frame of painting; true if either hand sprayed. Ends the stroke when neither did. */
  paint(now: Seconds, globe: Globe, paint: PaintController, onMenu: boolean, wristOpen: boolean): boolean {
    const pads = this.world.input.xr.gamepads
    this.cycleTools(paint.fillable.value)
    const triggers = this.triggers(wristOpen)
    // Both hands make one undo step; the first sets the stroke's sound.
    this.stroke.begin(
      strokeTool(
        HANDS.map((hand, i) => ({
          tool: this.tools[hand].tool,
          touching: this.tools[hand].touching(globe) !== undefined,
          busy: this.tools[hand].busy,
          trigger: triggers[i]!,
          aimed: this.tools[hand].aim(globe) !== undefined
        })),
        onMenu,
        TRIGGER_DEAD_ZONE
      )
    )
    // Every hand updates, even once one has sprayed: each moves its own spot.
    const sprayed = HANDS.map((hand, i) =>
      this.tools[hand].update(now, globe, triggers[i]!, onMenu, paint, pads[XR_HAND[hand]]?.gamepad)
    ).includes(true)
    if (!sprayed) this.stroke.end()
    return sprayed
  }

  /** Grab on a squeeze, release on letting go. */
  private gripPicture(
    picture: Picture,
    pictureHome: Object3D,
    hand: Hand,
    pressed: boolean,
    squeezed: boolean,
    grip: Vector3
  ): void {
    const { player, scene } = this.world
    if (pressed && !picture.heldBy) {
      const ray = player.raySpaces[XR_HAND[hand]]
      const origin = ray.getWorldPosition(new Vector3())
      if (picture.reaches(grip, origin, ray.getWorldDirection(new Vector3()).negate()))
        picture.grab(hand, scene, player.gripSpaces[XR_HAND[hand]], player.head.getWorldPosition(new Vector3()))
    }
    if (picture.heldBy === hand && !squeezed) picture.release(pictureHome)
  }

  // A steps through the right hand's tools, X the left's: Fill too on a country round.
  private cycleTools(fillable: boolean): void {
    const pads = this.world.input.xr.gamepads
    for (const [hand, button] of [
      [Hand.RIGHT, InputComponent.A_Button],
      [Hand.LEFT, InputComponent.X_Button]
    ] as const) {
      const tool = this.tools[hand]
      const offered = offeredTool(tool.tool, fillable, hand)
      if (offered !== tool.tool) tool.setTool(offered)
      if (pads[XR_HAND[hand]]?.getButtonDown(button)) tool.setTool(nextTool(tool.tool, fillable))
    }
  }

  private triggers(wristOpen: boolean): number[] {
    const pads = this.world.input.xr.gamepads
    // The left hand is turned to show the wrist menu, not to erase.
    return HANDS.map((hand) =>
      hand === Hand.LEFT && wristOpen ? 0 : (pads[XR_HAND[hand]]?.getButtonValue(InputComponent.Trigger) ?? 0)
    )
  }
}
