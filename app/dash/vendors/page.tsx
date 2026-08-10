import Frame from "@/components/dash/frame";
import { Empty } from "@/components/dash/ui";

export default function Vendors({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Vendors" showFilters={false}
      subtitle="Spend concentration, category mapping, and review intelligence">
      {() => (
        // Deliberately empty rather than fabricated. Vendor concentration needs
        // transaction-level detail that the monthly close does not carry, and a number
        // nobody should rely on is worse than an honest gap.
        <Empty title="No vendor data connected">
          Vendor concentration needs transaction-level purchase detail, which the monthly
          close does not carry — the four CSVs are summary-level by design. It arrives with
          the QuickBooks connection, which pulls purchases by vendor and category. Until
          then this view stays empty rather than showing a figure nobody should trust.
        </Empty>
      )}
    </Frame>
  );
}
