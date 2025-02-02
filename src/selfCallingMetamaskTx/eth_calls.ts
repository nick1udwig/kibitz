// import { useConnectModal } from "@rainbow-me/rainbowkit";
// import { useAddRecentTransaction } from "@rainbow-me/rainbowkit";
// import { useAccount } from "wagmi";

// export const useMetamaskTransaction = (contractAddress: string, abi: any) => {
//   const { openConnectModal } = useConnectModal();
//   const addRecentTransaction = useAddRecentTransaction();
//   const { address } = useAccount();

//   if (!address) {
//     openConnectModal?.();
//     return;
//   }

//   // if address doesnt own our node, stop
//   const [, owner] = await readContract(client, {
//     abi: kinomapAbi,
//     functionName: "get",
//     address: config.optimism.contracts.kimap as `0x${string}`,
//     args: [namehash((window as any).our?.node)],
//   });
//   console.log("owner", owner);
//   if (address !== owner) {
//     console.error("address doesnt own our node");
//     return;
//   }

//   if (!info) return;
//   registerAsReseller({
//     address: info.tba as `0x${string}`,
//     abi: ApiRegistryAbi.abi,
//     functionName: "registerAsReseller",
//     args: [resellerName, (window as any).our?.node],
//   });
// };

// const { writeContract: addApiSpec, isPending: addApiSpecPending } =
//   useWriteContract({
//     mutation: {
//       onSuccess: (tx_hash) => {
//         console.log("set api spec success");
//         console.log(tx_hash);
//         addRecentTransaction({
//           hash: tx_hash,
//           description: `set api spec`,
//         });
//       },
//       onError: (error) => {
//         console.log(error);
//         alert(error.message);
//       },
//       onSettled: () => {
//         console.log("set api spec settled");
//         setTimeout(() => {
//           refetchNode();
//         }, 3500);
//       },
//     },
//   });
// };
