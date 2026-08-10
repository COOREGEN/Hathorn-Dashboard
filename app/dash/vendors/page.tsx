import Frame from "@/components/dash/frame";
import { Empty } from "@/components/dash/ui";

export default function Vendors({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Vendors" showFilters={false}
      subtitle="Unavailable until QuickBooks purchase detail is connected">
      {() => (
        // Deliberately empty rather than fabricated. Vendor concentration needs
        // transaction-level detail that the monthly close does not carry, and a number
        // nobody should rely on is worse than an honest gap.
        <Empty title="Vendor analytics not available yet">
          This view is intentionally empty — not a broken chart. Vendor concentration needs
          transaction-level purchase detail that the monthly CSV close does not carry.
          Connect QuickBooks (Integrations) to unlock purchases by vendor and category.
          Until then we show no figure rather than one nobody should trust.
        </Empty>
      )}
    </Frame>
  );
}
