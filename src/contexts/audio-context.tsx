/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type AudioContextValue = {
  audioEnabled: boolean;
  setAudioEnabled: (value: boolean) => void;
  toggleAudio: () => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [audioEnabled, setAudioEnabled] = useState(true);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({ audioEnabled, setAudioEnabled, toggleAudio }),
    [audioEnabled, toggleAudio],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within AudioProvider.");
  }
  return context;
}