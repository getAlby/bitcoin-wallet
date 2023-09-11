import React from "react";
import mempoolJS from "@mempool/mempool.js";
import { AddressTxsUtxo } from "@mempool/mempool.js/lib/interfaces/bitcoin/addresses";

import { Tx } from "@mempool/mempool.js/lib/interfaces/bitcoin/transactions";
import { AlbyLogo } from "./components/icons/AlbyLogo";
import { Toaster } from "react-hot-toast";
import { SendTab } from "./components/SendTab";
import { BitcoinAddress, BitcoinNetworkType } from "./types/webbtc";
import { TransactionsTab } from "./components/TransactionsTab";
import { ReceiveTab } from "./components/ReceiveTab";
import { WalletStats } from "./components/WalletStats";

const tabs = ["transactions", "receive", "send"] as const;
type TabType = (typeof tabs)[number];

function App() {
  const [activeTab, setActiveTab] = React.useState<TabType>("transactions");
  const [recommendedFeeRate, setRecommendedFeeRate] = React.useState(0);

  const [address, setAddress] = React.useState<BitcoinAddress | undefined>();
  const [utxos, setUtxos] = React.useState<AddressTxsUtxo[] | undefined>();
  const [transactions, setTransactions] = React.useState<Tx[] | undefined>();
  const [networkType, setNetworkType] = React.useState<
    BitcoinNetworkType | undefined
  >(undefined);
  const [error, setError] = React.useState("");

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
    setNetworkType(network);
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
    setRecommendedFeeRate(recommendedFees.fastestFee);

    const transactions = await addresses.getAddressTxs({
      address: address.address,
    });
    setTransactions(transactions);
  }, []);

  React.useEffect(() => {
    (async () => {
      await load();
      if (window.webbtc) {
        window.webbtc.on("accountChanged", () => {
          load();
        });
      }
    })();
  }, [load]);

  const balance =
    utxos?.map((utxo) => utxo.value).reduce((a, b) => a + b, 0) || 0;

  const isLoading = !networkType || !utxos || !transactions || !address;

  return (
    <div className="w-full flex justify-center items-start">
      <Toaster />
      <div className="p-3 sm:p-8 max-w-3xl flex flex-col gap-4 justify-center items-center w-full break-words">
        <AlbyLogo className="w-32 h-32" />
        <h1 className="-mt-12">Onchain Bitcoin Wallet</h1>
        {!isLoading && (
          <WalletStats
            balance={balance}
            networkType={networkType}
            transactions={transactions}
            utxos={utxos}
            address={address}
          />
        )}

        {!isLoading && (
          <div className="tabs tabs-boxed my-4 w-full justify-center">
            {tabs.map((tab) => (
              <a
                className={`tab sm:tab-lg flex-1 capitalize ${
                  tab === activeTab ? "tab-active" : ""
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </a>
            ))}
          </div>
        )}
        {isLoading && !error && (
          <span className="loading loading-spinner loading-lg"></span>
        )}
        {error && <p className="text-error">{error}</p>}

        {/* {network && <p>Network: {network}</p>} */}
        {!isLoading && (
          <>
            {activeTab === "receive" && address && (
              <ReceiveTab address={address} />
            )}
            {activeTab === "send" && (
              <SendTab
                balance={balance}
                recommendedFeeRate={recommendedFeeRate}
                address={address}
                network={networkType}
                utxos={utxos}
                onSentTransaction={load}
              />
            )}
            {activeTab === "transactions" && (
              <TransactionsTab
                networkType={networkType}
                address={address}
                transactions={transactions}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
