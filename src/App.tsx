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
      signPsbt(psbt: string): Promise<string>;
    };
  }
}

// TODO: load after address so network can be configured
const {
  bitcoin: { addresses, transactions },
} = mempoolJS({
  hostname: "mempool.space",
  network: "testnet",
});

function App() {
  const [toAddress, setToAddress] = React.useState<string>(
    "tb1pmgqzlvj3kcnsaxvnvnjrfm2kyx2k9ddfp84ty6hx0972gz85gg3slq3j59"
  );
  const [toAmount, setToAmount] = React.useState<string>("100");
  const [address, setAddress] = React.useState<BitcoinAddress | undefined>();
  const [utxos, setUtxos] = React.useState<AddressTxsUtxo[] | undefined>();

  React.useEffect(() => {
    (async () => {
      if (!window.webbtc) {
        return;
      }
      await window.webbtc.enable();

      const address = await window.webbtc.getAddress();
      setAddress(address);
      const addressTxsUtxos = await addresses.getAddressTxsUtxo({
        address: address.address,
      });
      console.log(addressTxsUtxos);
      setUtxos(addressTxsUtxos);
    })();
  }, []);

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
    if (!utxos?.length) {
      throw new Error("UTXOs not loaded or no UTXOs");
    }
    console.log(
      toAddress,
      toAmount,
      address.publicKey,
      address.publicKey.length
    );

    const xOnlyPubkey = Buffer.from(address.publicKey, "hex").subarray(1, 33);

    bitcoin.initEccLib(ecc);
    const { output } = bitcoin.payments.p2tr({
      internalPubkey: xOnlyPubkey,
    });

    if (!output) {
      throw new Error("No output from p2tr");
    }

    const amount = parseInt(toAmount);
    // FIXME: support multiple utxos
    const hash = utxos[0].txid;
    const index = utxos[0].vout;

    if (amount > utxos[0].value) {
      throw new Error(
        "amount " + amount + " is greater than utxo[0] " + utxos[0].value
      );
    }

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet })
      .addInput({
        hash,
        index,
        witnessUtxo: { value: utxos[0].value, script: output },
        tapInternalKey: xOnlyPubkey,
      })
      // FIXME: add a change address output
      .addOutput({
        value: amount,

        address: toAddress,
      })
      .toHex();

    console.log("PSBT hex:", psbt);

    const signed = await window.webbtc.signPsbt(psbt);
    console.log("SIGNED:", signed);

    const result = await transactions.postTx({
      txhex: signed,
    });

    console.log(result);

    //const signedTransaction = bitcoin.Transaction.fromHex(signed);

    // await regtestUtils.broadcast(tx.toHex());
    // await regtestUtils.verify({
    //   txId: tx.getId(),
    //   address: regtestUtils.RANDOM_ADDRESS,
    //   vout: 0,
    //   value: sendAmount,
    // });
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <h1>Alby Bitcoin Wallet</h1>
        <p>
          {!window.webbtc
            ? "No webbtc extension detected. Try Alby"
            : address
            ? address?.address
            : "Connecting..."}
        </p>
      </div>
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
                <button>Submit</button>
              </form>
            </div>
          ) : (
            <p>
              You don't have any UTXOs. Send some sats to your address using a
              testnet faucet.
            </p>
          )}
        </>
      )}
    </>
  );
}

export default App;
