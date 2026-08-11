import { redirect } from "next/navigation";
import CommandCenter from "@/components/command-center/CommandCenter";
import { buildOverviewV2 } from "@/lib/overview-v2/build";
import { fromOverviewV2 } from "@/lib/command-center/from-overview";

/**
 * Premium Client Financial Command Center.
 * Uses real ledger math when authenticated; presentation-only intelligence overlays.
 */
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const overview = await buildOverviewV2(searchParams);
  if (!overview) redirect("/login");
  return <CommandCenter model={fromOverviewV2(overview)} />;
}
