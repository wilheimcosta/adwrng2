import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
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
  mapFlightRuleFromFlag,
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

/* ───────────────────── Component ───────────────────── */

export default function Dashboard() {
  const { icao } = useIcao();
  const [utcNow, setUtcNow] = useState(() => new Date());
  const [nextCheck, setNextCheck] = useState(CHECK_INTERVAL_SECONDS);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showAlarmOverlay, setShowAlarmOverlay] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

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

  /* ───────────────────── Render ───────────────────── */

  return (
    <div className="relative w-full space-y-5 font-sans text-[15px] md:text-base">
      {/* ── Header Section ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            <h1 className="text-lg md:text-xl font-extrabold text-foreground tracking-tight text-balance">
              AD WRNG Monitor
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {"// "}
              <span className="text-primary font-semibold">{icao}</span>
              {" :: Real-Time Monitoring"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* UTC clock */}
          <div className="flex items-center gap-2 bg-card rounded-lg px-3.5 py-2 border border-border/60">
            <Clock className="w-3.5 h-3.5 text-primary/60" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold tabular-nums glow-text">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Flight Rule */}
        <div className={`card-neon p-4 ${ruleConfig ? ruleConfig.glow : ""}`}>
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
              <span className={`text-[1.7rem] font-black font-mono ${ruleConfig.text}`}>
                {ruleConfig.label}
              </span>
            </div>
          ) : (
            <span className="text-[1.7rem] font-black font-mono text-muted-foreground/40">
              --
            </span>
          )}
        </div>

        {/* Report Type */}
        <div className="card-neon p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wind className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Report
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary/50" />
            <span className="text-[1.7rem] font-black font-mono text-foreground">
              {reportType}
            </span>
          </div>
        </div>

        {/* Countdown */}
        <div className="card-neon p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw
              className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Next Scan
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[1.7rem] font-black font-mono tabular-nums glow-text">
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
          className={`card-neon p-4 text-left transition-all ${
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
                    ? "left-4.5 bg-primary shadow-[0_0_8px_hsl(190_95%_55%/0.5)]"
                    : "left-0.5 bg-muted-foreground/40"
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* METAR */}
        <div className="card-neon overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 neon-accent">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 rounded-full bg-primary shadow-[0_0_8px_hsl(190_95%_55%/0.3)]" />
              <span className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                {metarPanelTitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
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
          <div className="p-4 relative">
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
          <div className="flex items-center px-4 py-3 border-b border-border/60 neon-accent">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 rounded-full bg-amber-400 shadow-[0_0_8px_hsl(38_92%_50%/0.3)]" />
              <span className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">
                TAF
              </span>
            </div>
          </div>
          <div className="p-4 relative">
            {isFetching && (
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            )}
            <p className="text-sm md:text-base text-foreground/85 font-mono leading-7 whitespace-pre-wrap break-words relative">
              {tafLine}
            </p>
          </div>
        </div>
      </div>

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
          <div className="card-neon border-red-500/20 p-5 flex items-start gap-4">
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
          <div className="card-neon border-emerald-500/15 bg-emerald-500/[0.02] p-8 lg:p-12 flex flex-col items-center justify-center gap-5 text-center">
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

                <div className="p-5 flex flex-col md:flex-row gap-4">
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
                    <div className="bg-background/60 rounded-md p-4 border-l-2 border-red-500/30 font-mono text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                      {aviso.mensagem}
                    </div>
                    {warningIcaos.length > 0 && (
                      <div className="bg-background/60 rounded-md p-4 border-l-2 border-primary/30">
                        <p className="text-xs font-bold font-mono uppercase tracking-wider text-primary mb-2">
                          Aerodromes In Warning
                        </p>
                        {isFetchingAisweb && (
                          <p className="text-sm text-muted-foreground font-mono">
                            Loading AISWEB data...
                          </p>
                        )}
                        {aiswebError && (
                          <p className="text-sm text-red-300 font-mono">
                            {aiswebError instanceof Error ? aiswebError.message : "Failed to load AISWEB data."}
                          </p>
                        )}
                        {!isFetchingAisweb && !aiswebError && (
                          <div className="space-y-1">
                            {(aiswebData ?? []).map((ad) => (
                              <p key={ad.code} className="text-sm text-foreground/90 font-mono">
                                {ad.code}: {ad.name} - {ad.city}/{ad.uf}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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

              <Button
                onClick={stopAlarm}
                className="w-full py-5 bg-foreground text-background hover:bg-foreground/90 font-bold text-base rounded-lg uppercase tracking-wider font-mono"
              >
                Acknowledge & Silence
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
