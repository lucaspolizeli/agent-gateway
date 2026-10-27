import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { captureAdminToken } from "./api/token.ts";
import { App } from "./App.tsx";
import "./index.css";

captureAdminToken();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true },
  },
});

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root is missing from index.html");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <App />
        {/* Lifted above the sticky save bar that editors pin to the bottom of the viewport. */}
        <Toaster position="bottom-right" offset={{ bottom: 80, right: 16 }} closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
