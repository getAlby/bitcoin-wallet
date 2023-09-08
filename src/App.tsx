import React, { FormEvent } from "react";
import mempoolJS from "@mempool/mempool.js";
import { AddressTxsUtxo } from "@mempool/mempool.js/lib/interfaces/bitcoin/addresses";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";

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

function App() {
  const [toAddress, setToAddress] = React.useState<string>(
    "tb1pmgqzlvj3kcnsaxvnvnjrfm2kyx2k9ddfp84ty6hx0972gz85gg3slq3j59"
  );
  const [toAmount, setToAmount] = React.useState<string>("100");
  const [toFee, setToFee] = React.useState<string>("1000");
  const [address, setAddress] = React.useState<BitcoinAddress | undefined>();
  const [utxos, setUtxos] = React.useState<AddressTxsUtxo[] | undefined>();
  const [isLoading, setLoading] = React.useState(true);
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
      bitcoin: { addresses },
    } = mempoolJS({
      hostname: "mempool.space",
      network,
    });

    const addressTxsUtxos = await addresses.getAddressTxsUtxo({
      address: address.address,
    });
    console.log(addressTxsUtxos);
    setUtxos(addressTxsUtxos);
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
      toFee,
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

    const amount = parseInt(toAmount);
    const fee = parseInt(toFee); // TODO: fee should be calculated
    const total = amount + fee;

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

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks[network] });
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

    const remainder = usedUtxoBalance - total;

    if (remainder > 0) {
      // send remainder back to original address
      psbt.addOutput({
        value: remainder,
        address: address.address,
      });
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
      //alert("Transaction broadcasted: " + sentTransactionId);
    } else {
      const error = await result.text();
      console.error(result.status, error);
      setError(error);
    }
  }

  if (error) {
    return error;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <h1>Alby Bitcoin Wallet</h1>
        <p>
          {!window.webbtc
            ? "No webbtc extension detected. Try Alby"
            : isLoading || !address
            ? "Connecting..."
            : address.address}
        </p>
        {network && <p>Network: {network}</p>}
      </div>
      {!isLoading && (
        <>
          <p>Balance</p>
          <p>{utxos ? `${balance} sats` : "Loading..."}</p>
          {utxos && (
            <>
              {utxos && (
                <div>
                  <p>UTXOs</p>
                  {utxos.map((utxo) => (
                    <p key={utxo.txid}>
                      {utxo.txid} {utxo.value}
                    </p>
                  ))}
                </div>
              )}
              {balance ? (
                <div>
                  <p>Send sats</p>
                  <form onSubmit={sendSats}>
                    Address{" "}
                    <input
                      onChange={(e) => setToAddress(e.target.value)}
                      placeholder="tb1..."
                      defaultValue={toAddress}
                    />
                    Amount{" "}
                    <input
                      onChange={(e) => setToAmount(e.target.value)}
                      placeholder="amount in sats"
                      defaultValue={toAmount}
                    />
                    Total fee{" "}
                    <input
                      onChange={(e) => setToFee(e.target.value)}
                      placeholder="amount in sats"
                      defaultValue={toAmount}
                    />
                    <button>Submit</button>
                  </form>
                </div>
              ) : (
                <p>
                  You don't have any UTXOs. Send some sats to your address using
                  a testnet faucet.
                </p>
              )}
            </>
          )}

          {sentTransactionId && (
            <p>
              Sent transaction!{" "}
              <a
                className="text-blue-500 underline"
                href={`https://mempool.space/testnet/tx/${sentTransactionId}`}
                target="_blank"
              >
                {sentTransactionId}
              </a>
            </p>
          )}
        </>
      )}
    </>
  );
}

export default App;
