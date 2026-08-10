#!/usr/bin/env python3
"""
Hathorn Document Intelligence worker.

Accepts one controlled absolute file path and prints structured JSON to stdout.
Tries Docling when installed; otherwise uses openpyxl / pypdf lite parsers.

Never evaluates spreadsheet formulas as code — cell values only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(msg: str, code: int = 1) -> None:
    print(json.dumps({"error": msg, "engine": "python-worker", "version": "1.0.0"}))
    sys.exit(code)


def try_docling(path: Path) -> dict | None:
    try:
        from docling.document_converter import DocumentConverter  # type: ignore
    except Exception:
        return None
    try:
        converter = DocumentConverter()
        result = converter.convert(str(path))
        doc = result.document
        text_blocks = []
        tables = []
        # Best-effort export — Docling APIs vary by version.
        if hasattr(doc, "export_to_dict"):
            raw = doc.export_to_dict()
        else:
            raw = {"text": getattr(doc, "text", "") or str(doc)}
        # Prefer markdown/text dump for blocks
        md = ""
        if hasattr(doc, "export_to_markdown"):
            try:
                md = doc.export_to_markdown()
            except Exception:
                md = ""
        if md:
            text_blocks.append({"text": md[:20000], "page": 1})
        # Tables if present on document
        for i, t in enumerate(getattr(doc, "tables", []) or []):
            try:
                df = t.export_to_dataframe()
                headers = [str(c) for c in list(df.columns)]
                rows = [[("" if v is None else str(v)) for v in row] for row in df.values.tolist()]
                tables.append({"headers": headers, "rows": rows, "page": 1, "table_index": i})
            except Exception:
                continue
        return {
            "engine": "docling",
            "version": getattr(sys.modules.get("docling"), "__version__", "installed"),
            "document": {"page_count": getattr(doc, "page_count", None)},
            "text_blocks": text_blocks,
            "tables": tables,
            "metadata": {"source": str(path.name)},
            "warnings": [] if tables or text_blocks else ["Docling returned no tables."],
            "raw_keys": list(raw.keys()) if isinstance(raw, dict) else [],
        }
    except Exception as e:
        return {
            "engine": "docling",
            "version": "error",
            "document": {"page_count": None},
            "text_blocks": [],
            "tables": [],
            "metadata": {},
            "warnings": [f"Docling failed: {type(e).__name__}"],
            "error": "parse_failed",
        }


def parse_xlsx(path: Path) -> dict:
    import openpyxl

    # data_only=True reads cached values — never executes formulas via Python.
    wb = openpyxl.load_workbook(str(path), data_only=True, read_only=True)
    tables = []
    warnings = []
    for sheet in wb.worksheets:
        rows_iter = sheet.iter_rows(values_only=True)
        raw_rows = []
        for row in rows_iter:
            raw_rows.append([("" if c is None else str(c)) for c in row])
            if len(raw_rows) > 5000:
                warnings.append(f"Sheet {sheet.title} truncated at 5000 rows.")
                break
        if not raw_rows:
            continue
        headers = raw_rows[0]
        body = raw_rows[1:]
        tables.append({
            "headers": headers,
            "rows": body,
            "page": 1,
            "table_index": len(tables),
            "sheet": sheet.title,
        })
    wb.close()
    return {
        "engine": "python-lite",
        "version": "openpyxl-data_only",
        "document": {"page_count": len(tables)},
        "text_blocks": [],
        "tables": tables,
        "metadata": {"filename": path.name},
        "warnings": warnings or (["No rows found."] if not tables else []),
    }


def parse_pdf(path: Path) -> dict:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    blocks = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            blocks.append({"text": text[:20000], "page": i + 1})
    return {
        "engine": "python-lite",
        "version": "pypdf-text",
        "document": {"page_count": len(reader.pages)},
        "text_blocks": blocks,
        "tables": [],
        "metadata": {"filename": path.name},
        "warnings": [
            "PDF text extracted without table structure. Convert tables to CSV for structured extraction, or install Docling."
        ],
    }


def parse_csv(path: Path) -> dict:
    import csv

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
        except Exception:
            dialect = csv.excel
        reader = csv.reader(f, dialect)
        rows = [[c for c in row] for row in reader]
    if not rows:
        return {
            "engine": "python-lite",
            "version": "csv",
            "document": {"page_count": 1},
            "text_blocks": [],
            "tables": [],
            "metadata": {"filename": path.name},
            "warnings": ["Empty CSV."],
        }
    return {
        "engine": "python-lite",
        "version": "csv",
        "document": {"page_count": 1},
        "text_blocks": [{"text": ",".join(rows[0]), "page": 1}],
        "tables": [{"headers": rows[0], "rows": rows[1:], "page": 1, "table_index": 0}],
        "metadata": {"filename": path.name},
        "warnings": [],
    }


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: parse_document.py <absolute-file-path>")
    path = Path(sys.argv[1])
    if not path.is_absolute():
        fail("file path must be absolute")
    if not path.is_file():
        fail("file not found")
    # Refuse obvious traversal payloads in the path string itself
    if ".." in path.parts:
        fail("invalid path")

    suffix = path.suffix.lower()
    docling = try_docling(path)
    if docling and not docling.get("error") and (docling.get("tables") or docling.get("text_blocks")):
        print(json.dumps(docling))
        return

    try:
        if suffix in {".xlsx", ".xlsm"}:
            result = parse_xlsx(path)
        elif suffix == ".pdf":
            result = parse_pdf(path)
        elif suffix in {".csv", ".tsv", ".txt"}:
            result = parse_csv(path)
        else:
            fail(f"unsupported type for lite parser: {suffix}")
            return
        if docling and docling.get("warnings"):
            result.setdefault("warnings", []).extend(
                ["Docling unavailable or empty; used lite parser."] + list(docling.get("warnings") or [])
            )
        else:
            result.setdefault("warnings", []).append(
                "Docling not installed — used lite parser (openpyxl/pypdf/csv)."
            )
        print(json.dumps(result))
    except Exception:
        fail("parse_failed")


if __name__ == "__main__":
    main()
