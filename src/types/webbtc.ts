export type BitcoinNetworkType = "bitcoin" | "regtest" | "testnet";

export type BitcoinAddress = {
  address: string;
  derivationPath: string;
  index: number;
  publicKey: string;
};

// TODO: this should be moved somewhere else
declare global {
  interface Window {
    webbtc?: {
      enable(): Promise<void>;
      getAddress(): Promise<BitcoinAddress>;
      signPsbt(psbt: string): Promise<{ signed: string }>;
      on(event: "accountChanged", callback: () => void): void;
    };
  }
}
