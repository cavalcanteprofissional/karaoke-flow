import "@testing-library/jest-dom/vitest";

/**
 * jsdom não implementa `ResizeObserver`, que o Radix usa para medir o elemento
 * (Slider, Dialog, Popover). Stub mínimo: observar não mede nada, e os testes
 * aqui validam comportamento, não layout.
 */
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
