import { AddressTxsUtxo } from "@mempool/mempool.js/lib/interfaces/bitcoin/addresses";
import { Tx } from "@mempool/mempool.js/lib/interfaces/bitcoin/transactions";
import React from "react";
import { getTransactionUrl } from "../utils/getTransactionUrl";
import { BitcoinAddress, BitcoinNetworkType } from "../types/webbtc";

type WalletStatsProps = {
  networkType: BitcoinNetworkType;
  balance: number;
  utxos: AddressTxsUtxo[];
  transactions: Tx[];
  address: BitcoinAddress;
};

export function WalletStats({
  networkType,
  balance,
  utxos,
  transactions,
  address,
}: WalletStatsProps) {
  const [viewingUtxos, setViewingUtxos] = React.useState(false);

  const outgoingTransactions = transactions.filter(
    (tx) => tx.vin[0].prevout.scriptpubkey_address === address.address
  );
  const incomingTransactions = transactions.filter(
    (tx) => tx.vin[0].prevout.scriptpubkey_address !== address.address
  );

  const totalSent = outgoingTransactions
    .map(
      (tx) =>
        tx.vout
          .filter((vout) => vout.scriptpubkey_address !== address.address)
          .map((vout) => vout.value)
          .reduce((a, b) => a + b, 0) + tx.fee
    )
    .reduce((a, b) => a + b, 0);

  const totalReceived = incomingTransactions
    .map((tx) =>
      tx.vout
        .filter((vout) => vout.scriptpubkey_address === address.address)
        .map((vout) => vout.value)
        .reduce((a, b) => a + b, 0)
    )
    .reduce((a, b) => a + b, 0);

  return (
    <div className="w-full">
      <div className="stats shadow flex">
        <div className="stat">
          <div className="stat-title">Balance</div>
          <div className="stat-value">{balance} sats</div>
          <div className="stat-desc">
            <a className="link" onClick={() => setViewingUtxos(!viewingUtxos)}>
              {utxos.length} UTXOs
            </a>
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Received</div>
          <div className="stat-value">
            <span className="text-green-500">+</span>
            &nbsp;{totalReceived} sats
          </div>
          <div className="stat-desc">
            {incomingTransactions.length} transactions
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Sent</div>
          <div className="stat-value">
            <span className="text-red-500">-</span>
            &nbsp;{totalSent} sats
          </div>
          <div className="stat-desc">
            {outgoingTransactions.length} transactions
          </div>
        </div>
      </div>
      {viewingUtxos && (
        <div className="flex flex-col flex-1 w-full mt-4 gap-4">
          {utxos
            .sort((a, b) => b.value - a.value)
            .map((utxo) => (
              <div
                key={utxo.txid}
                className="flex justify-between items-start w-full gap-4"
              >
                <a
                  href={getTransactionUrl(utxo.txid, networkType)}
                  className="link"
                >
                  {utxo.txid}
                </a>
                <p className="text-green-500 font-semibold flex-shrink-0">
                  {utxo.value} sats
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
