# Document Intelligence worker

Private Python helper invoked by Hathorn via `spawn`/`execFile`-equivalent with a
**controlled absolute path**. It is never exposed to the browser.

## Status

**Docling pilot: BLOCKED for default deploys** — the full `docling` package pulls
PyTorch and CUDA libraries. Hathorn Dashboard does not require Docling to boot.

This worker:

1. Tries Docling if installed.
2. Falls back to `openpyxl` (XLSX cell values, `data_only`, no formula execution) and
   `pypdf` (PDF text).
3. Emits Hathorn-normalized JSON on stdout.

## Enable

```bash
pip install -r services/document-intelligence/requirements.txt
# optional heavy:
# pip install docling

export DOCUMENT_INTELLIGENCE_ENABLED=1
export DOCLING_PYTHON=python3
```

Native CSV parsing in Node always works even when this flag is off.

## Invoke (internal only)

```bash
python3 parse_document.py /absolute/path/to/file.xlsx
```

## Malware scanning

Not implemented. Future hook: store quarantined → scan → process. Do not treat
uploads as malware-safe today.
