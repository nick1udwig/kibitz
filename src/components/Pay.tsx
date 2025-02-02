"use client";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import {
  useAddRecentTransaction,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
function Pay() {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    if (!address && openConnectModal) {
      openConnectModal();
    }
  }, [address, openConnectModal]);

  useEffect(() => {
    if (address) {
      // put tx here
      // add url search params
      console.log("address", address);
    }
  }, [address]);
  //   useEffect(() => {
  //     const queryParams = new URLSearchParams(location.search);
  //     const binaryData = queryParams.get("data"); // The binary code from the URL parameter

  //     if (binaryData) {
  //       // Convert binary string to hexadecimal
  //       const hexData = "0x" + parseInt(binaryData, 2).toString(16);

  //       // Transaction parameters
  //       const transactionParameters = {
  //         to: "0xRecipientAddress", // Replace with the recipient's address
  //         from: window.ethereum.selectedAddress, // Must match user's active address
  //         value: "0x0", // Optional: amount of Ether to send in wei
  //         data: hexData, // The binary data converted to hex
  //       };

  //       // Trigger MetaMask transaction
  //       window.ethereum
  //         .request({
  //           method: "eth_sendTransaction",
  //           params: [transactionParameters],
  //         })
  //         .then((txHash) => {
  //           console.log("Transaction sent. Hash:", txHash);
  //           // Optionally redirect or display success message
  //         })
  //         .catch((error) => {
  //           console.error("Transaction failed:", error);
  //           // Optionally handle errors
  //         });
  //     } else {
  //       console.error("No binary data provided in the URL.");
  //     }
  //   }, [location]);
  if (!address) {
    return (
      <div>
        <h1>Please connect your wallet</h1>
      </div>
    );
  }

  return (
    <div>
      <h1>Processing Payment...</h1>
    </div>
  );
}

export default Pay;
