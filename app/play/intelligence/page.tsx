import CommandCenter from "@/components/command-center/CommandCenter";
import { fixtureCommandCenter } from "@/lib/command-center/model";

/**
 * Public playable Command Center (fixture data).
 * Not gated — for UX review. Does not read client financials.
 */
export default function PlayIntelligencePage() {
  return <CommandCenter model={fixtureCommandCenter()} />;
}
