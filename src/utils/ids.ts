import crypto from "node:crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function makeId(prefix: string, input: string): string {
  return `${prefix}_${sha256(input).slice(0, 20)}`;
}

export function stableHash(parts: Array<string | undefined>): string {
  return sha256(parts.map((part) => part || "").join("|"));
}
