/**
 * Monoline glyphs for the practice rail.
 *
 * Drawn by hand for the same reason the charts are: a downloaded icon set
 * arrives with its own weight and corner radius and fights the type. These are
 * 16px on a 16 grid, 1.3 stroke, no fills, currentColor only.
 */

export type StaffIconName =
  | "today" | "attention" | "ask"
  | "clients" | "dashboard" | "experience" | "intelligence" | "engagement"
  | "upload" | "close" | "exceptions" | "reconciliations" | "documents" | "integrations"
  | "planning" | "tax" | "guidance"
  | "firm" | "ops" | "security";

const PATHS: Record<StaffIconName, React.ReactNode> = {
  today: <><circle cx="8" cy="8" r="5.4" /><path d="M8 5.2V8l2 1.5" /></>,
  attention: <><path d="M8 2.6a3.6 3.6 0 0 0-3.6 3.6c0 2.8-1.1 4-1.1 4h9.4s-1.1-1.2-1.1-4A3.6 3.6 0 0 0 8 2.6Z" /><path d="M6.6 12.2a1.5 1.5 0 0 0 2.8 0" /></>,
  ask: <><path d="M8 2.4l1.2 3.1L12.4 6.7 9.2 7.9 8 11 6.8 7.9 3.6 6.7 6.8 5.5 8 2.4Z" /><path d="M12.2 11.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3Z" /></>,
  clients: <><circle cx="6.2" cy="6" r="2.3" /><path d="M2.4 13c0-2 1.7-3.3 3.8-3.3S10 11 10 13" /><path d="M10.6 4.1a2.3 2.3 0 0 1 0 4.4M11.4 9.9c1.4.4 2.4 1.6 2.4 3.1" /></>,
  dashboard: <><rect x="2.5" y="2.5" width="4.6" height="4.6" /><rect x="8.9" y="2.5" width="4.6" height="4.6" /><rect x="2.5" y="8.9" width="4.6" height="4.6" /><rect x="8.9" y="8.9" width="4.6" height="4.6" /></>,
  experience: <><rect x="2.2" y="3" width="11.6" height="10" rx="1" /><path d="M2.2 6h11.6M4.6 4.5h.01M6.4 4.5h.01" /></>,
  intelligence: <><path d="M2.6 12.4V8.6M6.2 12.4V5.4M9.8 12.4V9.4M13.4 12.4V3.2" /></>,
  engagement: <><path d="M2.6 8.4l2.2-2.2 2.4 1.6 2.2-2.6 1.6 1" /><path d="M11.2 3.6h2.2v2.2" /><path d="M2.6 12.6h10.8" /></>,
  upload: <><path d="M8 10.6V3.2M5.4 5.6 8 3l2.6 2.6" /><path d="M2.8 10.2v2.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-2.2" /></>,
  close: <><circle cx="8" cy="8" r="5.6" /><path d="M5.6 8.2l1.7 1.7 3.1-3.6" /></>,
  exceptions: <><path d="M8 2.8 14 13H2L8 2.8Z" /><path d="M8 6.6v3M8 11.2h.01" /></>,
  reconciliations: <><path d="M2.6 5.4h8.2M9.2 3.4l1.8 2-1.8 2" /><path d="M13.4 10.6H5.2M6.8 8.6 5 10.6l1.8 2" /></>,
  documents: <><path d="M4 2.6h5l3 3v7.8H4V2.6Z" /><path d="M8.8 2.6v3.2H12" /></>,
  integrations: <><path d="M6.4 9.6 4.8 11.2a2.3 2.3 0 0 0 3.2 3.2" transform="translate(0,-1.6)" /><path d="M9.6 6.4l1.6-1.6a2.3 2.3 0 0 0-3.2-3.2" transform="translate(0,1.6)" /><path d="M6.2 9.8l3.6-3.6" /></>,
  planning: <><circle cx="8" cy="8" r="5.6" /><path d="M10.4 5.6 8.9 9 5.6 10.4 7.1 7Z" /></>,
  tax: <><path d="M3.6 2.8h8.8v10.4l-1.5-1-1.5 1-1.4-1-1.5 1-1.4-1-1.5 1V2.8Z" /><path d="M6 6.2h4M6 8.8h2.6" /></>,
  guidance: <><path d="M2.8 3.4h4.4A1.6 1.6 0 0 1 8 4.6v8.2a1.4 1.4 0 0 0-1.2-.8H2.8V3.4Z" /><path d="M13.2 3.4H8.8A1.6 1.6 0 0 0 8 4.6v8.2a1.4 1.4 0 0 1 1.2-.8h4V3.4Z" /></>,
  firm: <><path d="M3.4 13.4V4.2L8 2.6l4.6 1.6v9.2" /><path d="M6.2 13.4v-3h3.6v3M6.2 6.4h.01M9.8 6.4h.01M6.2 8.4h.01M9.8 8.4h.01" /></>,
  ops: <><path d="M2.6 5h10.8M2.6 11h10.8" /><circle cx="6" cy="5" r="1.5" /><circle cx="10.4" cy="11" r="1.5" /></>,
  security: <><rect x="3.6" y="7" width="8.8" height="6.4" rx="1" /><path d="M5.8 7V5.6a2.2 2.2 0 0 1 4.4 0V7" /></>,
};

export default function StaffIcon({ name }: { name: StaffIconName }) {
  return (
    <svg
      className="staff-rail-glyph"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
