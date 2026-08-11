"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { CaretUpDown, CaretUp, CaretDown } from "@phosphor-icons/react";
import { fmtMoney } from "@/lib/command-center/intelligence";
import type { CommandCenterModel } from "@/lib/command-center/model";

type Row = CommandCenterModel["contributions"][number];

const col = createColumnHelper<Row>();

export default function ContributionTable({ rows }: { rows: Row[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "impact", desc: true }]);
  const columns = useMemo(
    () => [
      col.accessor("driver", { header: "Driver", cell: (i) => i.getValue() }),
      col.accessor("impact", {
        header: "Impact",
        cell: (i) => {
          const v = i.getValue();
          return (
            <span className={`tnum ${v < 0 ? "text-[color:var(--accent-deep)]" : "text-[color:var(--brand-deep)]"}`}>
              {v >= 0 ? "+" : "−"}
              {fmtMoney(Math.abs(v)).slice(1)}
            </span>
          );
        },
      }),
      col.accessor("share", {
        header: "Share",
        cell: (i) => <span className="tnum">{(i.getValue() * 100).toFixed(0)}%</span>,
      }),
      col.accessor("note", { header: "Note" }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id}>
                  <button type="button" className="cc-th-btn" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{
                      asc: <CaretUp size={12} weight="bold" />,
                      desc: <CaretDown size={12} weight="bold" />,
                    }[h.column.getIsSorted() as string] ?? <CaretUpDown size={12} />}
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
