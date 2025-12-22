import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as StandardWagmiProvider } from "wagmi";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

import { config } from "./lib/wagmi";
import { PRIVY_APP_ID, privyConfig, isPrivyConfigured } from "./lib/privy";
import { Layout } from "./components/Layout";
import { FHEProvider } from "./lib/fhe";

const queryClient = new QueryClient();

// Component that uses Privy's wagmi provider
function PrivyEnabledApp() {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={config} reconnectOnMount={false}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: "#a855f7",
              accentColorForeground: "white",
              borderRadius: "large",
              fontStack: "system",
              overlayBlur: "small",
            })}
          >
            <FHEProvider>
              <Layout />
            </FHEProvider>
          </RainbowKitProvider>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

// Fallback component when Privy is not configured (uses standard wagmi)
function RainbowKitOnlyApp() {
  return (
    <StandardWagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#a855f7",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          <FHEProvider>
            <Layout />
          </FHEProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </StandardWagmiProvider>
  );
}

function App() {
  // If Privy is not configured, fall back to RainbowKit-only mode
  if (!isPrivyConfigured) {
    return <RainbowKitOnlyApp />;
  }

  return <PrivyEnabledApp />;
}

export default App;
