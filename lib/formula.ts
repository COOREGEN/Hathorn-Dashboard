/**
 * Formula evaluation for metric definitions.
 *
 * A metric is an expression over named inputs: `netIncome / revenue * 100`,
 * `directCost / hoursDelivered`, `(revenue - directCost) / headcount`. The firm writes
 * these; nobody writes code to add a metric.
 *
 * Deliberately a hand-written parser rather than `eval` or `new Function`. Formula text
 * is authored by users and stored in the database, so it is untrusted input — an eval
 * here would be a remote code execution path straight through the metric editor. This
 * evaluator understands arithmetic and nothing else: no property access, no calls, no
 * globals to reach.
 */

export type FormulaError = { message: string; position?: number };

/* ------------------------------------------------------------------ */
/* Tokeniser                                                           */
/* ------------------------------------------------------------------ */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" } | { t: "rp" };

function tokenise(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw { message: `"${src.slice(i, j)}" is not a number`, position: i };
      out.push({ t: "num", v: n });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j; continue;
    }
    if ("+-*/".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "(") { out.push({ t: "lp" }); i++; continue; }
    if (c === ")") { out.push({ t: "rp" }); i++; continue; }
    throw { message: `Unexpected character "${c}"`, position: i };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Recursive-descent parser                                            */
/* ------------------------------------------------------------------ */

type Node =
  | { n: "num"; v: number }
  | { n: "var"; v: string }
  | { n: "bin"; op: string; l: Node; r: Node }
  | { n: "neg"; e: Node };

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  // expr := term (('+' | '-') term)*
  function expr(): Node {
    let left = term();
    while (peek()?.t === "op" && "+-".includes((peek() as any).v)) {
      const op = (eat() as any).v;
      left = { n: "bin", op, l: left, r: term() };
    }
    return left;
  }
  // term := factor (('*' | '/') factor)*
  function term(): Node {
    let left = factor();
    while (peek()?.t === "op" && "*/".includes((peek() as any).v)) {
      const op = (eat() as any).v;
      left = { n: "bin", op, l: left, r: factor() };
    }
    return left;
  }
  // factor := '-'? ( number | identifier | '(' expr ')' )
  function factor(): Node {
    const tk = peek();
    if (!tk) throw { message: "Formula ends unexpectedly" };
    if (tk.t === "op" && tk.v === "-") { eat(); return { n: "neg", e: factor() }; }
    if (tk.t === "num") { eat(); return { n: "num", v: tk.v }; }
    if (tk.t === "id") { eat(); return { n: "var", v: tk.v }; }
    if (tk.t === "lp") {
      eat();
      const e = expr();
      if (peek()?.t !== "rp") throw { message: "Missing closing bracket" };
      eat();
      return e;
    }
    throw { message: "Expected a number, an input name, or a bracket" };
  }

  const tree = expr();
  if (pos < tokens.length) throw { message: "Unexpected content after the end of the formula" };
  return tree;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Names a formula depends on, for validation and for showing what a metric needs. */
export function formulaInputs(formula: string): string[] {
  try {
    const seen = new Set<string>();
    const walk = (n: Node): void => {
      if (n.n === "var") seen.add(n.v);
      else if (n.n === "bin") { walk(n.l); walk(n.r); }
      else if (n.n === "neg") walk(n.e);
    };
    walk(parse(tokenise(formula)));
    return Array.from(seen);
  } catch {
    return [];
  }
}

export function validateFormula(formula: string, known: string[]): FormulaError | null {
  if (!formula.trim()) return { message: "A formula is required" };
  let tree: Node;
  try {
    tree = parse(tokenise(formula));
  } catch (e: any) {
    return { message: e.message ?? "Formula could not be read", position: e.position };
  }
  const unknown = formulaInputs(formula).filter((v) => !known.includes(v));
  if (unknown.length) {
    return { message: `Unknown input${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}` };
  }
  // Reject a formula that cannot produce a number even with every input at 1.
  const probe = evaluate(formula, Object.fromEntries(known.map((k) => [k, 1])));
  if (probe === null) return { message: "Formula does not produce a number" };
  return null;
}

/**
 * Evaluates a formula against a set of named values.
 *
 * Returns null rather than throwing on the cases that legitimately occur in a month of
 * accounts: division by zero (a startup with no revenue), a missing input, an overflow.
 * A metric that cannot be computed is reported as unavailable, never as zero — zero is a
 * number an owner will act on.
 */
export function evaluate(formula: string, values: Record<string, number>): number | null {
  let tree: Node;
  try {
    tree = parse(tokenise(formula));
  } catch {
    return null;
  }

  const walk = (n: Node): number | null => {
    if (n.n === "num") return n.v;
    if (n.n === "var") {
      const v = values[n.v];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    if (n.n === "neg") {
      const e = walk(n.e);
      return e === null ? null : -e;
    }
    const l = walk(n.l), r = walk(n.r);
    if (l === null || r === null) return null;
    switch (n.op) {
      case "+": return l + r;
      case "-": return l - r;
      case "*": return l * r;
      // Division by zero is normal in a real book, not an error worth surfacing.
      case "/": return r === 0 ? null : l / r;
      default: return null;
    }
  };

  const out = walk(tree);
  return out === null || !Number.isFinite(out) ? null : out;
}
