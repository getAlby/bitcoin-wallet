import React, { FormEvent } from "react";
import mempoolJS from "@mempool/mempool.js";
import { AddressTxsUtxo } from "@mempool/mempool.js/lib/interfaces/bitcoin/addresses";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { Tx } from "@mempool/mempool.js/lib/interfaces/bitcoin/transactions";
import { AlbyLogo } from "./components/icons/AlbyLogo";
import toast, { Toaster } from "react-hot-toast";
import { formatDistance } from "date-fns";

type BitcoinAddress = {
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

const tabs = ["transactions", "receive", "send"] as const;
type TabType = (typeof tabs)[number];

function App() {
  const [toAddress, setToAddress] = React.useState<string>(
    "tb1pmgqzlvj3kcnsaxvnvnjrfm2kyx2k9ddfp84ty6hx0972gz85gg3slq3j59"
  );
  const [activeTab, setActiveTab] = React.useState<TabType>("transactions");
  const [toAmount, setToAmount] = React.useState<string>("100");
  const [toFeeRate, setToFeeRate] = React.useState<string>("1000");
  const [address, setAddress] = React.useState<BitcoinAddress | undefined>();
  const [utxos, setUtxos] = React.useState<AddressTxsUtxo[] | undefined>();
  const [transactions, setTransactions] = React.useState<Tx[] | undefined>();
  const [isLoading, setLoading] = React.useState(true);
  const [viewingUtxos, setViewingUtxos] = React.useState(false);
  const [network, setNetwork] = React.useState<
    "bitcoin" | "testnet" | undefined
  >(undefined);
  const [error, setError] = React.useState("");
  const [sentTransactionId, setSentTransactionId] = React.useState("");

  const load = React.useCallback(async () => {
    setError("");
    if (!window.webbtc) {
      setError(
        "window.webbtc does not exist. Please install the Alby extension"
      );
      return;
    }
    await window.webbtc.enable();

    const address = await window.webbtc.getAddress();
    setAddress(address);

    const network = address.address.startsWith("tb")
      ? "testnet"
      : address.address.startsWith("bcrt")
      ? "regtest"
      : "bitcoin";
    if (network === "regtest") {
      setError(
        "Sorry, Regtest not supported. Please change the network in your account."
      );
      return;
    }
    setNetwork(network);
    const {
      bitcoin: { addresses, fees },
    } = mempoolJS({
      hostname: "mempool.space",
      network,
    });

    const addressTxsUtxos = await addresses.getAddressTxsUtxo({
      address: address.address,
    });
    console.log(addressTxsUtxos);
    setUtxos(addressTxsUtxos);
    const recommendedFees = await fees.getFeesRecommended();
    setToFeeRate(recommendedFees.fastestFee.toString());

    const sentTransactions = await addresses.getAddressTxs({
      address: address.address,
    });
    setTransactions(sentTransactions);

    setLoading(false);
  }, []);

  React.useEffect(() => {
    (async () => {
      await load();
      if (window.webbtc) {
        window.webbtc.on("accountChanged", () => {
          setLoading(true);
          load();
        });
      }
    })();
  }, [load]);

  const balance =
    utxos?.map((utxo) => utxo.value).reduce((a, b) => a + b, 0) || 0;

  async function sendSats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.webbtc) {
      throw new Error("window.webbtc not loaded");
    }
    if (!address) {
      throw new Error("Address not loaded");
    }
    if (!network) {
      throw new Error("Network not loaded");
    }
    if (!utxos?.length) {
      throw new Error("UTXOs not loaded or no UTXOs");
    }
    if (!toAmount) {
      throw new Error("Please send at least 1 sat");
    }
    console.log(
      toAddress,
      toAmount,
      toFeeRate,
      address.publicKey,
      address.publicKey.length
    );

    const xOnlyPubkey = Buffer.from(address.publicKey, "hex").subarray(1, 33);

    bitcoin.initEccLib(ecc);
    const { output } = bitcoin.payments.p2tr({
      internalPubkey: xOnlyPubkey,
      network: bitcoin.networks[network],
    });

    if (!output) {
      throw new Error("No output from p2tr");
    }

    let psbt: bitcoin.Psbt | undefined;
    let estimatedVbytes = 0;

    for (const withFee of [false, true]) {
      const amount = parseInt(toAmount);
      const feeRate = parseInt(toFeeRate); // TODO: fee should be calculated
      const total = amount + estimatedVbytes * feeRate;

      const usedUtxos: AddressTxsUtxo[] = [];
      let usedUtxoBalance = 0;

      for (let i = 0; i < utxos.length; i++) {
        usedUtxos.push(utxos[i]);
        usedUtxoBalance += utxos[i].value;
        if (usedUtxoBalance >= total) {
          break;
        }
      }

      if (usedUtxoBalance < total) {
        throw new Error("not enough balance");
      }

      psbt = new bitcoin.Psbt({ network: bitcoin.networks[network] });
      for (const utxo of usedUtxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: { value: utxo.value, script: output },
          tapInternalKey: xOnlyPubkey,
        });
      }

      psbt.addOutput({
        value: amount,
        address: toAddress,
      });
      if (!withFee) {
        // force add remainder output
        psbt.addOutput({
          value: 0,
          address: address.address,
        });

        estimatedVbytes = psbt.toBuffer().byteLength;
      } else {
        const remainder = usedUtxoBalance - total;

        if (remainder > 0) {
          // send remainder back to original address
          psbt.addOutput({
            value: remainder,
            address: address.address,
          });
        }
      }
    }
    if (!psbt) {
      throw new Error("No psbt");
    }

    const psbtHex = psbt.toHex();
    console.log("PSBT hex:", psbtHex);

    const signResponse = await window.webbtc.signPsbt(psbtHex);
    console.log("SIGNED:", signResponse);

    const result = await fetch(
      `https://blockstream.info/${
        network === "testnet" ? "testnet/" : ""
      }api/tx`,
      {
        method: "POST",
        body: signResponse.signed,

        headers: new Headers({
          "Content-Type": "text/plain",
        }),
      }
    );

    if (result.ok) {
      const sentTransactionId = await result.text();
      setSentTransactionId(sentTransactionId);

      // reload utxos and transactions
      load();
    } else {
      const error = await result.text();
      console.error(result.status, error);
      setError(error);
    }
  }

  return (
    <div className="w-full flex justify-center items-start">
      <Toaster />
      <div className="p-8 max-w-xl flex flex-col gap-4 justify-center items-center w-full break-all">
        <AlbyLogo className="w-32 h-32" />
        <h1 className="-mt-12">Onchain Bitcoin Wallet</h1>
        {!isLoading && (
          <div className="w-full">
            <div className="stats shadow">
              <div className="stat">
                <div className="stat-title">Balance</div>
                <div className="stat-value">{balance} sats</div>
                <div className="stat-desc">
                  <a
                    className="link"
                    onClick={() => setViewingUtxos(!viewingUtxos)}
                  >
                    {utxos?.length || 0} UTXOs
                  </a>
                </div>
              </div>
            </div>
            {viewingUtxos && (
              <div className="flex flex-col flex-1 w-full mt-4 gap-4">
                {utxos
                  ?.sort((a, b) => b.value - a.value)
                  .map((utxo) => (
                    <div
                      key={utxo.txid}
                      className="flex justify-between items-start w-full gap-4"
                    >
                      <a
                        href={`https://mempool.space/${
                          network === "testnet" ? "testnet/" : ""
                        }tx/${utxo.txid}`}
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
        )}

        <div className="tabs tabs-boxed my-4 w-full justify-center">
          {tabs.map((tab) => (
            <a
              className={`tab tab-lg w-36 capitalize ${
                tab === activeTab ? "tab-active" : ""
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </a>
          ))}
        </div>
        {isLoading && (
          <span className="loading loading-spinner loading-lg"></span>
        )}
        {error && <p className="text-error">{error}</p>}

        {/* {network && <p>Network: {network}</p>} */}
        {!isLoading && (
          <>
            {activeTab === "receive" && address && (
              <>
                <p>Your receive address is:</p>
                <div className="flex gap-2">
                  <p className="font-bold">{address.address}</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      window.navigator.clipboard.writeText(address.address);
                      toast.success("Address copied to clipboard");
                    }}
                  >
                    Copy
                  </button>
                </div>
              </>
            )}
            {activeTab === "send" && (
              <>
                {utxos && (
                  <>
                    {balance ? (
                      <>
                        <form
                          onSubmit={sendSats}
                          className="form-control w-full"
                        >
                          <label className="label">
                            <span className="label-text">Address</span>
                          </label>
                          <input
                            className="input input-bordered"
                            onChange={(e) => setToAddress(e.target.value)}
                            placeholder={
                              network === "testnet" ? "tb1..." : "bc1..."
                            }
                            defaultValue={toAddress}
                          />
                          <label className="label">
                            <span className="label-text">Amount</span>
                          </label>
                          <input
                            className="input input-bordered"
                            onChange={(e) => setToAmount(e.target.value)}
                            placeholder="amount in sats"
                            defaultValue={toAmount}
                          />
                          <label className="label">
                            <span className="label-text">
                              Fee rate (sat/vB)
                            </span>
                          </label>
                          <input
                            className="input input-bordered"
                            onChange={(e) => setToFeeRate(e.target.value)}
                            placeholder="amount in sats"
                            defaultValue={toFeeRate}
                          />
                          <button className="btn mt-8">SEND</button>
                        </form>
                      </>
                    ) : (
                      <p>
                        You don't have any UTXOs. Send some sats to your address
                        using a testnet faucet.
                      </p>
                    )}
                  </>
                )}

                {sentTransactionId && (
                  <p>
                    Sent transaction!{" "}
                    <a
                      className="link font-bold link-secondary underline"
                      href={`https://mempool.space/${
                        network === "testnet" ? "testnet/" : ""
                      }tx/${sentTransactionId}`}
                      target="_blank"
                    >
                      {sentTransactionId}
                    </a>
                  </p>
                )}
              </>
            )}

            {activeTab === "transactions" && (
              <>
                <table className="table">
                  <tbody>
                    {transactions?.map((tx) => {
                      const isOutgoing =
                        tx.vin[0].prevout.scriptpubkey_address ===
                        address?.address;
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
                              className="link"
                              href={`https://mempool.space/${
                                network === "testnet" ? "testnet/" : ""
                              }tx/${tx.txid}`}
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
                                    ? vout.scriptpubkey_address !==
                                      address?.address
                                    : vout.scriptpubkey_address ===
                                      address?.address
                                )
                                .map((vout) => vout.value)
                                .reduce(
                                  (a, b) => a + b,
                                  isOutgoing ? tx.fee : 0
                                )}{" "}
                              sats
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!transactions?.length && (
                  <p>You don't have any transactions yet</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
