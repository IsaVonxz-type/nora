import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ToastProvider } from "./components/ui/Toast";
import "./styles/global.css";
import { initializeMetadata } from "./organizations/initializeMetadata";
import { UNKNOWN_ORGANIZATION } from "./organizations/organizations";
import { OrganizationHostBootstrap } from "./organizations/OrganizationHostBootstrap";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
initializeMetadata(document, window.location.pathname, UNKNOWN_ORGANIZATION);

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <OrganizationHostBootstrap />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
