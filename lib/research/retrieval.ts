/**
 * Hathorn research retrieval — native keyword/chunk search first.
 * Application code depends on ResearchRetriever, not on RAGFlow.
 */

import { createHash } from "crypto";
import { db, uid } from "../db";
import { INDEXABLE_RIGHTS, type AccountingCitation, type ContentRights, type ResearchHit } from "./types";
import { assertIndexableRights } from "./source-registry";
import { ragflowStatus } from "./ragflow";

export type IndexableSource = {
  id: string;
  title: string;
  citation: string;
  publisher: string;
  sourceType: string;
  contentRights: ContentRights;
  sourceUrl: string | null;
  bodyText: string;
  effectiveDate: string | null;
};

export interface ResearchRetriever {
  indexSource(source: IndexableSource): Promise<void>;
  removeSource(sourceId: string): Promise<void>;
  search(query: string, options?: {
    limit?: number;
    sourceTypes?: string[];
    clientId?: string | null;
    includeFirm?: boolean;
  }): Promise<ResearchHit[]>;
}

function tokenize(q: string): string[] {
  return q.toLowerCase().replace(/[^a-z0-9§\s.-]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}

function chunkText(text: string, size = 900): { section: string; content: string }[] {
  const paras = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: { section: string; content: string }[] = [];
  let buf = "";
  let idx = 0;
  const flush = () => {
    if (!buf.trim()) return;
    chunks.push({ section: `§chunk-${idx + 1}`, content: buf.trim() });
    idx += 1;
    buf = "";
  };
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > size && buf) flush();
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  flush();
  if (!chunks.length && text.trim()) {
    chunks.push({ section: "§chunk-1", content: text.trim().slice(0, size) });
  }
  return chunks;
}

function toCitation(row: any, excerpt: string, section: string | null, page: number | null): AccountingCitation {
  return {
    sourceId: row.source_id || row.id,
    title: row.title,
    publisher: row.publisher || undefined,
    citation: row.citation || undefined,
    sourceType: row.source_type,
    page: page ?? undefined,
    section: section || undefined,
    excerpt: excerpt.slice(0, 600),
    sourceUrl: row.source_url || undefined,
    contentRights: row.content_rights,
    effectiveDate: row.effective_date || null,
  };
}

export class NativeResearchRetriever implements ResearchRetriever {
  async indexSource(source: IndexableSource): Promise<void> {
    assertIndexableRights(source.contentRights);
    if (!INDEXABLE_RIGHTS.includes(source.contentRights)) {
      throw new Error(
        `Source rights ${source.contentRights} cannot enter the persistent research corpus.`,
      );
    }
    await this.removeSource(source.id);
    const chunks = chunkText(source.bodyText || "");
    const ins = db().prepare(`
      INSERT INTO accounting_source_chunks
        (id, source_id, section, page, content, content_hash, metadata_json)
      VALUES (?,?,?,?,?,?,?)
    `);
    for (const c of chunks) {
      const hash = createHash("sha256").update(c.content).digest("hex");
      ins.run(
        uid(), source.id, c.section, null, c.content, hash,
        JSON.stringify({ title: source.title, citation: source.citation }),
      );
    }
  }

  async removeSource(sourceId: string): Promise<void> {
    db().prepare("DELETE FROM accounting_source_chunks WHERE source_id=?").run(sourceId);
  }

  async search(query: string, options: {
    limit?: number;
    sourceTypes?: string[];
    clientId?: string | null;
    includeFirm?: boolean;
  } = {}): Promise<ResearchHit[]> {
    const limit = options.limit ?? 8;
    const tokens = tokenize(query);
    if (!tokens.length) return [];

    // Pull candidate chunks joined to sources with rights + scope filters
    let sql = `
      SELECT c.id as chunk_id, c.source_id, c.section, c.page, c.content,
             s.title, s.citation, s.publisher, s.source_type, s.source_url, s.content_rights,
             s.scope, s.client_id, s.effective_date
      FROM accounting_source_chunks c
      JOIN accounting_sources s ON s.id = c.source_id
      WHERE s.status = 'ACTIVE'
        AND s.content_rights IN ('PUBLIC','USER_PROVIDED','LICENSED','INTERNAL')
    `;
    const params: any[] = [];
    if (options.includeFirm !== false && options.clientId) {
      sql += ` AND (s.scope='FIRM' OR (s.scope='CLIENT' AND s.client_id=?))`;
      params.push(options.clientId);
    } else if (options.clientId) {
      sql += ` AND s.scope='CLIENT' AND s.client_id=?`;
      params.push(options.clientId);
    } else {
      sql += ` AND s.scope='FIRM'`;
    }
    if (options.sourceTypes?.length) {
      sql += ` AND s.source_type IN (${options.sourceTypes.map(() => "?").join(",")})`;
      params.push(...options.sourceTypes);
    }
    sql += ` LIMIT 400`;

    const rows: any[] = db().prepare(sql).all(...params);
    const scored: ResearchHit[] = [];
    for (const row of rows) {
      const hay = `${row.title} ${row.citation} ${row.content}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += t.length > 5 ? 2 : 1;
      }
      if (score <= 0) continue;
      // Prefer firm guidance + lease keywords lightly
      if (String(row.source_type) === "FIRM_POLICY") score += 0.5;
      const excerpt = String(row.content).slice(0, 500);
      scored.push({
        chunkId: row.chunk_id,
        sourceId: row.source_id,
        score,
        section: row.section,
        page: row.page,
        excerpt,
        citation: toCitation(row, excerpt, row.section, row.page),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export function getResearchRetriever(): ResearchRetriever {
  const st = ragflowStatus();
  if (st.enabled && st.available) {
    // Future: return RagflowResearchRetriever
  }
  return new NativeResearchRetriever();
}
