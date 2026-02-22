import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BellRing, CheckCircle2, Radar, Radio, Volume2, VolumeX } from "lucide-react";
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
  if (rule === "VFR") return "bg-emerald-500/20 text-emerald-300 border-emerald-400/60";
  if (rule === "IFR") return "bg-yellow-400/25 text-yellow-200 border-yellow-300/70";
  return "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/60";
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
    const lines = report.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.find((item) => /\bTAF\b/i.test(item)) ?? "--";
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
    if (error) return "Indisponível";
    if (isFetching) return "Atualizando";
    return "Online";
  }, [error, isFetching]);

  return (
    <div className="relative">
      <section className="w-full mb-4 glass-panel border border-primary/25 rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center neon-border">
              <Radio className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-2xl font-bold glow-text leading-none">AeroWatch</p>
              <p className="text-sm text-muted-foreground">Aviation Alerts</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sistema Online</span>
          </div>
        </div>
      </section>

      <main className="w-full glass-panel rounded-3xl p-8 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-6 mb-10 border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl rounded-tl-none border border-primary/20">
              <Radar className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                MONITOR AD WRNG
              </h1>
              <div className="flex items-center gap-2 text-sm text-gray-300 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20">Localidade • {icao}</span>
                <Badge variant="outline" className={error ? "bg-destructive/20 text-destructive border-destructive/50" : "bg-accent/20 text-accent border-accent/50"}>
                  API {statusLabel}
                </Badge>
              </div>
              <div className="mt-3 space-y-3 max-w-2xl">
                <div className="glass-panel rounded-xl p-3 border border-primary/30 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wider">METAR / SPECI</div>
                    <div className="mt-1 text-xl font-bold text-white font-mono">{reportType}</div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{reportLine}</div>
                  </div>
                  {flightRule && (
                    <Badge variant="outline" className={`${flightRuleBadgeClass(flightRule)} animate-pulse px-4 py-1.5 text-sm font-bold tracking-wide`}>
                      {flightRule}
                    </Badge>
                  )}
                </div>
                <div className="glass-panel rounded-xl p-3 border border-primary/30">
                  <div className="text-[11px] text-gray-400 uppercase tracking-wider">TAF</div>
                  <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">{tafLine}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="rounded-2xl px-4 py-2 text-4xl md:text-5xl font-light font-mono tracking-tighter bg-white/5 border border-white/15 shadow-[0_0_0_1px_rgba(0,242,255,0.25),0_0_25px_rgba(0,242,255,0.25)]">
              {formatUtcClock(utcNow)}
            </div>
            <div className="text-xs font-bold px-3 py-1 rounded bg-white/5 border border-white/10 uppercase tracking-widest text-gray-400">UTC</div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">Próxima Checagem</div>
              <div className="text-2xl font-bold font-mono text-primary mt-1">{countdownDisplay}</div>
            </div>
            <div className="relative w-8 h-8">
              <svg className="transform -rotate-90 w-8 h-8">
                <circle cx="16" cy="16" r={CIRCLE_RADIUS} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-800" />
                <circle
                  cx="16"
                  cy="16"
                  r={CIRCLE_RADIUS}
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  className="text-primary transition-all duration-1000 ease-linear"
                />
              </svg>
            </div>
          </div>

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
            className={`rounded-xl p-4 flex items-center justify-between transition-all duration-300 border ${
              audioEnabled ? "bg-primary/20 border-primary/50 text-white" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
            }`}
          >
            <div className="text-left">
              <div className="text-xs uppercase tracking-wider">{audioEnabled ? "Audio Ativo" : "Audio Mudo"}</div>
              <div className="text-sm font-semibold mt-1">{audioEnabled ? "Monitorando" : "Clique para ativar"}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${audioEnabled ? "bg-emerald-400" : "bg-red-400"}`} />
              {audioEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </div>
          </button>
        </div>

        <div className="relative min-h-[200px]">
          {(isLoading || isFetching) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10 rounded-xl">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <div className="text-xs text-primary tracking-widest uppercase">Consultando API...</div>
              </div>
            </div>
          )}

          {error ? (
            <Card className="bg-gradient-to-br from-red-900/40 to-black/60 border border-red-500/30 rounded-2xl p-6">
              <CardContent className="p-0 flex items-center gap-4">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <div>
                  <p className="text-lg font-semibold text-red-100">Falha na consulta</p>
                  <p className="text-sm text-red-200/80">{error instanceof Error ? error.message : "Erro inesperado"}</p>
                </div>
              </CardContent>
            </Card>
          ) : list.length === 0 ? (
            <div className="rounded-2xl p-12 text-center border-dashed border-2 border-emerald-500/20 flex flex-col items-center justify-center gap-4 bg-emerald-950/20">
              <div className="p-4 bg-emerald-500/10 rounded-full">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-200">Nenhum Aviso Vigente</h3>
              <p className="text-gray-300 max-w-sm">
                O aerodromo de <b className="text-white">{icao}</b> esta operando normalmente sem avisos de aerodromo reportados na API REDEMET.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {list.map((aviso, idx) => (
                <div
                  key={`${idx}`}
                  className="bg-gradient-to-br from-red-900/40 to-black/60 border border-red-500/30 rounded-2xl p-6 relative overflow-hidden group hover:border-red-500/50 transition-all duration-500"
                >
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/20 blur-3xl rounded-full group-hover:bg-red-500/30 transition-all" />

                  <div className="flex flex-col md:flex-row gap-6 relative z-10">
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 shadow-[0_0_15px_rgba(255,0,0,0.2)]">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                      </div>
                    </div>
                    <div className="flex-grow space-y-4">
                      <div className="flex justify-between items-start gap-3">
                        <h3 className="text-xl md:text-2xl font-bold text-white tracking-wide">ALERTA DE AVISO DE AERODROMO</h3>
                        <div className="px-3 py-1 rounded text-xs font-bold uppercase animate-pulse bg-gradient-to-r from-red-500 to-amber-300 text-black border border-white/20">
                          Vigente
                        </div>
                      </div>
                      <div className="bg-black/40 p-5 rounded-lg border-l-4 border-red-500 font-mono text-sm text-red-100 leading-relaxed whitespace-pre-wrap">
                        {aviso.mensagem}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="mt-8 text-center text-xs text-gray-500 border-t border-white/5 pt-4 flex flex-col md:flex-row gap-2 justify-between">
          <span>Desenvolvido com Tecnologia Antigravity</span>
          <span>Dados Oficiais: REDEMET API</span>
        </footer>
      </main>

      {showAlarmOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="max-w-lg w-full bg-[#1a0505] border-2 border-red-500/80 rounded-3xl p-8 text-center shadow-[0_0_100px_rgba(255,0,0,0.4)] relative overflow-hidden animate-pulse">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                background: "repeating-linear-gradient(45deg, transparent, transparent 10px, #ff0000 10px, #ff0000 20px)",
              }}
            />
            <div className="relative z-10 flex flex-col items-center gap-6">
              <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center animate-bounce shadow-[0_0_30px_rgba(255,0,0,0.6)]">
                <BellRing className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Atencao Piloto</h2>
              <p className="text-red-200 text-lg">Novo aviso meteorologico detectado para <b>{icao}</b>.</p>

              {audioBlocked && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 p-3 rounded-xl animate-pulse">
                  <p className="text-yellow-200 font-bold uppercase text-sm">Audio bloqueado pelo navegador</p>
                  <p className="text-yellow-100/70 text-xs mt-1">Clique na tela para habilitar o som</p>
                </div>
              )}

              <Button onClick={stopAlarm} className="w-full py-6 bg-white text-red-900 hover:bg-gray-200 font-bold text-xl rounded-xl uppercase">
                Reconhecer e Silenciar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
