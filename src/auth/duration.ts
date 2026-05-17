export function addDuration(from: Date, expr: string): Date {
  const m = /^(\d+)([smhd])$/.exec(expr.trim());
  if (!m) throw new Error(`Invalid duration: ${expr}`);
  const n = Number(m[1]);
  const unit = m[2];
  const ms = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as 's'|'m'|'h'|'d'];
  return new Date(from.getTime() + n * ms);
}
