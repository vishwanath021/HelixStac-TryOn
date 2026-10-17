import { notFound } from "next/navigation";
import { LiveEyeCheck } from "@/components/tryon/LiveEyeCheck";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LiveEyeCheck />;
}
