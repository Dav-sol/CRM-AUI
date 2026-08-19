import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (!("scrollIntoView" in globalThis.Element.prototype)) {
  (
    globalThis.Element.prototype as { scrollIntoView?: () => void }
  ).scrollIntoView = () => {};
}