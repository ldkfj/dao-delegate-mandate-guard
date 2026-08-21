import type { DiscoveredWallet, EIP1193Provider } from './types';
import {
  STUDIONET_CHAIN_ID_HEX,
  STUDIONET_CHAIN_ID_DECIMAL,
  STUDIONET_CHAIN_PARAMS,
} from './constants';

export interface ConnectionResult {
  address: string;
  chainId: string;
}

export function isValid20ByteHexAddress(address: unknown): address is string {
  if (typeof address !== 'string') return false;
  const trimmed = address.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed);
}

export function isStudionetChain(chainId: unknown): boolean {
  if (chainId === null || chainId === undefined) return false;
  if (typeof chainId === 'string') {
    const trimmed = chainId.trim().toLowerCase();
    if (!/^(?:0x[0-9a-f]+|[0-9]+)$/.test(trimmed)) return false;
    return BigInt(trimmed) === BigInt(STUDIONET_CHAIN_ID_DECIMAL);
  }
  if (typeof chainId === 'number' || typeof chainId === 'bigint') {
    return Number(chainId) === STUDIONET_CHAIN_ID_DECIMAL;
  }
  return false;
}

export class WalletConnector {
  private activeProvider: EIP1193Provider | null = null;
  private accountsChangedListener: ((accounts: unknown) => void) | null = null;
  private chainChangedListener: ((chainId: unknown) => void) | null = null;
  private disconnectListener: (() => void) | null = null;

  public async switchOrAddStudionetNetwork(provider: EIP1193Provider): Promise<string> {
    if (!provider || typeof provider.request !== 'function') {
      throw new Error('Provider does not implement EIP-1193 request method');
    }

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
      });
    } catch (switchError: unknown) {
      const errorObj = switchError as { code?: number | string; message?: string };
      // ONLY exact 4902 error code triggers add-chain. Do not infer from message text!
      const isExact4902 = errorObj.code === 4902 || errorObj.code === '4902';

      if (isExact4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [STUDIONET_CHAIN_PARAMS],
          });
          // Retry switch after add
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
          });
        } catch (addError: unknown) {
          const addMsg = (addError as { message?: string })?.message || 'Failed to add Studionet network';
          throw new Error(`Network configuration failed: ${addMsg}`);
        }
      } else {
        const switchMsg = errorObj.message || 'User rejected network switch to Studionet (0xF22F)';
        throw new Error(`Network switch failed: ${switchMsg}`);
      }
    }

    // Require authoritative eth_chainId confirmation equal to Studionet (0xF22F)
    let confirmedChainId: string;
    try {
      const chainIdResult = await provider.request({ method: 'eth_chainId' });
      if (typeof chainIdResult !== 'string' || !chainIdResult.trim()) {
        throw new Error('Malformed or empty chain ID response from provider');
      }
      confirmedChainId = chainIdResult.trim();
    } catch (err: unknown) {
      throw new Error(`Failed to query network chain ID: ${(err as Error)?.message || 'unknown error'}`);
    }

    if (!isStudionetChain(confirmedChainId)) {
      throw new Error(
        `Provider network mismatch: expected Studionet (0xF22F / 61999), received ${confirmedChainId}`
      );
    }

    return confirmedChainId;
  }

  public async connectWallet(
    wallet: DiscoveredWallet,
    callbacks: {
      onAccountsChanged: (accounts: string[]) => void;
      onChainChanged: (chainId: string) => void;
      onDisconnect: () => void;
    }
  ): Promise<ConnectionResult> {
    const provider = wallet.provider;
    if (!provider || typeof provider.request !== 'function') {
      throw new Error('Selected provider does not implement EIP-1193 request method');
    }

    // Clean up previous provider listeners
    this.cleanupListeners();

    // 1. Request accounts on the EXACT captured provider object
    let accounts: unknown;
    try {
      accounts = await provider.request({
        method: 'eth_requestAccounts',
      });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'User rejected account connection';
      throw new Error(`Account connection failed: ${message}`);
    }

    if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== 'string') {
      throw new Error('No accounts returned from wallet');
    }

    const rawAddress = accounts[0].trim();
    if (!isValid20ByteHexAddress(rawAddress)) {
      throw new Error(`Invalid 20-byte hex address returned from wallet: "${rawAddress}"`);
    }

    // 2. Switch chain to Studionet and authoritatively verify chainId
    const confirmedChainId = await this.switchOrAddStudionetNetwork(provider);

    // 3. Register event listeners on the captured provider
    this.activeProvider = provider;

    if (typeof provider.on === 'function') {
      this.accountsChangedListener = (updatedAccounts: unknown) => {
        if (Array.isArray(updatedAccounts)) {
          const validAccounts = updatedAccounts
            .filter((acc): acc is string => typeof acc === 'string' && isValid20ByteHexAddress(acc.trim()))
            .map((acc) => acc.trim());
          callbacks.onAccountsChanged(validAccounts);
        } else {
          callbacks.onAccountsChanged([]);
        }
      };
      provider.on('accountsChanged', this.accountsChangedListener);

      this.chainChangedListener = (newChainId: unknown) => {
        if (typeof newChainId === 'string') {
          callbacks.onChainChanged(newChainId.trim());
        }
      };
      provider.on('chainChanged', this.chainChangedListener);

      this.disconnectListener = () => {
        callbacks.onDisconnect();
      };
      provider.on('disconnect', this.disconnectListener);
    }

    return {
      address: rawAddress,
      chainId: confirmedChainId,
    };
  }

  public cleanupListeners(): void {
    if (this.activeProvider && typeof this.activeProvider.removeListener === 'function') {
      if (this.accountsChangedListener) {
        this.activeProvider.removeListener('accountsChanged', this.accountsChangedListener);
        this.accountsChangedListener = null;
      }
      if (this.chainChangedListener) {
        this.activeProvider.removeListener('chainChanged', this.chainChangedListener);
        this.chainChangedListener = null;
      }
      if (this.disconnectListener) {
        this.activeProvider.removeListener('disconnect', this.disconnectListener);
        this.disconnectListener = null;
      }
    }
    this.activeProvider = null;
  }
}

export const walletConnector = new WalletConnector();
