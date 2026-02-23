import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="relative text-center space-y-5">
        {/* Radial glow */}
        <div
          className="absolute -inset-20 pointer-events-none opacity-40"
          style={{
            background: "radial-gradient(circle, hsl(190 95% 55% / 0.06), transparent 60%)",
          }}
        />
        <div className="relative flex justify-center">
          <div className="w-14 h-14 rounded-full bg-primary/8 flex items-center justify-center border border-primary/15">
            <AlertTriangle className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            {"// error"}
          </p>
          <h1 className="text-6xl font-black text-foreground tabular-nums font-mono glow-text mt-1">
            404
          </h1>
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Rota nao encontrada
        </p>
        <a
          href="/"
          className="inline-block text-sm font-mono font-bold text-primary hover:text-primary/80 underline underline-offset-4 transition-colors uppercase tracking-wider"
        >
          Voltar ao Dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
