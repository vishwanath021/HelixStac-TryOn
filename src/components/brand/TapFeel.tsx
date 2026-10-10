"use client";

import { useEffect } from "react";

/** A short tick on press. Android honors it. iOS Safari ignores vibrate. */
export function TapFeel() {
  useEffect(() => {
    function onDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const hit = target?.closest("button, a.btn, .seg-btn");
      if (!hit) return;
      if (hit instanceof HTMLButtonElement && hit.disabled) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      navigator.vibrate?.(10);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
