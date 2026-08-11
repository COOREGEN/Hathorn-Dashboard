import Frame from "@/components/dash/frame";
import { Card, Empty } from "@/components/dash/ui";
import { alertsFor } from "@/lib/dashboard-data";

const COL: Record<string, string> = {
  critical: "var(--accent-deep)", high: "var(--accent)",
  medium: "var(--gold-deep)", low: "var(--ink-mute)",
};

export default function Alerts({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Alerts" showFilters={false}
      subtitle="Material exceptions with confidence, ownership, and next action">
      {(ctx) => {
        // Derived live from the same engine that renders the figures — never a hand-kept list.
        const alerts = alertsFor(ctx);
        if (!alerts.length) {
          return <Empty title="Nothing outstanding">
            No metric is outside its band, every comparison is sound, the evidence is complete,
            and no commitments are open. That is worth noting in the meeting.
          </Empty>;
        }
        return (
          <Card>
            {alerts.map((a, i) => (
              <div className="alert" key={i}>
                <div className="sev" style={{ background: COL[a.sev] }} />
                <div style={{ flex: 1 }}>
                  <div className="alert-h">{a.heading}</div>
                  <div className="alert-b">{a.body}</div>
                  <div className="alert-m">{a.meta}</div>
                </div>
                <span className="tag" style={{ color: COL[a.sev], alignSelf: "flex-start" }}>{a.sev}</span>
              </div>
            ))}
          </Card>
        );
      }}
    </Frame>
  );
}
