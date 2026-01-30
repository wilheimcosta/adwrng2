import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin, Bell, Database, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { registerAerodromeWarningsForIcao } from "@/lib/alerting";

const DEFAULTS = {
  check_interval: 300,
  audio_enabled: true,
  overlay_enabled: true,
  overlay_duration: 5,
  notifications_enabled: true,
  sound_theme: "default",
  quiet_hours_start: null as string | null,
  quiet_hours_end: null as string | null,
};

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settingsRow } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [newIcao, setNewIcao] = useState("");
  const [newName, setNewName] = useState("");

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [checkInterval, setCheckInterval] = useState(300);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Hidrata UI a partir do banco (1a linha)
  useEffect(() => {
    if (!settingsRow) return;
    if (typeof settingsRow.audio_enabled === "boolean") setAudioEnabled(settingsRow.audio_enabled);
    if (typeof settingsRow.check_interval === "number") setCheckInterval(settingsRow.check_interval);
  }, [settingsRow?.id]);

  const normalizedCheckInterval = useMemo(() => {
    const v = Number(checkInterval);
    if (!Number.isFinite(v)) return DEFAULTS.check_interval;
    return Math.min(3600, Math.max(60, Math.trunc(v)));
  }, [checkInterval]);

  const playAlarm = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.value = 0.05;

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close?.();
      }, 600);
    } catch {
      // sem áudio (ex.: bloqueado pelo navegador)
    }
  };

  const icaoSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{4}$/, "ICAO inválido (ex.: SBSP)");

  const persistPreferences = async () => {
    if (isSavingPrefs) return;
    setIsSavingPrefs(true);

    const payload = {
      ...DEFAULTS,
      audio_enabled: audioEnabled,
      check_interval: normalizedCheckInterval,
    };

    // Atualiza a 1a linha (se existir) ou cria
    const existingId = settingsRow?.id;
    const { error } = existingId
      ? await supabase.from("settings").update(payload).eq("id", existingId)
      : await supabase.from("settings").insert(payload);

    setIsSavingPrefs(false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    toast({ title: "Preferências salvas", description: `Intervalo: ${normalizedCheckInterval}s` });
  };

  const handleAddFavorite = async () => {
    if (isAdding) return;

    const parsedIcao = icaoSchema.safeParse(newIcao);
    if (!parsedIcao.success || !newName.trim()) {
      toast({
        title: "Erro",
        description: !newName.trim() ? "Preencha o Nome" : parsedIcao.error.issues[0]?.message,
        variant: "destructive",
      });
      return;
    }

    const icao = parsedIcao.data;

    setIsAdding(true);
    const { error } = await supabase.from("favorites").insert({
      icao,
      name: newName.trim(),
      enabled: true,
    });

    if (error) {
      setIsAdding(false);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // Atualiza contadores/listas de localidades imediatamente (sem esperar a consulta externa)
    await queryClient.invalidateQueries({ queryKey: ["favorites"] });

    // Verifica imediatamente se há Aviso de Aeródromo.
    let reg;
    try {
      reg = await registerAerodromeWarningsForIcao(icao);
    } catch (e) {
      setIsAdding(false);
      console.error("[add-favorite] registerAerodromeWarningsForIcao crash", e);
      toast({
        title: "Erro",
        description: "Falha ao checar avisos (veja console).",
        variant: "destructive",
      });
      return;
    }

    // Atualiza painéis/histórico sempre que rodamos a checagem
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recent-alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["alerts-history"] }),
    ]);

    if (reg.ok === false) {
      toast({
        title: "Favorito adicionado",
        description: `Não foi possível checar avisos agora: ${reg.error}`,
      });
    } else if (reg.inserted > 0) {
      if (audioEnabled) playAlarm();
      toast({
        title: "Aviso de Aeródromo detectado",
        description: reg.sampleMessage ? `Novo aviso para ${icao}: ${reg.sampleMessage}` : `Novo aviso registrado para ${icao} (alarme emitido).`,
      });
    } else {
      // Sem aviso novo: ou não há aviso, ou já estava em vigor (não alarmar de novo).
      toast({
        title: "Favorito adicionado",
        description:
          reg.alreadyActive > 0
            ? reg.sampleMessage
              ? `Aviso já em vigor para ${icao} (sem alarme): ${reg.sampleMessage}`
              : `Aviso já em vigor para ${icao} (sem alarme).`
            : `Nenhum Aviso de Aeródromo ativo para ${icao}.`,
      });
    }

    setNewIcao("");
    setNewName("");
    setIsAdding(false);
  };

  const handleClearHistory = async () => {
    if (isClearingHistory) return;
    setIsClearingHistory(true);

    const { error } = await supabase.from("alerts_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    setIsClearingHistory(false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recent-alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["alerts-history"] }),
    ]);

    toast({
      title: "Histórico limpo",
      description: "Todos os avisos registrados foram removidos.",
    });
  };

  const handleResetDefaults = async () => {
    if (isResetting) return;

    // UI imediata
    setAudioEnabled(DEFAULTS.audio_enabled);
    setCheckInterval(DEFAULTS.check_interval);

    setIsResetting(true);

    // Limpa localidades monitoradas
    const { error: favErr } = await supabase.from("favorites").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    if (favErr) {
      setIsResetting(false);
      toast({ title: "Erro", description: favErr.message, variant: "destructive" });
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["favorites"] });

    // Persistência das preferências
    const existingId = settingsRow?.id;
    const { error: prefErr } = existingId
      ? await supabase.from("settings").update(DEFAULTS).eq("id", existingId)
      : await supabase.from("settings").insert(DEFAULTS);

    setIsResetting(false);

    if (prefErr) {
      toast({ title: "Erro", description: prefErr.message, variant: "destructive" });
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["settings"] });

    toast({
      title: "Padrões restaurados",
      description: "As preferências e localidades foram resetadas para os valores padrão.",
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Favorites */}
      <Card className="glass-panel neon-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Localidades Favoritas
          </CardTitle>
          <CardDescription>Adicione aeródromos para monitoramento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="icao">ICAO</Label>
              <Input
                id="icao"
                placeholder="SBSP"
                maxLength={4}
                value={newIcao}
                onChange={(e) => setNewIcao(e.target.value.toUpperCase())}
                className="glass-panel"
              />
            </div>
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="São Paulo/Congonhas"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="glass-panel"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddFavorite} className="w-full hover-glow" disabled={isAdding}>
                {isAdding ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monitoring Settings */}
      <Card className="glass-panel neon-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" />
              Preferências de Monitoramento
            </CardTitle>
            <Button variant="outline" size="sm" className="hover-glow" onClick={persistPreferences} disabled={isSavingPrefs}>
              <Save className="w-4 h-4 mr-2" />
              {isSavingPrefs ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="audio">Alertas Sonoros</Label>
                <p className="text-sm text-muted-foreground">Reproduzir som quando novos avisos forem detectados</p>
              </div>
              <Switch id="audio" checked={audioEnabled} onCheckedChange={setAudioEnabled} />
            </div>

            <div>
              <Label htmlFor="interval">Intervalo de Checagem (segundos)</Label>
              <Input
                id="interval"
                type="number"
                min={60}
                max={3600}
                value={checkInterval}
                onChange={(e) => setCheckInterval(e.target.value === "" ? 0 : parseInt(e.target.value, 10))}
                className="glass-panel"
              />
              <p className="text-xs text-muted-foreground mt-1">Mínimo: 60s | Máximo: 3600s</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="glass-panel neon-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-secondary" />
            Gerenciamento de Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full hover-glow" onClick={handleClearHistory} disabled={isClearingHistory}>
            {isClearingHistory ? "Limpando..." : "Limpar Histórico"}
          </Button>
          <Button variant="outline" className="w-full hover-glow" disabled>
            Exportar Configurações
          </Button>
          <Button variant="destructive" className="w-full" onClick={handleResetDefaults} disabled={isResetting}>
            {isResetting ? "Resetando..." : "Resetar para Padrões"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
