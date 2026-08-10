# Third-party notices

## Apache ECharts — Apache-2.0

Used as the `echarts` npm package for new FP&A / Planning visualizations only.
Existing Hathorn SVG charts remain the default for statements and the staff dashboard.

Copyright The Apache Software Foundation. Licensed under the Apache License, Version 2.0.
https://github.com/apache/echarts

## Forge (mollendorff-ai/forge) — MIT / Apache-2.0

**Not incorporated into this repository.**

A Forge pilot was attempted (CLI install/build outside the Hathorn tree). Integration is
**BLOCKED** in the current development environment (Rust/Cargo edition 2024 requirement).
Hathorn ships a native deterministic planning engine instead. Configuration hooks
(`FORGE_ENABLED`, `FORGE_BIN`) and `lib/fpa/forge-engine.ts` exist so a future pilot can
enable Forge without rewriting the product.

Upstream: https://github.com/mollendorff-ai/forge

## Anthropic Financial Services methodology — Apache-2.0 (design study)

No source files were copied from the Anthropic Financial Services repository.
Planning AI prompts independently encode the same operating principles Hathorn already
uses (deterministic signals → AI explanation → advisor review) and financial-language
discipline (actual vs forecast, assumption vs fact).

If material text is later adapted from that repository, preserve Apache-2.0 notices here.

## Docling — MIT

**Not installed as a required runtime dependency.**

A Docling pilot was evaluated for Document Intelligence. The full package pulls a large
ML stack (PyTorch / CUDA). Hathorn ships:

- Native CSV/TSV parsing in Node (`lib/documents/native-parser.ts`)
- An optional Python worker (`services/document-intelligence/`) with lite parsers
  (`openpyxl`, `pypdf`) and a Docling try-import path when operators install it themselves

Configuration: `DOCUMENT_INTELLIGENCE_ENABLED` (default `0`), `DOCLING_PYTHON`.

Upstream: https://github.com/DS4SD/docling

## openpyxl / pypdf (optional worker)

Used only by the optional Python worker for XLSX cell values and PDF text extraction.
Licenses: MIT (openpyxl), BSD-3-Clause (pypdf). Not required for Hathorn to boot.

## IRS Fact Graph — CC0 1.0 / U.S. Government work

**Not incorporated as a runtime dependency in this phase.**

Inspected upstream license (`LICENSE.md` in https://github.com/IRS-Public/fact-graph):
work of the United States Government / CC0 1.0 Universal dedication — commercial use
permitted. **No IRS endorsement** of Hathorn Dashboard is claimed or implied.

Pilot status: **BLOCKED** for default deploys (Scala.js / sbt toolchain; no prebuilt npm
artifact wired). Hathorn ships a native §179 TY2025 deterministic rule instead.
Configuration hooks: `IRS_FACT_GRAPH_ENABLED` (default `0`), `IRS_FACT_GRAPH_MODULE`.

## IRS Direct File

**Not a runtime dependency.** Studied only as architectural reference (interview /
incomplete-information patterns). No Direct File source was vendored.

## RAGFlow — Apache-2.0 (evaluated, not integrated)

**Not incorporated into this repository and not a runtime dependency.**

RAGFlow was evaluated as an optional retrieval layer for Accounting Guidance.
Status: **DEFERRED**. Hathorn ships a native chunk + keyword retriever
(`lib/research/retrieval.ts`) behind a `ResearchRetriever` interface. Configuration
hook `RAGFLOW_ENABLED` defaults to `0`. Do not claim RAGFlow is integrated.

Upstream: https://github.com/infiniflow/ragflow

## FASB Accounting Standards Codification

**No unauthorized ASC corpus was ingested.** Hathorn does not scrape, bulk-copy, or
mirror the Codification. Pilot sources are firm INTERNAL guidance, bibliographic
public ASU metadata, and synthetic examples. Licensed or user-provided excerpts may
be attached only with explicit content-rights metadata.

