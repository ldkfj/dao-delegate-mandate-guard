import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { DiscoveredWallet, WalletState, EIP1193Provider } from './types';
import { walletDiscovery } from './discovery';
import { walletConnector, isStudionetChain } from './connector';

export interface WalletContextValue extends WalletState {
  account: string | null;
  provider: EIP1193Provider | null;
  selectedProviderName: string | null;
  selectedProviderRdns: string | null;
  isCorrectNetwork: boolean;
  discoveredWallets: DiscoveredWallet[];
  isChooserOpen: boolean;
  openChooser: () => void;
  closeChooser: () => void;
  connect: (wallet: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const initialWalletState: WalletState = {
  isConnected: false,
  isConnecting: false,
  address: null,
  chainId: null,
  selectedWallet: null,
  error: null,
};

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WalletState>(initialWalletState);
  const [discoveredWallets, setDiscoveredWallets] = useState<DiscoveredWallet[]>([]);
  const [isChooserOpen, setIsChooserOpen] = useState(false);

  // Discovery lifecycle
  useEffect(() => {
    const stopDiscovery = walletDiscovery.startDiscovery();
    const unsubscribe = walletDiscovery.subscribe((wallets) => {
      setDiscoveredWallets(wallets);
    });

    return () => {
      stopDiscovery();
      unsubscribe();
      walletConnector.cleanupListeners();
    };
  }, []);

  const openChooser = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
    setIsChooserOpen(true);
  }, []);

  const closeChooser = useCallback(() => {
    setIsChooserOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const disconnect = useCallback(() => {
    walletConnector.cleanupListeners();
    setState(initialWalletState);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  const connect = useCallback(
    async (wallet: DiscoveredWallet) => {
      setState((prev) => ({ ...prev, isConnecting: true, error: null }));

      try {
        const result = await walletConnector.connectWallet(wallet, {
          onAccountsChanged: (accounts: string[]) => {
            if (accounts.length === 0) {
              disconnect();
            } else {
              setState((prev) => ({
                ...prev,
                address: accounts[0],
              }));
            }
          },
          onChainChanged: (newChainId: string) => {
            const isStudionet = isStudionetChain(newChainId);
            setState((prev) => ({
              ...prev,
              chainId: newChainId,
              error: isStudionet
                ? null
                : `Wrong network (${newChainId}). Please switch to GenLayer Studionet (0xF22F).`,
            }));
          },
          onDisconnect: () => {
            disconnect();
          },
        });

        setState({
          isConnected: true,
          isConnecting: false,
          address: result.address,
          chainId: result.chainId,
          selectedWallet: wallet,
          error: null,
        });

        setIsChooserOpen(false);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: errorMessage,
        }));
      }
    },
    [disconnect]
  );

  // Dedicated network repair action: Does NOT call eth_requestAccounts!
  const switchNetwork = useCallback(async () => {
    const provider = state.selectedWallet?.provider;
    if (!provider) return;

    try {
      const confirmedChainId = await walletConnector.switchOrAddStudionetNetwork(provider);
      setState((prev) => ({
        ...prev,
        chainId: confirmedChainId,
        error: null,
      }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        error: errorMessage,
      }));
    }
  }, [state.selectedWallet]);

  const isCorrectNetwork = state.chainId !== null && isStudionetChain(state.chainId);

  const value: WalletContextValue = {
    ...state,
    account: state.address,
    provider: state.selectedWallet?.provider || null,
    selectedProviderName: state.selectedWallet?.name || null,
    selectedProviderRdns: state.selectedWallet?.rdns || null,
    isCorrectNetwork,
    discoveredWallets,
    isChooserOpen,
    openChooser,
    closeChooser,
    connect,
    disconnect,
    switchNetwork,
    clearError,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletContextValue => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
