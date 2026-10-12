const FORMULA = /^[=+\-@\t\r]/;

/** Quote a CSV field and stop spreadsheet apps treating it as a formula. */
export function csvCell(value: string) {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
