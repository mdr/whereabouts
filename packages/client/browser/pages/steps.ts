import { test } from "@playwright/test"
import { stepTitle } from "./step-title.ts"

type Method = (...args: unknown[]) => unknown

const isAsync = (method: Method): boolean => method.constructor.name === "AsyncFunction"

const insideTest = (): boolean => {
  try {
    test.info()
    return true
  } catch {
    return false
  }
}

const parentOf = (value: object): object | undefined => Reflect.getPrototypeOf(value) ?? undefined

/** Page objects extend this so each async method call shows as a step, named `Class.method args`, in reports and traces. */
// oxlint-disable-next-line typescript/no-extraneous-class
export abstract class PageObject {
  constructor() {
    const className = this.constructor.name
    for (
      let prototype = parentOf(this);
      prototype && prototype !== PageObject.prototype && prototype !== Object.prototype;
      prototype = parentOf(prototype)
    ) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        // A subclass's override has already been wrapped.
        if (name === "constructor" || Object.hasOwn(this, name)) continue
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
        if (typeof descriptor?.value !== "function") continue
        const original = descriptor.value as Method
        const wrapper = (...args: unknown[]): unknown => {
          if (!insideTest()) return original.apply(this, args)
          const title = stepTitle(className, name, args)
          if (isAsync(original)) {
            return test.step(title, () => original.apply(this, args) as Promise<unknown>, { box: true })
          }
          const result = original.apply(this, args)
          return result instanceof Promise ? test.step(title, () => result, { box: true }) : result
        }
        Object.defineProperty(this, name, { value: wrapper, writable: true, configurable: true })
      }
    }
  }
}
