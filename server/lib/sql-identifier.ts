/**
 * sql-identifier.ts
 * The one place identifiers (table and column names) are checked before they are
 * concatenated into SQL.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Table and column names cannot be bound as parameters — DDL and the column list of an
 * INSERT have to be built by string concatenation. Three places in the import/export
 * path did that with names taken straight from a user's spreadsheet or from a request
 * body:
 *
 *   - dataset-store.save()          CREATE TABLE t (<csv header row>) / INSERT INTO …
 *   - data-importer.exportToDatabase()  INSERT INTO <body.tableName> (<dataset columns>)
 *
 * The CSV header path needed no attacker at all: data-transformer.inferSchema takes
 * `Object.entries(firstRow)` keys verbatim, so a spreadsheet whose first header cell
 * reads
 *
 *     x"); DROP TABLE users; --
 *
 * produced exactly that text inside a CREATE TABLE. And because those statements carry
 * no bind values, node-postgres dispatches them over the SIMPLE protocol
 * (pg's query.js sets requiresPreparation=false when there are no values), which
 * executes every statement in the string — so the stacked `DROP TABLE` ran.
 *
 * THE RULE
 * --------
 * An identifier is only ever emitted after it matches a conservative
 * `[A-Za-z_][A-Za-z0-9_]{0,62}` — no quotes, no semicolons, no whitespace, no parens,
 * and inside PostgreSQL's 63-byte NAMEDATALEN limit so nothing is silently truncated.
 *
 * Two ways to use it, and the choice matters:
 *
 *   - `quoteSqlIdentifier` — validate AND double-quote. Use where WE create the object,
 *     so the same spelling is used on write and read back (quoting also stops PostgreSQL
 *     folding `Name` to `name`, which was silently nulling mixed-case columns on load).
 *   - `assertSqlIdentifier` — validate only, leaving the name unquoted. Use where we are
 *     writing into a table SOMEONE ELSE created: quoting there would change the meaning
 *     of an unquoted-and-therefore-folded name and break a working export.
 *
 * `toSqlIdentifier` / `uniqueSqlIdentifiers` normalise arbitrary spreadsheet headers into
 * safe names instead of refusing the import — a user's spreadsheet must still import.
 */

/** PostgreSQL NAMEDATALEN is 64, i.e. 63 usable bytes. */
export const MAX_IDENTIFIER_LENGTH = 63;

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** True when `name` may be concatenated into SQL as an identifier. */
export function isSqlIdentifier(name: unknown): name is string {
  return typeof name === 'string' && SAFE_IDENTIFIER.test(name);
}

/**
 * Validate an identifier, leaving it UNQUOTED for the caller to concatenate.
 * Use for tables ANTON did not create (see the header note on quoting vs. folding).
 */
export function assertSqlIdentifier(name: unknown, what = 'identifier'): string {
  if (!isSqlIdentifier(name)) {
    // Deliberately does not echo the rejected value: it is attacker-controlled text
    // that ends up in an API error body and in the server log.
    throw new Error(
      `Unsafe SQL ${what}: only letters, digits and underscores are allowed, ` +
      `starting with a letter or underscore, at most ${MAX_IDENTIFIER_LENGTH} characters.`
    );
  }
  return name;
}

/**
 * Validate and double-quote an identifier for use in SQL we generate.
 * The doubling of embedded quotes is unreachable given the validation above; it stays so
 * that loosening SAFE_IDENTIFIER later cannot silently produce an injectable quote.
 */
export function quoteSqlIdentifier(name: unknown, what = 'identifier'): string {
  const safe = assertSqlIdentifier(name, what);
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Normalise arbitrary text (a spreadsheet header, a JSON key) into a safe identifier.
 * Never throws: anything that cannot be normalised becomes `fallback`, so importing a
 * messy spreadsheet degrades to generated column names rather than failing.
 */
export function toSqlIdentifier(raw: unknown, fallback: string): string {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  let candidate = text
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')      // every other byte, incl. " ' ; ( ) and spaces
    .replace(/^_+(?=[A-Za-z0-9])/, '');  // leading fill from a header like "  name"

  if (/^[0-9]/.test(candidate)) candidate = `c_${candidate}`;
  candidate = candidate.slice(0, MAX_IDENTIFIER_LENGTH);

  return isSqlIdentifier(candidate) ? candidate : fallback;
}

/**
 * Normalise a whole header row, keeping the result collision-free.
 *
 * Collisions are real, not theoretical: `first name` and `first-name` both normalise to
 * `first_name`, and two columns with the same name would make CREATE TABLE fail (or, in
 * the INSERT, quietly write one column twice).
 */
export function uniqueSqlIdentifiers(names: readonly unknown[], prefix = 'column'): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    let name = toSqlIdentifier(raw, `${prefix}_${i + 1}`);
    if (used.has(name)) {
      let n = 2;
      // Trim before appending so the suffix cannot push the name past NAMEDATALEN,
      // where PostgreSQL would truncate it back into a collision.
      const stem = name.slice(0, MAX_IDENTIFIER_LENGTH - 5);
      while (used.has(`${stem}_${n}`)) n++;
      name = `${stem}_${n}`;
    }
    used.add(name);
    return name;
  });
}
