import { createContext, useContext, useMemo, useState } from "react";

type IcaoContextValue = {
  icao: string;
  inputIcao: string;
  setInputIcao: (value: string) => void;
  searchIcao: () => boolean;
};

const IcaoContext = createContext<IcaoContextValue | null>(null);

function normalizeIcao(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

function getInitialIcao(): string {
  if (typeof window === "undefined") return "SBMQ";
  const saved = localStorage.getItem("adwrng_icao");
  const normalized = normalizeIcao(String(saved ?? "SBMQ"));
  return /^[A-Z]{4}$/.test(normalized) ? normalized : "SBMQ";
}

export function IcaoProvider({ children }: { children: React.ReactNode }) {
  const [icao, setIcao] = useState(getInitialIcao);
  const [inputIcao, setInputIcao] = useState(icao);

  const searchIcao = () => {
    const normalized = normalizeIcao(inputIcao);
    if (!/^[A-Z]{4}$/.test(normalized)) return false;
    setIcao(normalized);
    setInputIcao(normalized);
    localStorage.setItem("adwrng_icao", normalized);
    return true;
  };

  const value = useMemo(
    () => ({
      icao,
      inputIcao,
      setInputIcao,
      searchIcao,
    }),
    [icao, inputIcao],
  );

  return <IcaoContext.Provider value={value}>{children}</IcaoContext.Provider>;
}

export function useIcao() {
  const context = useContext(IcaoContext);
  if (!context) {
    throw new Error("useIcao must be used within IcaoProvider.");
  }
  return context;
}
