import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LiveLookCheck } from "@/components/tryon/LiveLookCheck";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <LiveLookCheck />
    </Suspense>
  );
}
