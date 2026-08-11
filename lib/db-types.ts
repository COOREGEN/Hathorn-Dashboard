/** Shared better-sqlite3-shaped surface used by both SQLite and Postgres drivers. */
export type RunResult = { changes: number; lastInsertRowid: number | bigint };

export type Statement = {
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
  run: (...params: any[]) => RunResult;
};

export type LedgerDatabase = {
  prepare: (sql: string) => Statement;
  exec: (sql: string) => void;
  transaction: <T>(fn: () => T) => () => T;
  pragma: (src: string) => any;
  backup: (dest: string) => Promise<void>;
  close: () => void;
};
