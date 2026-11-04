import { describe, expect, it } from "vite-plus/test"
import { ordinal, roughDistance } from "./rule-kit.ts"

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [111, "111th"],
    [112, "112th"],
    [113, "113th"],
    [101, "101st"]
  ])("%i is %s", (position, text) => {
    expect(ordinal(position)).toBe(text)
  })
})

describe("roughDistance", () => {
  it.each([
    [87.4, "87 km"],
    [99.6, "100 km"],
    [150, "150 km"],
    [1234, "1,200 km"],
    [1250, "1,300 km"],
    [9449, "9,400 km"],
    [12345, "12,000 km"],
    [12500, "13,000 km"]
  ])("%d km is %s", (km, text) => {
    expect(roughDistance(km)).toBe(text)
  })
})
