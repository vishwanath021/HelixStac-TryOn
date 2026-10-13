"use client";

import * as Toast from "@radix-ui/react-toast";
import { useEffect, useState } from "react";

type Item = { id: number; text: string; ok: boolean };
type Push = (item: Item) => void;

let push: Push | null = null;
let seq = 0;

export function toast(text: string, ok = true) {
  push?.({ id: ++seq, text, ok });
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    push = (item) => {
      setItems((current) => [...current, item].slice(-3));
      window.setTimeout(() => {
        setItems((current) => current.filter((row) => row.id !== item.id));
      }, 4200);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <Toast.Provider swipeDirection="right">
      {items.map((item) => (
        <Toast.Root key={item.id} duration={4000} className="rounded-[10px] border border-line bg-card px-4 py-3 text-sm shadow-lift">
          <Toast.Description className={item.ok ? "text-ink" : "text-red-800"}>{item.text}</Toast.Description>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[80] flex w-[min(100%-2rem,22rem)] flex-col gap-2 outline-none" />
    </Toast.Provider>
  );
}
