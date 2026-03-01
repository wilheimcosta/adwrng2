import { AppSidebar } from "@/components/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        {/* Top bar */}
        <div className="flex items-center h-12 px-3 sm:px-4 border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-primary transition-colors" />
          <div className="ml-3 h-4 w-px bg-border" />
          <span className="ml-3 min-w-0 truncate text-[9px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-[0.16em] sm:tracking-[0.2em]">
            Flight Operations Monitor
          </span>
        </div>

        <main className="flex-1 overflow-auto">
          {/* Animated grid background */}
          <div className="relative">
            <div className="absolute inset-0 grid-bg pointer-events-none" />
            {/* Radial fade from center top */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center, hsl(190 95% 55% / 0.04), transparent 70%)",
              }}
            />
            <div className="relative p-3 sm:p-4 md:p-6 lg:p-8">{children}</div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
