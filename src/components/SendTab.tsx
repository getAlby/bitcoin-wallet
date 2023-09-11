import React, { FormEvent } from "react";
import { getTransactionUrl } from "../utils/getTransactionUrl";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { BitcoinAddress, BitcoinNetworkType } from "../types/webbtc";
import { AddressTxsUtxo } from "@mempool/mempool.js/lib/interfaces/bitcoin/addresses";
import toast from "react-hot-toast";

type SendTabProps = {
  balance: number;
  recommendedFeeRate: number;
  address: BitcoinAddress;
  network: BitcoinNetworkType;
  utxos: AddressTxsUtxo[];
  onSentTransaction(): void;
};

export function SendTab({
  utxos,
  network,
  address,
  balance,
  recommendedFeeRate,
  onSentTransaction,
}: SendTabProps) {
  const [toAddress, setToAddress] = React.useState<string>("");
  const [toAmount, setToAmount] = React.useState<string>("");
  const [toFeeRate, setToFeeRate] = React.useState<string>(
    recommendedFeeRate.toString()
  );
  const [sentTransactionId, setSentTransactionId] = React.useState("");

  const sendSats = React.useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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

      // FIXME: the initial fee calculation can be too low
      // if additional input UTXOs are required to pay the fee.
      // This could be fixed by re-calculating the fee with extra UTXOs
      for (const withFee of [false, true]) {
        const amount = parseInt(toAmount);
        const feeRate = parseInt(toFeeRate);
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
        onSentTransaction();
      } else {
        const error = await result.text();
        console.error(result.status, error);
        toast.error(error);
      }
    },
    [address, network, onSentTransaction, toAddress, toAmount, toFeeRate, utxos]
  );

  return (
    <>
      {balance ? (
        <>
          <form onSubmit={sendSats} className="form-control w-full">
            <label className="label">
              <span className="label-text">Address</span>
            </label>
            <input
              className="input input-bordered"
              onChange={(e) => setToAddress(e.target.value)}
              placeholder={network === "testnet" ? "tb1..." : "bc1..."}
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
              <span className="label-text">Fee rate (sat/vB)</span>
            </label>
            <input
              className="input input-bordered"
              onChange={(e) => setToFeeRate(e.target.value)}
              defaultValue={toFeeRate}
            />
            <button className="btn mt-8">SEND</button>
          </form>
        </>
      ) : (
        <p>
          You don't have any UTXOs. Send some sats to your address using a
          testnet faucet.
        </p>
      )}

      {sentTransactionId && (
        <p>
          Sent transaction!{" "}
          <a
            className="link font-bold link-secondary underline"
            href={getTransactionUrl(sentTransactionId, network)}
            target="_blank"
          >
            {sentTransactionId}
          </a>
        </p>
      )}
    </>
  );
}
