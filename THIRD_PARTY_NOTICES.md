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
