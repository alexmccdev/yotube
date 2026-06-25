"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import LoadingDots from "@/app/components/LoadingDots";

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
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6 file-in">
      <LoadingDots label="Filing a new card…" />
    </main>
  );
}
