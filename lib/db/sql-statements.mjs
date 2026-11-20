/** Split a migration file on semicolons that are not inside a dollar quote. */
export function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let dollar = null;
  const text = String(sqlText || "");
  for (let i = 0; i < text.length; i += 1) {
    if (!dollar && text[i] === "$") {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(text.slice(i));
      if (tag) {
        dollar = tag[0];
        current += tag[0];
        i += tag[0].length - 1;
        continue;
      }
    } else if (dollar && text.startsWith(dollar, i)) {
      current += dollar;
      i += dollar.length - 1;
      dollar = null;
      continue;
    }
    if (!dollar && text[i] === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += text[i];
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function statementBody(statement) {
  return String(statement || "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

const ADDITIVE = [
  /^alter\s+table\s+\S+\s+add\s+column\s+if\s+not\s+exists\s+/i,
  /^create\s+table\s+if\s+not\s+exists\s+/i,
  /^create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+/i,
  /^do\s+\$\$[\s\S]*\bif\s+not\s+exists\b[\s\S]*\badd\s+constraint\b[\s\S]*\$\$\s*$/i,
];

/** True when the statement only adds a column, table, index, or a missing constraint. */
export function isAdditiveStatement(statement) {
  const body = statementBody(statement);
  if (!body) return true;
  return ADDITIVE.some((pattern) => pattern.test(body));
}

export function isAdditiveMigration(sqlText) {
  return splitSqlStatements(sqlText).every((statement) => isAdditiveStatement(statement));
}
