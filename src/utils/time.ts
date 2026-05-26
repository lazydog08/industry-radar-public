import type { ReportType, ReportWindow } from "../types.js";

const SHANGHAI_OFFSET = "+08:00";

function partsInShanghai(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function nowIso(): string {
  return toShanghaiIso(new Date());
}

export function toShanghaiIso(date: Date): string {
  const p = partsInShanghai(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${SHANGHAI_OFFSET}`;
}

export function dateOnly(date = new Date()): string {
  const p = partsInShanghai(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function makeShanghaiIso(date: string, time: string): string {
  return `${date}T${time}${SHANGHAI_OFFSET}`;
}

export function reportWindow(type: ReportType, date = dateOnly()): ReportWindow {
  if (type === "morning") {
    return {
      type,
      date,
      start: makeShanghaiIso(date, "00:00:00"),
      end: makeShanghaiIso(date, "09:59:59"),
      label: "当天 00:00-09:59"
    };
  }

  if (type === "noon") {
    return {
      type,
      date,
      start: makeShanghaiIso(date, "10:00:00"),
      end: makeShanghaiIso(date, "12:00:00"),
      label: "当天 10:00-12:00"
    };
  }

  if (type === "night") {
    return {
      type,
      date,
      start: makeShanghaiIso(date, "12:00:00"),
      end: makeShanghaiIso(date, "22:00:00"),
      label: "当天 12:00-22:00"
    };
  }

  return {
    type,
    date,
    start: makeShanghaiIso(date, "00:00:00"),
    end: makeShanghaiIso(date, "23:59:59"),
    label: type === "weekly" ? "最近 7 天" : "最近 30 天"
  };
}

export function isBetween(value: string, start: string, end: string): boolean {
  return value >= start && value <= end;
}

export function displayRange(window: ReportWindow): string {
  return `${window.start.replace("T", " ").replace("+08:00", "")} - ${window.end
    .replace("T", " ")
    .replace("+08:00", "")} UTC+8`;
}

export function filenameDate(window: ReportWindow): string {
  return window.date;
}
