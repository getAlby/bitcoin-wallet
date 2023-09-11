import { Tx } from "@mempool/mempool.js/lib/interfaces/bitcoin/transactions";
import { BitcoinAddress, BitcoinNetworkType } from "../types/webbtc";
import { formatDistance } from "date-fns";
import { getTransactionUrl } from "../utils/getTransactionUrl";

type TransactionsTabProps = {
  address: BitcoinAddress;
  transactions: Tx[];
  networkType: BitcoinNetworkType;
};

export function TransactionsTab({
  networkType,
  address,
  transactions,
}: TransactionsTabProps) {
  return (
    <>
      <table className="table">
        <tbody>
          {transactions.map((tx) => {
            const isOutgoing =
              tx.vin[0].prevout.scriptpubkey_address === address.address;
            return (
              <tr key={tx.txid}>
                <td className="text-xs">
                  {tx.status.confirmed
                    ? formatDistance(
                        new Date(tx.status.block_time * 1000),
                        new Date(),
                        {
                          addSuffix: true,
                        }
                      )
                    : "unconfirmed"}{" "}
                </td>
                <td>
                  <a
                    className="link break-all"
                    href={getTransactionUrl(tx.txid, networkType)}
                    target="_blank"
                  >
                    {tx.txid.substring(0, 8)}...
                    {tx.txid.substring(tx.txid.length - 8)}
                  </a>
                </td>
                <td className="font-bold flex justify-center items-center gap-1">
                  <p
                    className={`${
                      isOutgoing ? "text-red-500" : "text-green-500"
                    }`}
                  >
                    {isOutgoing ? "-" : "+"}
                  </p>
                  <p>
                    {tx.vout
                      .filter((vout) =>
                        isOutgoing
                          ? vout.scriptpubkey_address !== address.address
                          : vout.scriptpubkey_address === address.address
                      )
                      .map((vout) => vout.value)
                      .reduce((a, b) => a + b, isOutgoing ? tx.fee : 0)}{" "}
                    sats
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!transactions.length && <p>You don't have any transactions yet</p>}
    </>
  );
}
