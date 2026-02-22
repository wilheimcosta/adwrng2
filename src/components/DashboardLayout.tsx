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
        <div className="flex items-center h-11 px-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors" />
        </div>
        <main className="flex-1 overflow-auto">
          <div className="relative">
            {/* Subtle dot grid background */}
            <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
            <div className="relative p-4 md:p-6 lg:p-8">{children}</div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
