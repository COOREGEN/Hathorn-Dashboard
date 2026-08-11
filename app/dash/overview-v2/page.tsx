import { redirect } from "next/navigation";
import OverviewCanvas from "@/components/overview-v2/OverviewCanvas";
import { buildOverviewV2 } from "@/lib/overview-v2/build";

/**
 * 6-3-1 Client Intelligence refinement — Hathorn paper overview.
 * Presentation only. Uses real ledger math via loadDashboard / buildOverviewV2.
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
