import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AudioProvider } from "@/contexts/audio-context";
import { IcaoProvider } from "@/contexts/icao-context";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <IcaoProvider>
        <AudioProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AudioProvider>
      </IcaoProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
