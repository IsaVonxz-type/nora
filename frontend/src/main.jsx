import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ToastProvider } from "./components/ui/Toast";
import "./styles/global.css";
import { AppRouter } from "./app/AppRouter";
import { isDemoActive } from "./services/demoSession";
import { normalizeSpaPath } from "../../shared/spaRoutes.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const container = document.getElementById("root");
const app = (
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AppRouter />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>
);

const prerenderedLanding = normalizeSpaPath(window.location.pathname) === "/"
  && container.hasChildNodes()
  && !isDemoActive();

if (prerenderedLanding) ReactDOM.hydrateRoot(container, app);
else ReactDOM.createRoot(container).render(app);
