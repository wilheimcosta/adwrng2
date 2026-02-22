import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BellRing, CheckCircle2, Clock, Plane, Volume2, VolumeX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useIcao } from "@/contexts/icao-context";
import { fetchAerodromeStatusDetails, mapFlightRuleFromFlag } from "@/lib/redemet";

const CHECK_INTERVAL_SECONDS = 30;
const CIRCLE_RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

type DashboardWarning = { mensagem: string };

function formatUtcClock(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function flightRuleBadgeClass(rule: "VFR" | "IFR" | "LIFR") {
  if (rule === "VFR") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (rule === "IFR") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

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
    ? [{ mensagem: statusData.warningText ?? statusData.reportText ?? "Aviso de aeródromo ativo." }]
    : [];
  const countdownDisplay = `${Math.floor(nextCheck / 60)
    .toString()
    .padStart(2, "0")}:${(nextCheck % 60).toString().padStart(2, "0")}`;
  const ringOffset = CIRCUMFERENCE - (nextCheck / CHECK_INTERVAL_SECONDS) * CIRCUMFERENCE;
  const reportType = useMemo(() => {
    const report = statusData?.reportText ?? "";
    if (/\bSPECI\b/i.test(report)) return "SPECI";
    if (/\bMETAR\b/i.test(report)) return "METAR";
    return "N/D";
  }, [statusData?.reportText]);
  const reportLine = useMemo(() => {
    const report = statusData?.reportText ?? "";
    const lines = report.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const line = lines.find((item) => /\b(METAR|SPECI)\b/i.test(item)) ?? lines[0] ?? "--";
    return line;
  }, [statusData?.reportText]);
  const tafLine = useMemo(() => {
    const report = statusData?.reportText ?? "";
    const normalized = report.replace(/\r/g, "");
    const fullMatch = normalized.match(/TAF[\s\S]*?=/i);
    return fullMatch ? fullMatch[0].trim() : "--";
  }, [statusData?.reportText]);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      audioCtxRef.current = new AudioContextCtor();
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
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Mantem o monitoramento mesmo sem audio.
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
      window.setTimeout(() => {
        playBeep(0.2, 587);
      }, 300);

      alarmTimeoutRef.current = window.setTimeout(playLoop, 800);
    };

    if (alarmTimeoutRef.current) {
      window.clearTimeout(alarmTimeoutRef.current);
      alarmTimeoutRef.current = null;
    }

    playLoop();
  };

  useEffect(() => {
    const timer = window.setInterval(() => setUtcNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNextCheck((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
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
        void ctx.resume().then(() => setAudioBlocked(false)).catch(() => undefined);
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
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    showAlarmRef.current = showAlarmOverlay;
    if (!showAlarmOverlay && alarmTimeoutRef.current) {
      window.clearTimeout(alarmTimeoutRef.current);
      alarmTimeoutRef.current = null;
    }
  }, [showAlarmOverlay]);

  const statusLabel = useMemo(() => {
    if (error) return "Indisponivel";
    if (isFetching) return "Atualizando";
    return "Online";
  }, [error, isFetching]);

  return (
    <div className="relative max-w-6xl mx-auto space-y-5">
      {/* Header bar */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
            <Plane className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight text-balance">Monitor AD WRNG</h1>
            <p className="text-xs text-muted-foreground">Monitoramento em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>UTC</span>
          </div>
          <div className="font-mono text-sm font-semibold text-foreground tabular-nums bg-muted/50 rounded-md px-3 py-1.5 border border-border">
            {formatUtcClock(utcNow)}
          </div>
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${
            error ? "text-destructive border-destructive/20 bg-destructive/5" :
            isFetching ? "text-amber-400 border-amber-400/20 bg-amber-400/5" :
            "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              error ? "bg-destructive" : isFetching ? "bg-amber-400" : "bg-emerald-400"
            }`} />
            {statusLabel}
          </div>
        </div>
      </header>

      {/* METAR / TAF Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* METAR Card */}
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">METAR / SPECI</span>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono border-border text-muted-foreground">
                {reportType}
              </Badge>
            </div>
            {flightRule && (
              <Badge variant="outline" className={`${flightRuleBadgeClass(flightRule)} text-xs font-bold px-2.5 py-0.5`}>
                {flightRule}
              </Badge>
            )}
          </div>
          <p className="text-xs text-foreground/80 font-mono leading-relaxed break-all">
            {reportLine}
          </p>
        </div>

        {/* TAF Card */}
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">TAF</span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono border-border text-muted-foreground">
              Previsao
            </Badge>
          </div>
          <p className="text-xs text-foreground/80 font-mono leading-relaxed whitespace-pre-wrap break-words">
            {tafLine}
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Countdown */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Proxima checagem</div>
            <div className="text-xl font-bold font-mono text-primary mt-1 tabular-nums">{countdownDisplay}</div>
          </div>
          <div className="relative w-9 h-9">
            <svg className="transform -rotate-90 w-9 h-9" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r={CIRCLE_RADIUS} stroke="hsl(225 15% 16%)" strokeWidth="2.5" fill="transparent" />
              <circle
                cx="16"
                cy="16"
                r={CIRCLE_RADIUS}
                stroke="hsl(185 80% 50%)"
                strokeWidth="2.5"
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
          </div>
        </div>

        {/* Audio toggle */}
        <button
          onClick={() => {
            const next = !audioEnabled;
            setAudioEnabled(next);
            if (next) {
              playBeep(0.1, 880);
            } else {
              stopAlarm();
            }
          }}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
            audioEnabled
              ? "bg-primary/5 border-primary/20 text-foreground"
              : "bg-card/60 border-border text-muted-foreground hover:bg-muted/30"
          }`}
        >
          <div className="text-left">
            <div className="text-[11px] font-medium uppercase tracking-wider">
              {audioEnabled ? "Audio ativo" : "Audio mudo"}
            </div>
            <div className="text-sm font-semibold mt-1">
              {audioEnabled ? "Monitorando" : "Clique para ativar"}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${audioEnabled ? "bg-emerald-400" : "bg-red-400"}`} />
            {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </div>
        </button>
      </div>

      {/* Warnings area */}
      <div className="relative min-h-[200px]">
        {(isLoading || isFetching) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10 rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-[11px] text-muted-foreground uppercase tracking-widest">Consultando API...</div>
            </div>
          </div>
        )}

        {error ? (
          <Card className="border-destructive/20 bg-destructive/5 rounded-lg">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Falha na consulta</p>
                <p className="text-xs text-muted-foreground mt-0.5">{error instanceof Error ? error.message : "Erro inesperado"}</p>
              </div>
            </CardContent>
          </Card>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-emerald-500/20 bg-emerald-500/5 p-10 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Nenhum Aviso Vigente</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                O aerodromo <span className="font-mono text-primary font-semibold">{icao}</span> esta operando normalmente sem avisos reportados na API REDEMET.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((aviso, idx) => (
              <div
                key={`${idx}`}
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-5 relative overflow-hidden"
              >
                <div className="flex flex-col md:flex-row gap-5">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center border border-destructive/20">
                      <AlertCircle className="w-6 h-6 text-destructive" />
                    </div>
                  </div>
                  <div className="flex-grow space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Alerta de Aviso de Aerodromo</h3>
                      <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold uppercase animate-pulse">
                        Vigente
                      </Badge>
                    </div>
                    <div className="bg-background/50 p-4 rounded-md border-l-2 border-destructive font-mono text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                      {aviso.mensagem}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-border/50 text-[11px] text-muted-foreground">
        <span>Desenvolvido com Tecnologia Antigravity</span>
        <span>Dados Oficiais: REDEMET API</span>
      </footer>

      {/* Alarm overlay */}
      {showAlarmOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md p-4">
          <div className="max-w-md w-full bg-card border border-destructive/30 rounded-xl p-8 text-center shadow-2xl">
            <div className="flex flex-col items-center gap-5">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center animate-bounce border border-destructive/20">
                <BellRing className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground uppercase tracking-tight">Atencao Piloto</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Novo aviso meteorologico detectado para <span className="font-mono text-primary font-semibold">{icao}</span>.
                </p>
              </div>

              {audioBlocked && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg w-full">
                  <p className="text-amber-400 font-semibold uppercase text-xs">Audio bloqueado pelo navegador</p>
                  <p className="text-amber-400/60 text-[11px] mt-0.5">Clique na tela para habilitar o som</p>
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
