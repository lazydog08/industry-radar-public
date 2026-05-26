import { loadConfig } from "../config.js";

const defaultHeaders = {
  "user-agent": "Mozilla/5.0 industry-radar-kb/0.1 (+public metadata collection)",
  accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8"
};

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchText(url: string, timeoutMs = loadConfig().requestTimeoutMs): Promise<string> {
  const response = await fetch(url, {
    headers: defaultHeaders,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export async function fetchJson<T>(url: string, timeoutMs = loadConfig().requestTimeoutMs): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text) as T;
}

export function stripHtml(input = ""): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
