import { fetchGeckoTerminalVolume } from "../services/tradingVolumeEngine/providers/geckoTerminal";

const result = await fetchGeckoTerminalVolume({
  address: "0x73ac2806c40ab4741ea7a35b7328aca957755ba3",
  chain: "base",
});

console.log("GeckoTerminal result:", result);
