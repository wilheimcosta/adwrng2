import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlightRuleBadge } from "@/components/FlightRuleBadge";
import { AlertCircle, MapPin, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { registerAerodromeWarningsForIcao } from "@/lib/alerting";
import { expireOutOfWindowActiveAlerts, isAlertInForce } from "@/lib/alerts-validity";

const DEFAULT_INTERVAL_SECONDS = 300;

export default function Dashboard() {
  const queryClient = useQueryClient();

  // Config (persistida)
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("check_interval")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const intervalSeconds = useMemo(() => {
    const v = settings?.check_interval ?? DEFAULT_INTERVAL_SECONDS;
    return typeof v === "number" && Number.isFinite(v) && v >= 60 ? v : DEFAULT_INTERVAL_SECONDS;
  }, [settings?.check_interval]);

  const [nextCheck, setNextCheck] = useState(intervalSeconds);

  // Fetch favorites
  const { data: favorites, isLoading: favoritesLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("*").eq("enabled", true).order("sort_order");

      if (error) throw error;
      return data || [];
    },
  });

  const favoriteIcaos = useMemo(
    () => (favorites ?? []).map((f) => String(f.icao).toUpperCase()).filter(Boolean),
    [favorites]
  );

  const checkingRef = useRef(false);
  const lastAutoCheckKeyRef = useRef<string>("");

  const runCheckNow = useCallback(async () => {
    if (checkingRef.current) return;
    if (favoriteIcaos.length === 0) return;

    checkingRef.current = true;
    try {
      await Promise.all(favoriteIcaos.map((icao) => registerAerodromeWarningsForIcao(icao)));

      // Garante que apenas avisos "em vigor" permaneçam como active
      await expireOutOfWindowActiveAlerts({ icaos: favoriteIcaos });

      // Atualiza todas as fontes do Dashboard que dependem de alerts_history
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recent-alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["active-alert-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["alerts-history"] }),
      ]);
    } finally {
      checkingRef.current = false;
    }
  }, [favoriteIcaos, queryClient]);

  // Ao entrar no Dashboard (ou mudar lista), checa uma vez para não depender do timer
  useEffect(() => {
    const key = favoriteIcaos.join(",");
    if (!key) return;
    if (lastAutoCheckKeyRef.current === key) return;
    lastAutoCheckKeyRef.current = key;
    void runCheckNow();
  }, [favoriteIcaos, runCheckNow]);

  // Fetch active alert counts (somente avisos em vigor) for the monitored ICAOs
  const { data: activeAlertCounts } = useQuery({
    queryKey: ["active-alert-counts", favoriteIcaos.join(",")],
    enabled: favoriteIcaos.length > 0,
    queryFn: async () => {
      // Antes de contar, expira o que estiver fora da validade
      await expireOutOfWindowActiveAlerts({ icaos: favoriteIcaos });

      const { data, error } = await supabase
        .from("alerts_history")
        .select("icao, valid_from, valid_until")
        .eq("status", "active")
        .in("icao", favoriteIcaos);

      if (error) throw error;

      const now = new Date();
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (!isAlertInForce(row as any, now)) continue;
        const key = String((row as any).icao || "").toUpperCase();
        if (!key) continue;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
  });

  // Fetch recent alerts (somente avisos em vigor)
  const { data: recentAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["recent-alerts"],
    queryFn: async () => {
      await expireOutOfWindowActiveAlerts();

      const { data, error } = await supabase
        .from("alerts_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const now = new Date();
      const inForce = (data ?? []).filter((a: any) => a.status === "active" && isAlertInForce(a, now));
      return inForce.slice(0, 10);
    },
  });

  // Countdown timer (reinicia quando o intervalo muda)
  useEffect(() => {
    setNextCheck(intervalSeconds);
  }, [intervalSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNextCheck((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Quando chega a 0, faz a checagem e reinicia o contador
  useEffect(() => {
    if (nextCheck !== 0) return;

    (async () => {
      await runCheckNow();
      setNextCheck(intervalSeconds);
    })();
  }, [nextCheck, runCheckNow, intervalSeconds]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const activeAlerts = useMemo(() => {
    const counts = activeAlertCounts ?? {};
    return Object.values(counts).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [activeAlertCounts]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-panel neon-border hover-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              Avisos Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold glow-text">{activeAlerts}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel neon-border hover-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Localidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {favoritesLoading ? <Skeleton className="h-9 w-16" /> : <p className="text-3xl font-bold glow-text">{favorites?.length || 0}</p>}
          </CardContent>
        </Card>

        <Card className="glass-panel neon-border hover-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              Próxima Checagem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono glow-text">{formatTime(nextCheck)}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel neon-border hover-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-secondary" />
              Status API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="bg-accent/20 text-accent border-accent/50">
              Online
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Monitored Locations */}
      <Card className="glass-panel neon-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Localidades Monitoradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {favoritesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : favorites && favorites.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {favorites.map((fav) => {
                const icao = String(fav.icao).toUpperCase();
                const count = activeAlertCounts?.[icao] ?? 0;

                return (
                  <Card key={fav.id} className="bg-muted/30 border-primary/30 hover-glow">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-primary">{icao}</p>
                          <p className="text-sm text-muted-foreground">{fav.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <FlightRuleBadge icao={icao} />
                          <Badge variant="outline" className="bg-accent/20 text-accent border-accent/50">
                            {count} aviso{count === 1 ? "" : "s"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">Nenhuma localidade favorita configurada</p>
              <p className="text-sm text-muted-foreground mt-1">Adicione localidades nas Configurações</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card className="glass-panel neon-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            Avisos Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : recentAlerts && recentAlerts.length > 0 ? (
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <Card key={alert.id} className="bg-muted/30 border-l-4 border-l-destructive">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-primary/20 text-primary">
                            {alert.icao}
                          </Badge>
                          {alert.severity === "low" ? (
                            <FlightRuleBadge icao={alert.icao} fallbackText="LOW" className="animate-glow-pulse" />
                          ) : (
                            <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"} className="animate-glow-pulse">
                              {alert.severity}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium mb-1">{alert.alert_type}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{alert.content}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {alert.created_at ? new Date(alert.created_at).toLocaleString("pt-BR") : ""}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">Nenhum aviso registrado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
