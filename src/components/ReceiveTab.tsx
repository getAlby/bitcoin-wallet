import toast from "react-hot-toast";
import { BitcoinAddress } from "../types/webbtc";

type ReceiveTabProps = {
  address: BitcoinAddress;
};

export function ReceiveTab({ address }: ReceiveTabProps) {
  return (
    <>
      <p>Your receive address is:</p>
      <div className="flex gap-4 justify-center items-center w-full">
        <p className="font-bold break-all">{address.address}</p>
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
  );
}
