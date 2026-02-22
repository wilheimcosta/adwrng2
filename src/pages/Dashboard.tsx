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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIcao } from "@/contexts/icao-context";
import {
  fetchAerodromeStatusDetails,
  mapFlightRuleFromFlag,
} from "@/lib/redemet";

const CHECK_INTERVAL_SECONDS = 30;
const CIRCLE_RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

type DashboardWarning = { mensagem: string };

function formatUtcClock(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function flightRuleConfig(rule: "VFR" | "IFR" | "LIFR") {
  if (rule === "VFR")
    return {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      ring: "ring-emerald-500/20",
      dot: "bg-emerald-400",
      label: "VFR",
    };
  if (rule === "IFR")
    return {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      ring: "ring-amber-500/20",
      dot: "bg-amber-400",
      label: "IFR",
    };
  return {
    bg: "bg-red-500/10",
    text: "text-red-400",
    ring: "ring-red-500/20",
    dot: "bg-red-400",
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

  const reportLine = useMemo(() => {
    const report = statusData?.reportText ?? "";
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
    const normalized = report.replace(/\r/g, "");
    const fullMatch = normalized.match(/TAF[\s\S]*?=/i);
    return fullMatch ? fullMatch[0].trim() : "--";
  }, [statusData?.reportText]);

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
    if (error) return "Indisponivel";
    if (isFetching) return "Atualizando";
    return "Online";
  }, [error, isFetching]);

  const ruleConfig = flightRule ? flightRuleConfig(flightRule) : null;

  /* ───────────────────── Render ───────────────────── */

  return (
    <div className="relative max-w-6xl mx-auto space-y-6">
      {/* ── Top bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center ring-1 ring-border">
              <Plane className="w-5 h-5 text-primary" />
            </div>
            {/* Scan effect line */}
            <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
              <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-scan" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight text-balance">
              Monitor AD WRNG
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Monitoramento em tempo real &middot;{" "}
              <span className="font-mono text-primary font-semibold">
                {icao}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* UTC clock */}
          <div className="flex items-center gap-2 bg-card rounded-md px-3 py-1.5 ring-1 ring-border">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              UTC
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {formatUtcClock(utcNow)}
            </span>
          </div>

          {/* Status pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ring-1 text-xs font-medium ${
              error
                ? "text-red-400 ring-red-500/20 bg-red-500/5"
                : isFetching
                  ? "text-amber-400 ring-amber-400/20 bg-amber-400/5"
                  : "text-emerald-400 ring-emerald-500/20 bg-emerald-500/5"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                error
                  ? "bg-red-400"
                  : isFetching
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-400"
              }`}
            />
            {statusLabel}
          </div>
        </div>
      </div>

      {/* ── Stat row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Flight rule */}
        <div className="bg-card rounded-lg p-4 ring-1 ring-border card-hover">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Regra de Voo
            </span>
          </div>
          {ruleConfig ? (
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${ruleConfig.dot}`}
              />
              <span
                className={`text-xl font-bold font-mono ${ruleConfig.text}`}
              >
                {ruleConfig.label}
              </span>
            </div>
          ) : (
            <span className="text-xl font-bold font-mono text-muted-foreground">
              --
            </span>
          )}
        </div>

        {/* Report type */}
        <div className="bg-card rounded-lg p-4 ring-1 ring-border card-hover">
          <div className="flex items-center gap-2 mb-2">
            <Wind className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Tipo
            </span>
          </div>
          <span className="text-xl font-bold font-mono text-foreground">
            {reportType}
          </span>
        </div>

        {/* Countdown */}
        <div className="bg-card rounded-lg p-4 ring-1 ring-border card-hover">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw
              className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Proxima
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold font-mono text-primary tabular-nums">
              {countdownDisplay}
            </span>
            <div className="relative w-8 h-8">
              <svg
                className="transform -rotate-90 w-8 h-8"
                viewBox="0 0 36 36"
              >
                <circle
                  cx="18"
                  cy="18"
                  r={CIRCLE_RADIUS}
                  stroke="hsl(0 0% 13%)"
                  strokeWidth="2"
                  fill="transparent"
                />
                <circle
                  cx="18"
                  cy="18"
                  r={CIRCLE_RADIUS}
                  stroke="hsl(165 82% 51%)"
                  strokeWidth="2"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Audio toggle */}
        <button
          onClick={() => {
            const next = !audioEnabled;
            setAudioEnabled(next);
            if (next) playBeep(0.1, 880);
            else stopAlarm();
          }}
          className={`bg-card rounded-lg p-4 ring-1 card-hover text-left transition-all ${
            audioEnabled
              ? "ring-primary/20 bg-primary/[0.03]"
              : "ring-border"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {audioEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-primary" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Audio
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${audioEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
            />
            <span
              className={`text-sm font-semibold ${audioEnabled ? "text-primary" : "text-muted-foreground"}`}
            >
              {audioEnabled ? "Ativo" : "Mudo"}
            </span>
          </div>
        </button>
      </div>

      {/* ── METAR / TAF ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* METAR */}
        <div className="bg-card rounded-lg ring-1 ring-border overflow-hidden card-hover">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                METAR / SPECI
              </span>
            </div>
            {ruleConfig && (
              <Badge
                variant="outline"
                className={`${ruleConfig.bg} ${ruleConfig.text} ring-1 ${ruleConfig.ring} border-0 text-[10px] font-bold px-2`}
              >
                {ruleConfig.label}
              </Badge>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs text-foreground/80 font-mono leading-relaxed break-all">
              {reportLine}
            </p>
          </div>
        </div>

        {/* TAF */}
        <div className="bg-card rounded-lg ring-1 ring-border overflow-hidden card-hover">
          <div className="flex items-center px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-amber-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                TAF
              </span>
            </div>
          </div>
          <div className="p-4">
            <p className="text-xs text-foreground/80 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {tafLine}
            </p>
          </div>
        </div>
      </div>

      {/* ── Warnings area ── */}
      <div className="relative min-h-[180px]">
        {/* Loading overlay */}
        {(isLoading || isFetching) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm z-10 rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Consultando API...
              </span>
            </div>
          </div>
        )}

        {error ? (
          /* Error state */
          <div className="bg-red-500/5 rounded-lg ring-1 ring-red-500/20 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 ring-1 ring-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Falha na consulta
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : "Erro inesperado"}
              </p>
            </div>
          </div>
        ) : list.length === 0 ? (
          /* Clear state */
          <div className="rounded-lg ring-1 ring-emerald-500/15 bg-emerald-500/[0.03] p-8 lg:p-10 flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative animate-float">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="absolute inset-0 w-14 h-14 rounded-full bg-emerald-500/5 animate-ping" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Nenhum Aviso Vigente
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
                O aerodromo{" "}
                <span className="font-mono text-primary font-semibold">
                  {icao}
                </span>{" "}
                esta operando normalmente sem avisos reportados.
              </p>
            </div>
          </div>
        ) : (
          /* Active warnings */
          <div className="space-y-3">
            {list.map((aviso, idx) => (
              <div
                key={`${idx}`}
                className="rounded-lg ring-1 ring-red-500/20 bg-red-500/[0.03] overflow-hidden"
              >
                {/* Red accent top bar */}
                <div className="h-0.5 bg-gradient-to-r from-red-500/60 via-red-400/80 to-red-500/60" />

                <div className="p-5 flex flex-col md:flex-row gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center ring-1 ring-red-500/20 animate-pulse-glow">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                  </div>
                  <div className="flex-grow space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                        AD WRNG Ativo
                      </h3>
                      <Badge className="bg-red-500/15 text-red-400 ring-1 ring-red-500/20 border-0 text-[10px] font-bold uppercase">
                        Vigente
                      </Badge>
                    </div>
                    <div className="bg-background/60 rounded-md p-4 border-l-2 border-red-500/40 font-mono text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
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
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-border text-[10px] text-muted-foreground uppercase tracking-wider">
        <span>Tecnologia Antigravity</span>
        <span>Dados: REDEMET API</span>
      </footer>

      {/* ── Alarm overlay ── */}
      {showAlarmOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-lg p-4">
          <div className="max-w-sm w-full bg-card ring-1 ring-red-500/30 rounded-xl overflow-hidden shadow-2xl">
            {/* Red accent bar */}
            <div className="h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-500" />

            <div className="p-8 flex flex-col items-center gap-6 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center ring-1 ring-red-500/20">
                  <BellRing className="w-8 h-8 text-red-400 animate-bounce" />
                </div>
                <div className="absolute inset-0 w-16 h-16 rounded-full bg-red-500/5 animate-ping" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-foreground uppercase tracking-tight">
                  Atencao Piloto
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Novo aviso meteorologico detectado para{" "}
                  <span className="font-mono text-primary font-semibold">
                    {icao}
                  </span>
                  .
                </p>
              </div>

              {audioBlocked && (
                <div className="bg-amber-500/5 ring-1 ring-amber-500/20 p-3 rounded-lg w-full">
                  <p className="text-amber-400 font-semibold uppercase text-xs">
                    Audio bloqueado pelo navegador
                  </p>
                  <p className="text-amber-400/60 text-[11px] mt-0.5">
                    Clique na tela para habilitar o som
                  </p>
                </div>
              )}

              <Button
                onClick={stopAlarm}
                className="w-full py-5 bg-foreground text-background hover:bg-foreground/90 font-semibold text-sm rounded-lg uppercase tracking-wide"
              >
                Reconhecer e Silenciar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
