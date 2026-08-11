import { redirect } from "next/navigation";
import OverviewCanvas from "@/components/overview-v2/OverviewCanvas";
import { buildOverviewV2 } from "@/lib/overview-v2/build";

/**
 * Experimental Client Overview V2 — Hathorn Intelligence OS.
 * Visual prototype only. Uses real ledger math via loadDashboard.
 * Not the production Overview until approved.
 */
export default async function OverviewV2Page({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const model = await buildOverviewV2(searchParams);
  if (!model) redirect("/login");

  return <OverviewCanvas model={model} />;
}
