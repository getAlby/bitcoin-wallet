import { BitcoinNetworkType } from "../types/webbtc";

export function getTransactionUrl(txId: string, network: BitcoinNetworkType) {
  return `https://mempool.space/${
    network === "testnet" ? "testnet/" : ""
  }tx/${txId}`;
}
