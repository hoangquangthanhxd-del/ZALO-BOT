import type { TimeRange } from "./types.js";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function zonedParts(date: Date) {
    const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(),
    };
}

function bangkokDate(year: number, month: number, day: number, endOfDay = false) {
    return new Date(Date.UTC(year, month, day, endOfDay ? 16 : -7, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

function isCalendarDate(date: Date, year: number, month: number, day: number) {
    const parts = zonedParts(date);
    return parts.year === year && parts.month === month && parts.day === day;
}

function startOfBangkokDay(now: Date) {
    const parts = zonedParts(now);
    return bangkokDate(parts.year, parts.month, parts.day);
}

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function resolveTimeRange(question: string, now: Date = new Date()): TimeRange {
    const normalized = question.toLocaleLowerCase("vi-VN").replace(/\s+/g, " ").trim();
    const today = startOfBangkokDay(now);
    const parts = zonedParts(now);

    const explicit = normalized.match(/từ\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+đến\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/u);
    if (explicit) {
        const startYear = Number(explicit[3] ?? parts.year);
        const endYear = Number(explicit[6] ?? explicit[3] ?? parts.year);
        const startMonth = Number(explicit[2]) - 1;
        const startDay = Number(explicit[1]);
        const endMonth = Number(explicit[5]) - 1;
        const endDay = Number(explicit[4]);
        const start = bangkokDate(startYear, startMonth, startDay);
        const end = bangkokDate(endYear, endMonth, endDay, true);
        if (!isCalendarDate(start, startYear, startMonth, startDay)
            || !isCalendarDate(end, endYear, endMonth, endDay)
            || start > end
            || start > now) {
            throw new RangeError("Khoảng thời gian không hợp lệ");
        }
        return { start, end: end < now ? end : now, label: explicit[0] };
    }

    if (normalized.includes("hôm qua")) {
        return { start: addDays(today, -1), end: new Date(today.getTime() - 1), label: "hôm qua" };
    }

    if (normalized.includes("tuần này")) {
        const daysSinceMonday = (parts.weekday + 6) % 7;
        return { start: addDays(today, -daysSinceMonday), end: now, label: "tuần này" };
    }

    const recentDays = normalized.match(/(\d+)\s+ngày\s+(?:nay|gần đây|qua)/u);
    if (recentDays) {
        const days = Math.max(1, Number(recentDays[1]));
        return { start: addDays(today, -(days - 1)), end: now, label: `${days} ngày gần nhất` };
    }

    return { start: today, end: now, label: "hôm nay" };
}
