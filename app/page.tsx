"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function NewCardPage() {
  const router = useRouter();
  const creating = useRef(false);

  useEffect(() => {
    if (creating.current) return;
    creating.current = true;
    fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled card" }),
    })
      .then((res) => res.json())
      .then((card) => router.replace(`/cards/${card.id}`))
      .catch(() => router.replace("/cards"));
  }, [router]);

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
      <p className="font-mono text-sm text-paper/50">Creating card…</p>
    </main>
  );
}
