import type {
  DiscoveredWallet,
  EIP6963AnnounceProviderEvent,
  EIP1193Provider,
} from './types';
import {
  SUPPORTED_RDNS_LIST,
  RDNS_DISPLAY_NAMES,
  DISCOVERY_TIMEOUT_MS,
} from './constants';

export type DiscoveryListener = (wallets: DiscoveredWallet[]) => void;

class WalletDiscovery {
  private wallets: DiscoveredWallet[] = [];
  private listeners: Set<DiscoveryListener> = new Set();
  private fallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private hasAnnouncedSupported = false;

  public startDiscovery(): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    this.wallets = [];
    this.hasAnnouncedSupported = false;
    this.notify();

    // 1. Register announceProvider listener BEFORE requesting
    const handleAnnouncement = (event: Event) => {
      const customEvent = event as EIP6963AnnounceProviderEvent;
      this.handleAnnounce(customEvent);
    };

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);

    // 2. Dispatch requestProvider
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // 3. Fallback window for legacy window.ethereum
    if (this.fallbackTimeoutId) {
      clearTimeout(this.fallbackTimeoutId);
    }

    this.fallbackTimeoutId = setTimeout(() => {
      this.evaluateFallback();
    }, DISCOVERY_TIMEOUT_MS);

    return () => {
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
      if (this.fallbackTimeoutId) {
        clearTimeout(this.fallbackTimeoutId);
        this.fallbackTimeoutId = null;
      }
    };
  }

  public subscribe(listener: DiscoveryListener): () => void {
    this.listeners.add(listener);
    listener(this.getWallets());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getWallets(): DiscoveredWallet[] {
    return [...this.wallets];
  }

  private handleAnnounce(event: EIP6963AnnounceProviderEvent): void {
    if (!event || !event.detail) return;
    const { info, provider } = event.detail;

    if (!info || !provider || typeof provider.request !== 'function') {
      return;
    }

    const { uuid, rdns, icon } = info;
    if (!uuid || !rdns || typeof rdns !== 'string') {
      return;
    }

    // Validate against centralized RDNS allowlist
    const normalizedRdns = rdns.trim().toLowerCase();
    const isSupported = SUPPORTED_RDNS_LIST.includes(normalizedRdns);

    if (!isSupported) {
      // Ignore unknown or forged wallets
      return;
    }

    this.hasAnnouncedSupported = true;

    // Remove any legacy fallback if present
    this.wallets = this.wallets.filter((w) => !w.isFallback);

    const displayName = RDNS_DISPLAY_NAMES[normalizedRdns] || info.name || 'Supported Wallet';

    const newWallet: DiscoveredWallet = {
      id: uuid,
      name: displayName,
      icon: icon || '',
      rdns: normalizedRdns,
      provider,
      isFallback: false,
    };

    // Deduplicate by UUID or provider object identity
    const existingIndex = this.wallets.findIndex(
      (w) => w.id === uuid || w.provider === provider
    );

    if (existingIndex >= 0) {
      this.wallets[existingIndex] = newWallet;
    } else {
      this.wallets.push(newWallet);
    }

    this.notify();
  }

  private evaluateFallback(): void {
    if (this.hasAnnouncedSupported || this.wallets.some((w) => !w.isFallback)) {
      return;
    }

    // Check window.ethereum
    const injected = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (injected && typeof injected.request === 'function') {
      // Check if already in list
      const exists = this.wallets.some((w) => w.provider === injected);
      if (!exists) {
        this.wallets.push({
          id: 'injected-fallback',
          name: 'Injected wallet',
          icon: '',
          rdns: 'injected',
          provider: injected,
          isFallback: true,
        });
        this.notify();
      }
    }
  }

  private notify(): void {
    const list = this.getWallets();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.error('Error in wallet discovery listener', err);
      }
    }
  }
}

export const walletDiscovery = new WalletDiscovery();
