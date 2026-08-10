import { redirect } from "next/navigation";

/**
 * The stages are tabs on one page, not separate routes — an advisor recording a goal
 * usually wants the discovery finding that prompted it one click away. These paths are
 * kept because readiness checks and older links point at them.
 */
export default function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const c = searchParams.client ? `&client=${searchParams.client}` : "";
  redirect(`/engagement?tab=sessions${c}`);
}
