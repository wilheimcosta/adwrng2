import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  History,
  Plane,
  RefreshCw,
  Shield,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIcao } from "@/contexts/icao-context";
import {
  extractIcaosFromAdWarning,
  fetchAerodromeStatusDetails,
  fetchAiswebAerodromes,
  fetchMetarHistory24h,
  fetchSynopHistory24h,
  mapFlightRuleFromFlag,
  type MetarHistoryItem,
  type SynopHistoryItem,
} from "@/lib/redemet";

const CHECK_INTERVAL_SECONDS = 30;
const CIRCLE_RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

type DashboardWarning = { mensagem: string };

function formatUtcClock(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatUtcDateTime(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = date.getUTCFullYear().toString();
  const hour = date.getUTCHours().toString().padStart(2, "0");
  const minute = date.getUTCMinutes().toString().padStart(2, "0");
  return `${day}/${month}/${year} - ${hour}:${minute} UTC`;
}

function formatPtBrMonthYear(date: Date): string {
  const months = [
    "JAN",
    "FEV",
    "MAR",
    "ABR",
    "MAI",
    "JUN",
    "JUL",
    "AGO",
    "SET",
    "OUT",
    "NOV",
    "DEZ",
  ];
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = months[date.getUTCMonth()] ?? "N/D";
  const year = date.getUTCFullYear().toString();
  return `${day}/${month}/${year}`;
}

function resolveUtcDate(day: number, hour: number, minute: number, base: Date): Date {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, day, hour, minute, 0, 0));
  const dayDiff = Math.round((candidate.getTime() - base.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff > 20) return new Date(Date.UTC(y, m - 1, day, hour, minute, 0, 0));
  if (dayDiff < -20) return new Date(Date.UTC(y, m + 1, day, hour, minute, 0, 0));
  return candidate;
}

function ktToKmH(value: number): number {
  return value * 1.852;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function translateUnavailableMessage(text: string, type: "METAR" | "TAF"): string | null {
  const regex = new RegExp(`${type}\\s+n[aã]o\\s+dispon[ií]vel\\s+para\\s+([A-Z]{4})`, "i");
  const match = String(text ?? "").match(regex);
  if (!match) return null;
  return `${type} not available for ${match[1].toUpperCase()}`;
}

function flightRuleConfig(rule: "VFR" | "IFR" | "LIFR") {
  if (rule === "VFR")
    return {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/25",
      dot: "bg-emerald-400",
      glow: "shadow-[0_0_16px_hsl(160_85%_45%/0.15)]",
      label: "VFR",
    };
  if (rule === "IFR")
    return {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/25",
      dot: "bg-amber-400",
      glow: "shadow-[0_0_16px_hsl(38_92%_50%/0.15)]",
      label: "IFR",
    };
  return {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/25",
    dot: "bg-red-400",
    glow: "shadow-[0_0_16px_hsl(0_72%_55%/0.15)]",
    label: "LIFR",
  };
}

function parseUtcDate(dateTime: string): Date | null {
  const value = String(dateTime ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveDayHourMinuteWithReference(
  day: number,
  hour: number,
  minute: number,
  reference: Date,
): Date {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, day, hour, minute, 0, 0));
  const diffDays = Math.round((candidate.getTime() - reference.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 20) return new Date(Date.UTC(y, m - 1, day, hour, minute, 0, 0));
  if (diffDays < -20) return new Date(Date.UTC(y, m + 1, day, hour, minute, 0, 0));
  return candidate;
}

function getMessageNominalUtc(item: MetarHistoryItem): Date | null {
  const ref =
    parseUtcDate(item.validade_inicial) ??
    parseUtcDate(item.recebimento) ??
    new Date();

  const match = String(item.mens ?? "").toUpperCase().match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  if (!match) return parseUtcDate(item.validade_inicial) ?? null;

  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if ([day, hour, minute].some((v) => Number.isNaN(v))) {
    return parseUtcDate(item.validade_inicial) ?? null;
  }
  return resolveDayHourMinuteWithReference(day, hour, minute, ref);
}

function toUtcHourKey(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}`;
}

function utcHourKeyToMs(key: string): number {
  if (!/^\d{10}$/.test(key)) return 0;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(4, 6));
  const day = Number(key.slice(6, 8));
  const hour = Number(key.slice(8, 10));
  return Date.UTC(year, month - 1, day, hour, 0, 0, 0);
}

function formatUtcHourLabel(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:00 UTC`;
}

function formatUtcMinuteLabel(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi} UTC`;
}

function getLast24HourSlots(nowUtc: Date): { key: string; label: string }[] {
  const base = new Date(
    Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
      nowUtc.getUTCHours(),
      0,
      0,
      0,
    ),
  );

  const slots: { key: string; label: string }[] = [];
  for (let i = 23; i >= 0; i -= 1) {
    const d = new Date(base.getTime() - i * 60 * 60 * 1000);
    slots.push({ key: toUtcHourKey(d), label: formatUtcHourLabel(d) });
  }
  return slots;
}

function getLatestSynopPublicationDate(nowUtc: Date): Date {
  const validHours = [0, 3, 6, 9, 12, 15, 18, 21];
  const currentHour = nowUtc.getUTCHours();
  const latestHour = [...validHours].reverse().find((h) => h <= currentHour);
  const base = new Date(
    Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  if (typeof latestHour === "number") {
    base.setUTCHours(latestHour);
    return base;
  }

  // Before 00:00 publication of current UTC day is available, fallback to previous day 21Z
  base.setUTCDate(base.getUTCDate() - 1);
  base.setUTCHours(21);
  return base;
}

function getSynop24hPublicationSlots(nowUtc: Date): { key: string; label: string }[] {
  const latest = getLatestSynopPublicationDate(nowUtc);
  // 24h window for 3-hour publication cycle => 9 slots (inclusive)
  const slots: { key: string; label: string }[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const d = new Date(latest.getTime() - i * 3 * 60 * 60 * 1000);
    slots.push({ key: toUtcHourKey(d), label: formatUtcHourLabel(d) });
  }
  return slots;
}

function metarTransmissionStatus(item: MetarHistoryItem): {
  label: string;
  className: string;
} {
  const msg = item.mens.toUpperCase();
  const recebimentoDate = parseUtcDate(item.recebimento);
  const nominalDate = getMessageNominalUtc(item);
  if (!recebimentoDate || !nominalDate) {
    return { label: "INVALID", className: "text-red-400" };
  }
  const isCor = /\b(METAR|SPECI)\s+COR\b/.test(msg);
  const isMetar = /^METAR\b/.test(msg) && !isCor;
  const isSpeci = /^SPECI\b/.test(msg) && !isCor;

  if (isCor) return { label: "COR", className: "text-amber-400" };
  if (isMetar) {
    const rangeStart = new Date(nominalDate.getTime() - 5 * 60 * 1000); // HH:55:00
    const rangeEndExclusive = new Date(nominalDate.getTime() + 5 * 60 * 1000); // HH:05:00
    if (recebimentoDate < rangeStart) {
      return { label: "EARLY", className: "text-amber-300 animate-pulse" };
    }
    if (recebimentoDate < rangeEndExclusive) {
      return { label: "ON TIME", className: "text-emerald-400" };
    }
    return { label: "DELAYED", className: "text-red-400 animate-pulse" };
  }
  if (isSpeci) {
    const rangeStart = nominalDate; // HH:MM:00
    const rangeEndExclusive = new Date(nominalDate.getTime() + 15 * 60 * 1000); // HH:MM+15:00
    if (recebimentoDate < rangeStart) {
      return { label: "EARLY", className: "text-amber-300 animate-pulse" };
    }
    if (recebimentoDate < rangeEndExclusive) {
      return { label: "ON TIME", className: "text-emerald-400" };
    }
    return { label: "DELAYED", className: "text-red-400 animate-pulse" };
  }
  return { label: "UNKNOWN", className: "text-muted-foreground" };
}

/* ───────────────────── Component ───────────────────── */

export default function Dashboard() {
  const { icao } = useIcao();
  const [utcNow, setUtcNow] = useState(() => new Date());
  const [nextCheck, setNextCheck] = useState(CHECK_INTERVAL_SECONDS);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showAlarmOverlay, setShowAlarmOverlay] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmTimeoutRef = useRef<number | null>(null);
  const showAlarmRef = useRef(false);
  const lastMsgHashRef = useRef("");

  const {
    data: statusData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["aerodrome-status", icao],
    queryFn: async () => {
      const res = await fetchAerodromeStatusDetails(icao);
      if (res.error) throw new Error(res.error);
      return res;
    },
    enabled: /^[A-Z]{4}$/.test(icao),
  });

  const flightRule = mapFlightRuleFromFlag(statusData?.flag ?? null);
  const list: DashboardWarning[] = statusData?.hasAdWarning
    ? [
        {
          mensagem:
            statusData.warningText ??
            statusData.reportText ??
            "Aviso de aerodromo ativo.",
        },
      ]
    : [];

  const countdownDisplay = `${Math.floor(nextCheck / 60)
    .toString()
    .padStart(2, "0")}:${(nextCheck % 60).toString().padStart(2, "0")}`;
  const ringOffset =
    CIRCUMFERENCE - (nextCheck / CHECK_INTERVAL_SECONDS) * CIRCUMFERENCE;

  const reportType = useMemo(() => {
    const report = statusData?.reportText ?? "";
    if (/\bSPECI\b/i.test(report)) return "SPECI";
    if (/\bMETAR\b/i.test(report)) return "METAR";
    return "N/D";
  }, [statusData?.reportText]);
  const metarPanelTitle = reportType === "SPECI" ? "SPECI" : "METAR";

  const reportLine = useMemo(() => {
    const report = statusData?.reportText ?? "";
    const translatedUnavailable = translateUnavailableMessage(report, "METAR");
    if (translatedUnavailable) return translatedUnavailable;

    const lines = report
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return (
      lines.find((item) => /\b(METAR|SPECI)\b/i.test(item)) ??
      lines[0] ??
      "--"
    );
  }, [statusData?.reportText]);

  const tafLine = useMemo(() => {
    const report = statusData?.reportText ?? "";
    const translatedUnavailable = translateUnavailableMessage(report, "TAF");
    if (translatedUnavailable) return translatedUnavailable;

    const normalized = report.replace(/\r/g, "");
    const fullMatch = normalized.match(/TAF[\s\S]*?=/i);
    return fullMatch
      ? fullMatch[0].trim()
      : `TAF not available for ${icao.toUpperCase()}`;
  }, [statusData?.reportText, icao]);

  const isMetarDelayed = useMemo(() => {
    const report = statusData?.reportText ?? "";
    const match = report.match(/\bMETAR\s+[A-Z]{4}\s+(\d{2})(\d{2})(\d{2})Z\b/i);
    if (!match) return false;

    const metarDay = Number(match[1]);
    const metarHour = Number(match[2]);
    if ([metarDay, metarHour].some(Number.isNaN)) return false;

    return (
      metarDay !== utcNow.getUTCDate() ||
      metarHour !== utcNow.getUTCHours()
    );
  }, [statusData?.reportText, utcNow]);

  const warningIcaos = useMemo(
    () => extractIcaosFromAdWarning(statusData?.warningText ?? ""),
    [statusData?.warningText],
  );

  const {
    data: aiswebData,
    isFetching: isFetchingAisweb,
    error: aiswebError,
  } = useQuery({
    queryKey: ["aisweb-rotaer", warningIcaos.join(",")],
    queryFn: async () => {
      const res = await fetchAiswebAerodromes(warningIcaos);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: Boolean(statusData?.hasAdWarning && warningIcaos.length > 0),
  });

  const {
    data: metarHistoryData,
    isFetching: isFetchingMetarHistory,
    error: metarHistoryError,
  } = useQuery({
    queryKey: ["metar-history-24h", icao],
    queryFn: async () => {
      const res = await fetchMetarHistory24h(icao);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: /^[A-Z]{4}$/.test(icao),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
  });

  const {
    data: synopHistoryData,
    isFetching: isFetchingSynopHistory,
    error: synopHistoryError,
  } = useQuery({
    queryKey: ["synop-history-24h", icao],
    queryFn: async () => {
      const res = await fetchSynopHistory24h(icao);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    enabled: /^[A-Z]{4}$/.test(icao),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
  });

  const historySlots = useMemo(() => getLast24HourSlots(utcNow), [utcNow]);
  const synopSlots = useMemo(() => getSynop24hPublicationSlots(utcNow), [utcNow]);

  const metarHourlyRows = useMemo(() => {
    type MetarRow = {
      hour: string;
      isMissing: boolean;
      message: string;
      typeClass: string;
      transmissionLabel: string;
      transmissionClass: string;
      transmissionTime: string;
      sortTs: number;
    };

    const normalized = (metarHistoryData ?? [])
      .map((item) => {
        const nominal = getMessageNominalUtc(item);
        if (!nominal) return null;
        return { item, nominal, upper: item.mens.toUpperCase() };
      })
      .filter(Boolean) as { item: MetarHistoryItem; nominal: Date; upper: string }[];

    const metarByHour = new Map<string, { item: MetarHistoryItem; nominal: Date; upper: string }[]>();
    normalized
      .filter(({ upper }) => /^METAR\b/.test(upper))
      .forEach((entry) => {
        const key = toUtcHourKey(entry.nominal);
        const arr = metarByHour.get(key) ?? [];
        arr.push(entry);
        metarByHour.set(key, arr);
      });

    const metarScheduledRows: MetarRow[] = historySlots.map((slot) => {
      const items = metarByHour.get(slot.key) ?? [];
      if (!items.length) {
        return {
          hour: slot.label,
          isMissing: true,
          message: "METAR MESSAGE MISSING IN OPMET DATABASE",
          typeClass: "text-red-400 animate-pulse font-black",
          transmissionLabel: "--",
          transmissionClass: "text-red-400",
          transmissionTime: "--",
          sortTs: utcHourKeyToMs(slot.key),
        };
      }

      const ordered = [...items].sort((a, b) => {
        const ta = parseUtcDate(a.recebimento)?.getTime() ?? 0;
        const tb = parseUtcDate(b.recebimento)?.getTime() ?? 0;
        return tb - ta;
      });
      const best = ordered[0].item;
      const upper = best.mens.toUpperCase();
      const typeClass = upper.startsWith("SPECI")
        ? "text-red-300"
        : upper.startsWith("METAR COR")
          ? "text-blue-300"
          : "text-foreground";
      const tx = metarTransmissionStatus(best);
      const nominal = getMessageNominalUtc(best);
      const receivedAt = parseUtcDate(best.recebimento);

      return {
        hour: slot.label,
        isMissing: false,
        message: best.mens,
        typeClass,
        transmissionLabel: tx.label,
        transmissionClass: tx.className,
        transmissionTime: receivedAt ? formatUtcMinuteLabel(receivedAt) : "--",
        sortTs: nominal?.getTime() ?? utcHourKeyToMs(slot.key),
      };
    });

    const speciRows: MetarRow[] = normalized
      .filter(({ upper }) => /^SPECI\b/.test(upper))
      .map(({ item, nominal }) => {
        const tx = metarTransmissionStatus(item);
        const receivedAt = parseUtcDate(item.recebimento);
        return {
          hour: formatUtcMinuteLabel(nominal),
          isMissing: false,
          message: item.mens,
          typeClass: "text-red-300",
          transmissionLabel: tx.label,
          transmissionClass: tx.className,
          transmissionTime: receivedAt ? formatUtcMinuteLabel(receivedAt) : "--",
          sortTs: nominal.getTime(),
        };
      });

    return [...metarScheduledRows, ...speciRows].sort((a, b) => b.sortTs - a.sortTs);
  }, [metarHistoryData, historySlots]);

  const synopHourlyRows = useMemo(() => {
    const byHour = new Map<string, SynopHistoryItem[]>();
    (synopHistoryData ?? []).forEach((item) => {
      const d = parseUtcDate(item.validade_inicial);
      if (!d) return;
      const key = toUtcHourKey(d);
      const arr = byHour.get(key) ?? [];
      arr.push(item);
      byHour.set(key, arr);
    });

    return synopSlots.map((slot) => {
      const items = byHour.get(slot.key) ?? [];
      if (!items.length) {
        return {
          hour: slot.label,
          isMissing: true,
          message: "SYNOP MESSAGE MISSING IN OPMET DATABASE",
          className: "text-red-400 font-bold",
        };
      }
      const ordered = [...items].sort((a, b) => {
        const ta = parseUtcDate(a.validade_inicial)?.getTime() ?? 0;
        const tb = parseUtcDate(b.validade_inicial)?.getTime() ?? 0;
        return tb - ta;
      });
      const messages = Array.from(
        new Set(ordered.map((item) => String(item.mens ?? "").trim()).filter(Boolean)),
      );

      return {
        hour: slot.label,
        isMissing: false,
        message: messages.join("\n"),
        className: "text-foreground",
      };
    });
  }, [synopHistoryData, synopSlots]);

  const hasHistoryGaps = useMemo(
    () =>
      metarHourlyRows.some((row) => row.isMissing) ||
      synopHourlyRows.some((row) => row.isMissing),
    [metarHourlyRows, synopHourlyRows],
  );

  const historySummary = useMemo(() => {
    const metarCount = metarHourlyRows.filter(
      (row) => !row.isMissing && /^METAR\b/.test(row.message.toUpperCase()),
    ).length;
    const speciCount = metarHourlyRows.filter(
      (row) => !row.isMissing && /^SPECI\b/.test(row.message.toUpperCase()),
    ).length;
    const synopCount = synopHourlyRows.filter((row) => !row.isMissing).length;
    const missingCount =
      metarHourlyRows.filter((row) => row.isMissing).length +
      synopHourlyRows.filter((row) => row.isMissing).length;
    const delayedCount = metarHourlyRows.filter(
      (row) => row.transmissionLabel === "DELAYED",
    ).length;
    const earlyCount = metarHourlyRows.filter(
      (row) => row.transmissionLabel === "EARLY",
    ).length;

    return {
      metarCount,
      speciCount,
      synopCount,
      missingCount,
      delayedCount,
      earlyCount,
    };
  }, [metarHourlyRows, synopHourlyRows]);

  const decodedWarning = useMemo(() => {
    const warningText = (statusData?.warningText ?? "").trim();
    const upper = warningText.toUpperCase();

    const numberMatch = upper.match(/\bAD\s+WRNG\s+(\d+)\b/);
    const validityMatch = upper.match(/\bVALID\s+(\d{2})(\d{2})(\d{2})\/(\d{2})(\d{2})(\d{2})\b/);
    const wspdMatch = upper.match(/\bWSPD\s+(\d{1,3})KT(?:\s+MAX\s+(\d{1,3}))?\b/);

    const startsAt =
      validityMatch
        ? resolveUtcDate(
            Number(validityMatch[1]),
            Number(validityMatch[2]),
            Number(validityMatch[3]),
            utcNow,
          )
        : null;
    const endsAt =
      validityMatch
        ? resolveUtcDate(
            Number(validityMatch[4]),
            Number(validityMatch[5]),
            Number(validityMatch[6]),
            startsAt ?? utcNow,
          )
        : null;

    const wspdKt = wspdMatch ? Number(wspdMatch[1]) : null;
    const maxKt = wspdMatch?.[2] ? Number(wspdMatch[2]) : null;

    const aerodromes = warningIcaos.map((code) => {
      const data = (aiswebData ?? []).find((item) => item.code === code);
      return {
        code,
        detail: data ? `${data.code}: ${data.name} - ${data.city}/${data.uf}` : code,
      };
    });

    return {
      warningText,
      number: numberMatch?.[1] ?? null,
      startsAt,
      endsAt,
      hasTs: /\bTS\b/.test(upper),
      hasSfc: /\bSFC\b/.test(upper),
      wspdKt,
      maxKt,
      hasFcstNc: /\bFCST\s+NC\b/.test(upper),
      aerodromes,
    };
  }, [statusData?.warningText, warningIcaos, aiswebData, utcNow]);

  /* ── Audio helpers ── */

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current
        .resume()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    }
    return audioCtxRef.current;
  };

  const playBeep = (duration = 0.2, freq = 880) => {
    const ctx = initAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      setAudioBlocked(true);
      void ctx.resume().catch(() => undefined);
    } else {
      setAudioBlocked(false);
    }
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx.currentTime + duration,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* keep monitoring even without audio */
    }
  };

  const stopAlarm = () => {
    showAlarmRef.current = false;
    setShowAlarmOverlay(false);
    setAudioBlocked(false);
    if (alarmTimeoutRef.current) {
      window.clearTimeout(alarmTimeoutRef.current);
      alarmTimeoutRef.current = null;
    }
  };

  const handleAcknowledgeSilenceEmail = () => {
    stopAlarm();

    const fallbackWarning = (statusData?.warningText ?? list[0]?.mensagem ?? "Sem mensagem de aviso.").trim();
    const warningText = decodedWarning.warningText || fallbackWarning;

    const wsLine =
      decodedWarning.wspdKt !== null
        ? `Previsão de velocidade do vento na superfície de ${decodedWarning.wspdKt} nós (~${ktToKmH(decodedWarning.wspdKt).toFixed(2)} km/h), com rajadas máximas de ${decodedWarning.maxKt ?? decodedWarning.wspdKt} nós (~${ktToKmH(decodedWarning.maxKt ?? decodedWarning.wspdKt).toFixed(2)} km/h).`
        : "Sem informação de velocidade do vento.";

    const rawValidity =
      decodedWarning.startsAt && decodedWarning.endsAt
        ? `${decodedWarning.startsAt.getUTCDate().toString().padStart(2, "0")}${decodedWarning.startsAt.getUTCHours().toString().padStart(2, "0")}${decodedWarning.startsAt.getUTCMinutes().toString().padStart(2, "0")}/${decodedWarning.endsAt.getUTCDate().toString().padStart(2, "0")}${decodedWarning.endsAt.getUTCHours().toString().padStart(2, "0")}${decodedWarning.endsAt.getUTCMinutes().toString().padStart(2, "0")}`
        : "N/D";

    const startsAtLabel = decodedWarning.startsAt ? formatUtcDateTime(decodedWarning.startsAt) : "N/D";
    const endsAtLabel = decodedWarning.endsAt ? formatUtcDateTime(decodedWarning.endsAt) : "N/D";
    const issuedLabel = formatPtBrMonthYear(new Date());
    const warningNumber = decodedWarning.number ?? "N/D";
    const aerodromeList =
      decodedWarning.aerodromes.length > 0
        ? decodedWarning.aerodromes
            .map((item) => `<li><b>${escapeHtml(item.code)}:</b> ${escapeHtml(item.detail.replace(`${item.code}: `, ""))}</li>`)
            .join("")
        : "<li>N/D</li>";

    const htmlBody = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Relatório Dinâmico AD WRNG</title>
    <style>
      body{margin:0;padding:0;background:#061328;color:#e6f0ff;font-family:'Segoe UI',Arial,sans-serif}
      .bg{padding:24px;background:radial-gradient(circle at 14% 18%, rgba(41,135,178,.20), transparent 28%),radial-gradient(circle at 88% 78%, rgba(30,100,186,.20), transparent 28%),linear-gradient(90deg,#061328 0%,#061a35 50%,#061328 100%)}
      .wrap{max-width:1020px;margin:0 auto;background:linear-gradient(180deg,#0f2545 0%,#0b1c35 100%);border:1px solid #26568f;border-radius:18px;padding:16px}
      .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .pill{display:inline-block;padding:8px 14px;border:1px solid #2f679e;border-radius:999px;background:#0e2a4d;color:#d8e9ff;font-size:13px;font-weight:700}
      .title{margin:14px 0 12px;font-size:44px;font-weight:800;letter-spacing:.2px;color:#eaf3ff}
      .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .card{border:1px solid #2a6299;border-radius:12px;padding:14px;background:rgba(8,28,54,.72);min-height:74px}
      .card .label{display:block;color:#9cc3e8;font-size:13px;font-weight:700;text-transform:uppercase;margin-bottom:7px}
      .card .value{color:#f2f7ff;font-size:26px;font-weight:800;line-height:1.25}
      .lead{margin:14px 0 10px;color:#bfd4ee;font-size:18px}
      .section{margin:10px 0 6px;font-size:22px;font-weight:800;color:#e6f0ff}
      ul{margin:0 0 12px 22px;padding:0;font-size:17px;line-height:1.45;color:#d6e4f7}
      .item{margin-top:10px;border:1px solid #2a6299;border-radius:12px;padding:12px 14px;background:rgba(11,31,58,.65)}
      .item b{font-size:29px;color:#f1f6ff}
      .item p{margin:6px 0 0;font-size:17px;color:#c9dcf4;line-height:1.45}
      .note{margin-top:12px;border:1px solid #7b2f45;border-radius:12px;background:rgba(66,18,32,.45);padding:10px 14px;font-size:17px;font-weight:800;color:#ffd6dc}
      @media (max-width:780px){.cards{grid-template-columns:1fr}.title{font-size:34px}.item b{font-size:23px}}
    </style>
  </head>
  <body>
    <div class="bg">
      <div class="wrap">
        <div class="top">
          <span class="pill">🟢 Relatório Dinâmico AD WRNG</span>
        </div>

        <h1 class="title">AVISO DE AERÓDROMO Nº ${escapeHtml(warningNumber)} - ${escapeHtml(issuedLabel)}</h1>

        <div class="cards">
          <div class="card">
            <span class="label">🕒 Validade Inicial</span>
            <div class="value">${escapeHtml(startsAtLabel)}</div>
          </div>
          <div class="card">
            <span class="label">🕒 Validade Final</span>
            <div class="value">${escapeHtml(endsAtLabel)}</div>
          </div>
          <div class="card">
            <span class="label">✉ Mensagem</span>
            <div class="value">${escapeHtml(warningText)}</div>
          </div>
        </div>

        <p class="lead">Segue abaixo a decodificação detalhada para conhecimento e providências.</p>
        <h2 class="section">Aeródromos Aplicáveis:</h2>
        <ul>${aerodromeList}</ul>

        <div class="item"><b>🔺 AD WRNG ${escapeHtml(warningNumber)}:</b><p>Este é o aviso de aeródromo número ${escapeHtml(warningNumber)} emitido pelo CIMAER - Centro Integrado de Meteorologia Aeronáutica.</p></div>
        <div class="item"><b>🕘 VALID ${escapeHtml(rawValidity)}:</b><p>O aviso é válido de <b>${escapeHtml(startsAtLabel)}</b> até <b>${escapeHtml(endsAtLabel)}</b>.</p></div>
        <div class="item"><b>🌩️ TS (Trovoadas):</b><p>${decodedWarning.hasTs ? "Há previsão de trovoadas nos aeródromos mencionados." : "Não há indicação de trovoadas na mensagem."}</p></div>
        <div class="item"><b>💨 ${escapeHtml(decodedWarning.hasSfc ? "SFC " : "")}WSPD ${decodedWarning.wspdKt ?? "N/D"}KT MAX ${decodedWarning.maxKt ?? "N/D"}:</b><p>${escapeHtml(wsLine)}</p></div>
        <div class="item"><b>🧭 FCST NC:</b><p>${decodedWarning.hasFcstNc ? "Sem mudanças significativas previstas durante o período de validade do aviso." : "Sem indicação FCST NC na mensagem."}</p></div>

        <div class="note">NOTA: 1 NÓ (KT) = 1,852 km/h</div>
      </div>
    </div>
  </body>
</html>`;

    const subject = `AD WRNG ${warningNumber} - ${icao.toUpperCase()}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(htmlBody)}`;
    window.location.href = mailtoUrl;
  };

  const triggerAlarm = () => {
    if (!audioEnabled) return;
    showAlarmRef.current = true;
    setShowAlarmOverlay(true);
    const playLoop = () => {
      if (!showAlarmRef.current) return;
      playBeep(0.2, 880);
      window.setTimeout(() => playBeep(0.2, 587), 300);
      alarmTimeoutRef.current = window.setTimeout(playLoop, 800);
    };
    if (alarmTimeoutRef.current) {
      window.clearTimeout(alarmTimeoutRef.current);
      alarmTimeoutRef.current = null;
    }
    playLoop();
  };

  /* ── Timers & effects ── */

  useEffect(() => {
    const t = window.setInterval(() => setUtcNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(
      () => setNextCheck((p) => (p > 0 ? p - 1 : 0)),
      1000,
    );
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (nextCheck !== 0) return;
    (async () => {
      await refetch();
      setNextCheck(CHECK_INTERVAL_SECONDS);
    })();
  }, [nextCheck, refetch]);

  useEffect(() => {
    setNextCheck(CHECK_INTERVAL_SECONDS);
  }, [icao]);

  useEffect(() => {
    const topMessage = list.length > 0 ? list[0].mensagem : "";
    if (!topMessage) {
      lastMsgHashRef.current = "";
      return;
    }
    if (topMessage !== lastMsgHashRef.current) {
      lastMsgHashRef.current = topMessage;
      triggerAlarm();
    }
  }, [list]);

  useEffect(() => {
    const unlock = () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") {
        void ctx
          .resume()
          .then(() => setAudioBlocked(false))
          .catch(() => undefined);
      }
    };
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (alarmTimeoutRef.current) window.clearTimeout(alarmTimeoutRef.current);
      if (audioCtxRef.current) void audioCtxRef.current.close();
    };
  }, []);

  useEffect(() => {
    showAlarmRef.current = showAlarmOverlay;
    if (!showAlarmOverlay && alarmTimeoutRef.current) {
      window.clearTimeout(alarmTimeoutRef.current);
      alarmTimeoutRef.current = null;
    }
  }, [showAlarmOverlay]);

  /* ── Derived status ── */

  const statusLabel = useMemo(() => {
    if (error) return "OFFLINE";
    if (isFetching) return "SYNCING";
    return "LIVE";
  }, [error, isFetching]);

  const ruleConfig = flightRule ? flightRuleConfig(flightRule) : null;
  const panelAccentBarClass = "w-1 h-5 rounded-full bg-primary shadow-[0_0_8px_hsl(190_95%_55%/0.3)]";

  /* ───────────────────── Render ───────────────────── */

  return (
    <div className="relative w-full space-y-4 sm:space-y-5 font-sans text-sm sm:text-[15px] md:text-base">
      {/* ── Header Section ── */}
      <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          {/* Animated radar icon */}
          <div className="relative w-11 h-11 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/15 overflow-hidden">
            <Plane className="w-5 h-5 text-primary relative z-10" />
            {/* Scan line effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-scan" />
            </div>
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-2 h-px bg-primary/40" />
            <div className="absolute top-0 left-0 h-2 w-px bg-primary/40" />
            <div className="absolute bottom-0 right-0 w-2 h-px bg-primary/40" />
            <div className="absolute bottom-0 right-0 h-2 w-px bg-primary/40" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg md:text-xl font-extrabold text-foreground tracking-tight text-balance">
              AD WRNG Monitor
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-mono">
              {"// "}
              <span className="text-primary font-semibold">{icao}</span>
              {" :: Real-Time Monitoring"}
            </p>
          </div>
        </div>

        <div className="flex w-full md:w-auto items-center md:justify-end gap-2 flex-wrap">
          {/* UTC clock */}
          <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-border/60">
            <Clock className="w-3.5 h-3.5 text-primary/60" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm sm:text-base font-bold tabular-nums glow-text">
                {formatUtcClock(utcNow)}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                UTC
              </span>
            </div>
          </div>

          {/* Status indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider ${
              error
                ? "text-red-400 border-red-500/20 bg-red-500/5"
                : isFetching
                  ? "text-amber-400 border-amber-400/20 bg-amber-400/5"
                  : "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
            }`}
          >
            <div className="relative flex items-center justify-center">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  error
                    ? "bg-red-400"
                    : isFetching
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                }`}
              />
              {!error && !isFetching && (
                <div className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping opacity-40" />
              )}
            </div>
            {statusLabel}
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Flight Rule */}
        <div className={`card-neon p-3 sm:p-4 ${ruleConfig ? ruleConfig.glow : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Flight Rule
            </span>
          </div>
          {ruleConfig ? (
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center">
                <div className={`w-3 h-3 rounded-full ${ruleConfig.dot}`} />
                <div className={`absolute w-3 h-3 rounded-full ${ruleConfig.dot} animate-ping opacity-25`} />
              </div>
              <span className={`text-[1.5rem] sm:text-[1.7rem] font-black font-mono ${ruleConfig.text}`}>
                {ruleConfig.label}
              </span>
            </div>
          ) : (
            <span className="text-[1.5rem] sm:text-[1.7rem] font-black font-mono text-muted-foreground/40">
              --
            </span>
          )}
        </div>

        {/* Report Type */}
        <div className="card-neon p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wind className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Report
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary/50" />
            <span className="text-[1.5rem] sm:text-[1.7rem] font-black font-mono text-foreground">
              {reportType}
            </span>
          </div>
        </div>

        {/* Countdown */}
        <div className="card-neon p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw
              className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Next Scan
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[1.5rem] sm:text-[1.7rem] font-black font-mono tabular-nums glow-text">
              {countdownDisplay}
            </span>
            {/* SVG ring timer */}
            <div className="relative w-10 h-10 flex-shrink-0">
              <svg
                className="transform -rotate-90 w-10 h-10"
                viewBox="0 0 40 40"
              >
                <circle
                  cx="20"
                  cy="20"
                  r={CIRCLE_RADIUS}
                  stroke="hsl(220 16% 14%)"
                  strokeWidth="2"
                  fill="transparent"
                />
                <circle
                  cx="20"
                  cy="20"
                  r={CIRCLE_RADIUS}
                  stroke="hsl(190 95% 55%)"
                  strokeWidth="2"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  className="transition-all duration-1000 ease-linear"
                  style={{
                    filter: "drop-shadow(0 0 4px hsl(190 95% 55% / 0.4))",
                  }}
                />
              </svg>
              {/* Center dot */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              </div>
            </div>
          </div>
        </div>

        {/* Audio Toggle */}
        <button
          onClick={() => {
            const next = !audioEnabled;
            setAudioEnabled(next);
            if (next) playBeep(0.1, 880);
            else stopAlarm();
          }}
          className={`card-neon p-3 sm:p-4 text-left transition-all ${
            audioEnabled
              ? "border-primary/20 shadow-[0_0_20px_hsl(190_95%_55%/0.06)]"
              : ""
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {audioEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-primary" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Audio
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Toggle pill */}
            <div
              className={`relative w-8 h-4 rounded-full transition-colors ${
                audioEnabled ? "bg-primary/20" : "bg-muted"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                  audioEnabled
                    ? "left-0.5 translate-x-4 bg-primary shadow-[0_0_8px_hsl(190_95%_55%/0.5)]"
                    : "left-0.5 translate-x-0 bg-muted-foreground/40"
                }`}
              />
            </div>
            <span
              className={`text-base font-bold font-mono ${audioEnabled ? "text-primary" : "text-muted-foreground"}`}
            >
              {audioEnabled ? "ON" : "OFF"}
            </span>
          </div>
        </button>
      </div>

      {/* ── METAR / TAF panels ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* METAR */}
        <div className="card-neon overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-border/60 neon-accent">
            <div className="flex items-center gap-2.5">
              <div className={panelAccentBarClass} />
              <span className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                {metarPanelTitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setShowHistoryPanel((prev) => !prev)}
                className={`h-7 px-2.5 text-[11px] font-mono uppercase tracking-wider border ${
                  hasHistoryGaps
                    ? "bg-red-500/15 text-red-300 border-red-500/45 animate-pulse"
                    : "bg-emerald-500/12 text-emerald-300 border-emerald-500/35"
                }`}
              >
                <History className="w-3 h-3 mr-1" />
                History
                {showHistoryPanel ? (
                  <ChevronUp className="w-3 h-3 ml-1" />
                ) : (
                  <ChevronDown className="w-3 h-3 ml-1" />
                )}
              </Button>
              {isMetarDelayed && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-300 border border-amber-500/35 text-xs font-bold font-mono px-2.5 animate-pulse"
                >
                  Delayed
                </Badge>
              )}
              {ruleConfig && (
                <Badge
                  variant="outline"
                  className={`${ruleConfig.bg} ${ruleConfig.text} border ${ruleConfig.border} text-xs font-bold font-mono px-2.5`}
                >
                  {ruleConfig.label}
                </Badge>
              )}
            </div>
          </div>
          <div className="p-3 sm:p-4 relative">
            {/* Subtle shimmer overlay when loading */}
            {isFetching && (
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            )}
            <p className="text-sm md:text-base text-foreground/85 font-mono leading-relaxed whitespace-pre-wrap break-normal text-justify relative">
              {reportLine}
            </p>
          </div>
        </div>

        {/* TAF */}
        <div className="card-neon overflow-hidden">
          <div className="flex items-center px-3 sm:px-4 py-3 border-b border-border/60 neon-accent">
            <div className="flex items-center gap-2.5">
              <div className={panelAccentBarClass} />
              <span className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                TAF
              </span>
            </div>
          </div>
          <div className="p-3 sm:p-4 relative">
            {isFetching && (
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            )}
            <p className="text-sm md:text-base text-foreground/85 font-mono leading-7 whitespace-pre-wrap break-words relative">
              {tafLine}
            </p>
          </div>
        </div>
      </div>

      {showHistoryPanel && (
        <div className="card-neon p-3 sm:p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold font-mono uppercase tracking-wide text-foreground">
              History :: Last 24h
            </h3>
            <span
              className={`text-xs font-mono uppercase tracking-wider ${
                hasHistoryGaps ? "text-red-300" : "text-emerald-300"
              }`}
            >
              {hasHistoryGaps ? "Gaps Detected" : "No Gaps"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              METAR: {historySummary.metarCount}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              SPECI: {historySummary.speciCount}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              SYNOP: {historySummary.synopCount}
            </Badge>
            <Badge
              variant="outline"
              className={`font-mono text-xs ${
                historySummary.missingCount > 0
                  ? "bg-red-500/20 text-red-200 border-red-500/60"
                  : "text-emerald-300 border-emerald-500/35"
              }`}
            >
              Missing: {historySummary.missingCount}
            </Badge>
            <Badge
              variant="outline"
              className={`font-mono text-xs ${
                historySummary.delayedCount > 0
                  ? "bg-red-500/20 text-red-200 border-red-500/60"
                  : "text-muted-foreground"
              }`}
            >
              Delayed: {historySummary.delayedCount}
            </Badge>
            <Badge
              variant="outline"
              className={`font-mono text-xs ${
                historySummary.earlyCount > 0
                  ? "text-amber-300 border-amber-500/40"
                  : "text-muted-foreground"
              }`}
            >
              Early: {historySummary.earlyCount}
            </Badge>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-border/60 bg-background/70">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
                  METAR (24h)
                </p>
              </div>
              <div className="max-h-[340px] overflow-auto">
                <table className="w-full text-xs sm:text-sm font-mono">
                  <thead className="sticky top-0 bg-background/95">
                    <tr className="text-center border-b border-border/60">
                      <th className="px-2 py-2">UTC Time</th>
                      <th className="px-2 py-2">Message</th>
                      <th className="px-2 py-2">Transmission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isFetchingMetarHistory && (
                      <tr>
                        <td colSpan={3} className="px-2 py-3 text-muted-foreground">
                          Loading METAR history...
                        </td>
                      </tr>
                    )}
                    {metarHistoryError && !isFetchingMetarHistory && (
                      <tr>
                        <td colSpan={3} className="px-2 py-3 text-red-300">
                          {metarHistoryError instanceof Error
                            ? metarHistoryError.message
                            : "Failed to load METAR history."}
                        </td>
                      </tr>
                    )}
                    {!isFetchingMetarHistory &&
                      !metarHistoryError &&
                      metarHourlyRows.map((row, idx) => (
                        <tr key={`metar-${idx}`} className="border-b border-border/40 align-top">
                          <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                            {row.hour}
                          </td>
                          <td className={`px-2 py-2 break-words text-justify ${row.typeClass}`}>
                            {row.message}
                          </td>
                          <td
                            className={`px-2 py-2 font-bold whitespace-nowrap text-center ${row.transmissionClass}`}
                          >
                            <div>{row.transmissionLabel}</div>
                            <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                              {row.transmissionTime}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-border/60 bg-background/70">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                  SYNOP (24h)
                </p>
              </div>
              <div className="max-h-[340px] overflow-auto">
                <table className="w-full text-xs sm:text-sm font-mono">
                  <thead className="sticky top-0 bg-background/95">
                    <tr className="text-center border-b border-border/60">
                      <th className="px-2 py-2">UTC Time</th>
                      <th className="px-2 py-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isFetchingSynopHistory && (
                      <tr>
                        <td colSpan={2} className="px-2 py-3 text-muted-foreground">
                          Loading SYNOP history...
                        </td>
                      </tr>
                    )}
                    {synopHistoryError && !isFetchingSynopHistory && (
                      <tr>
                        <td colSpan={2} className="px-2 py-3 text-red-300">
                          {synopHistoryError instanceof Error
                            ? synopHistoryError.message
                            : "Failed to load SYNOP history."}
                        </td>
                      </tr>
                    )}
                    {!isFetchingSynopHistory &&
                      !synopHistoryError &&
                      synopHourlyRows.map((row, idx) => (
                        <tr key={`synop-${idx}`} className="border-b border-border/40 align-top">
                          <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                            {row.hour}
                          </td>
                          <td
                            className={`px-2 py-2 break-words whitespace-pre-wrap text-justify ${row.className}`}
                          >
                            {row.message}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Warning / Status Area ── */}
      <div className="relative min-h-[200px]">
        {/* Loading overlay */}
        {(isLoading || isFetching) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 rounded-lg">
            <div className="flex flex-col items-center gap-4">
              {/* Radar-style spinner */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border border-primary/20" />
                <div className="absolute inset-2 rounded-full border border-primary/10" />
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div
                    className="w-full h-full animate-radar"
                    style={{
                      background: "conic-gradient(from 0deg, transparent 0deg, hsl(190 95% 55% / 0.2) 90deg, transparent 90deg)",
                    }}
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
              </div>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">
                Scanning REDEMET...
              </span>
            </div>
          </div>
        )}

        {error ? (
          /* Error state */
          <div className="card-neon border-red-500/20 p-4 sm:p-5 flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground font-mono">
                CONNECTION FAILED
              </p>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                {error instanceof Error ? error.message : "Erro inesperado"}
              </p>
            </div>
          </div>
        ) : list.length === 0 ? (
          /* Clear state - no warnings */
          <div className="card-neon border-emerald-500/15 bg-emerald-500/[0.02] p-6 sm:p-8 lg:p-12 flex flex-col items-center justify-center gap-5 text-center">
            <div className="relative animate-float">
              <div className="w-16 h-16 rounded-full bg-emerald-500/8 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              {/* Pulsing ring */}
              <div className="absolute -inset-2 rounded-full border border-emerald-500/10 animate-ping opacity-30" />
              {/* Outer glow */}
              <div
                className="absolute -inset-4 rounded-full opacity-40 pointer-events-none"
                style={{
                  background: "radial-gradient(circle, hsl(160 85% 45% / 0.08), transparent 70%)",
                }}
              />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground font-mono uppercase tracking-wide">
                No Active Warnings
              </h3>
            </div>
          </div>
        ) : (
          /* Active warnings */
          <div className="space-y-3">
            {list.map((aviso, idx) => (
              <div
                key={`${idx}`}
                className="card-neon border-red-500/20 overflow-hidden shadow-[0_0_30px_hsl(0_72%_55%/0.06)]"
              >
                {/* Animated red accent bar */}
                <div className="h-0.5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/40 via-red-400 to-red-500/40" />
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    style={{
                      animation: "shimmer 2s linear infinite",
                      backgroundSize: "200% 100%",
                    }}
                  />
                </div>

                <div className="p-4 sm:p-5 flex flex-col lg:flex-row gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20 animate-pulse-glow">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                  </div>
                  <div className="flex-grow space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-foreground uppercase tracking-wide font-mono">
                        AD WRNG Active
                      </h3>
                      <Badge className="bg-red-500/15 text-red-400 border border-red-500/20 text-xs font-bold font-mono uppercase px-2.5">
                        ACTIVE
                      </Badge>
                    </div>
                    <div className="bg-background/60 rounded-md p-3 sm:p-4 border-l-2 border-red-500/30 font-mono text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                      {aviso.mensagem}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-5 border-t border-border/40">
        <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-[0.15em]">
          {"Data Source :: REDEMET / AISWEB API"}
        </span>
      </footer>

      {/* ── Alarm Overlay ── */}
      {showAlarmOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl p-4">
          {/* Background pulse effect */}
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background: "radial-gradient(circle at center, hsl(0 72% 55% / 0.15), transparent 60%)",
              animation: "pulse-glow 1.5s ease-in-out infinite",
            }}
          />

          <div className="relative max-w-sm w-full card-neon border-red-500/25 rounded-xl overflow-hidden shadow-[0_0_60px_hsl(0_72%_55%/0.1)]">
            {/* Animated red top bar */}
            <div className="h-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-red-400 to-red-500" />
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                style={{
                  animation: "shimmer 1.5s linear infinite",
                  backgroundSize: "200% 100%",
                }}
              />
            </div>

            <div className="p-8 flex flex-col items-center gap-6 text-center">
              <div className="relative">
                <div className="w-18 h-18 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 p-4">
                  <BellRing className="w-8 h-8 text-red-400 animate-bounce" />
                </div>
                <div className="absolute -inset-3 rounded-full border border-red-500/10 animate-ping opacity-20" />
              </div>

              <div>
                <h2 className="text-xl font-black text-foreground uppercase tracking-tight font-mono">
                  Pilot Alert
                </h2>
                <p className="text-base text-muted-foreground mt-2 leading-relaxed">
                  New Aerodrome Warning for{" "}
                  <span className="font-mono text-primary font-bold">
                    {icao}
                  </span>
                </p>
              </div>

              {audioBlocked && (
                <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-lg w-full">
                  <p className="text-amber-400 font-bold font-mono uppercase text-xs">
                    Audio Blocked
                  </p>
                  <p className="text-xs text-amber-400/60 mt-0.5">
                    Clique na tela para habilitar o som
                  </p>
                </div>
              )}

              <div className="w-full flex flex-col gap-3">
                <Button
                  onClick={stopAlarm}
                  className="w-full py-5 bg-foreground text-background hover:bg-foreground/90 font-bold text-base rounded-lg uppercase tracking-wider font-mono"
                >
                  Silence
                </Button>
                <Button
                  onClick={handleAcknowledgeSilenceEmail}
                  className="w-full py-5 bg-foreground text-background hover:bg-foreground/90 font-bold text-base rounded-lg uppercase tracking-wider font-mono"
                >
                  Acknowledge / Silence / E-Mail
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
