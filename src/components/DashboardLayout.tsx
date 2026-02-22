import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <div className="mb-3">
            <SidebarTrigger className="h-8 w-8 border border-primary/30 bg-card/50 hover:bg-primary/15" />
          </div>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
