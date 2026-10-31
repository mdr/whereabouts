/**
 * Units as flavours: a plain number is accepted where one is wanted, and
 * arithmetic needs no wrapping, but a value of one unit cannot be passed
 * where another is wanted.
 */
import { z } from "zod"

declare const unit: unique symbol
type Flavour<U extends string> = number & { readonly [unit]?: U }

/** Kilometres, on the ground. */
export type Km = Flavour<"Km">
export type SquareKm = Flavour<"SquareKm">
/** Metres: in the headset's scene, or on the ground where map maths works in them. */
export type Metres = Flavour<"Metres">
export type Degrees = Flavour<"Degrees">
/** A length of time in milliseconds. */
export type Ms = Flavour<"Ms">
/** A moment, in epoch milliseconds as `Date.now()` gives. */
export type Instant = Flavour<"Instant">
export type Seconds = Flavour<"Seconds">
/** CSS pixels on screen. */
export type Px = Flavour<"Px">

export const KmSchema = z.number() as z.ZodType<Km>
export const MsSchema = z.number().int() as z.ZodType<Ms>
export const InstantSchema = z.number().int() as z.ZodType<Instant>
export const DegreesSchema = z.number() as z.ZodType<Degrees>
