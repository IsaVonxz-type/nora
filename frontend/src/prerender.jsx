import { prerenderToNodeStream } from "react-dom/static";
import { StaticRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "./components/ui/Toast";
import { AppRouter } from "./app/AppRouter";

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function renderRoute(location) {
  const { prelude } = await prerenderToNodeStream(
    <HelmetProvider>
      <QueryClientProvider client={new QueryClient()}>
        <StaticRouter location={location}>
          <ToastProvider>
            <AppRouter />
          </ToastProvider>
        </StaticRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );
  return readStream(prelude);
}
