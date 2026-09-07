"use client";

import { useState, useCallback } from "react";
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core";

/**
 * Minimal hook for connecting to a browser Starknet wallet
 * (ArgentX, Braavos, etc.) using @starknet-io/get-starknet-core.
 *
 * Uses the standardized Wallet RPC API (wallet_requestAccounts,
 * wallet_signTypedData) so it works with any compliant wallet extension.
 *
 * We use get-starknet-core directly because @starknet-react/core requires
 * React 18, while this project runs React 19.
 */
export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletName: string | null;

  wallet: StarknetWindowObject | null;
}

export function useStarknetWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    walletName: null,
    wallet: null,
  });
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setState((s) => ({ ...s, isConnecting: true }));
    try {
      const { getStarknet } = await import("@starknet-io/get-starknet-core");
      const gsn = getStarknet();
      const available = await gsn.getAvailableWallets();
      if (!available.length) {
        setError("No Starknet wallet detected. Install ArgentX or Braavos and reload.");
        setState((s) => ({ ...s, isConnecting: false }));
        return;
      }
      const wallet = await gsn.enable(available[0]);
      // Request accounts via standard wallet RPC
      const accounts = await wallet.request({ type: "wallet_requestAccounts" }) as string[];
      const address = accounts[0] ?? null;
      setState({
        address,
        isConnected: true,
        isConnecting: false,
        walletName: wallet.name,
        wallet,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
      setState((s) => ({ ...s, isConnecting: false }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ address: null, isConnected: false, isConnecting: false, walletName: null, wallet: null });
    setError(null);
  }, []);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!state.wallet) throw new Error("Wallet not connected.");
      /**
       * Use `string` (not `felt` / `shortstring`) for the message field.
       * `felt` in Starknet typed data maps to Cairo's shortstring, which is
       * capped at 31 ASCII characters. Our approval message is ~47 chars, so
       * we use the `string` type which is unbounded and rendered clearly in
       * ArgentX / Braavos signing dialogs.
       */
      const sig = await state.wallet.request({
        type: "wallet_signTypedData",
        params: {
          types: {
            StarknetDomain: [
              { name: "name", type: "shortstring" },
              { name: "version", type: "shortstring" },
              { name: "chainId", type: "shortstring" },
              { name: "revision", type: "shortstring" },
            ],
            PayrollApproval: [{ name: "message", type: "string" }],
          },
          primaryType: "PayrollApproval",
          domain: { name: "StableRoll", version: "1", chainId: "SN_MAIN", revision: "1" },
          message: { message },
        },
      });
      return JSON.stringify(sig);
    },
    [state.wallet],
  );

  return { ...state, error, connect, disconnect, signMessage };
}
