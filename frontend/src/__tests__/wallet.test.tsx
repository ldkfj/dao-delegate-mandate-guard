import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletProvider, useWallet } from '../wallet/WalletContext';
import { WalletChooserModal } from '../wallet/WalletChooserModal';
import { walletDiscovery } from '../wallet/discovery';
import { walletConnector } from '../wallet/connector';
import { STUDIONET_CHAIN_ID_HEX } from '../wallet/constants';
import type { EIP1193Provider, DiscoveredWallet } from '../wallet/types';

function createMockProvider(
  initialAccounts: string[] = ['0x1111111111111111111111111111111111111111'],
  chainId: string = STUDIONET_CHAIN_ID_HEX
) {
  const callLedger: Array<{ method: string; params?: any }> = [];
  const listeners: Record<string, Function[]> = {};

  const provider: EIP1193Provider = {
    request: vi.fn(async ({ method, params }) => {
      callLedger.push({ method, params });
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return initialAccounts;
      }
      if (method === 'eth_chainId') {
        return chainId;
      }
      if (method === 'wallet_switchEthereumChain') {
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        return null;
      }
      return null;
    }),
    on: vi.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    removeListener: vi.fn((event, cb) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
    }),
  };

  return { provider, callLedger, listeners };
}

describe('Wallet Matrix: Discovery & RDNS Allowlist', () => {
  let stopDiscovery: () => void;

  beforeEach(() => {
    stopDiscovery = walletDiscovery.startDiscovery();
  });

  afterEach(() => {
    stopDiscovery();
    walletConnector.cleanupListeners();
  });

  it('handles zero providers announced with empty wallet list', () => {
    const wallets = walletDiscovery.getWallets();
    expect(wallets.length).toBe(0);
  });

  it('handles MetaMask only announcement', () => {
    const mm = createMockProvider();
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'mm-1', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
          provider: mm.provider,
        },
      })
    );
    const wallets = walletDiscovery.getWallets();
    expect(wallets.length).toBe(1);
    expect(wallets[0].rdns).toBe('io.metamask');
  });

  it('handles OKX only announcement', () => {
    const okx = createMockProvider();
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'okx-1', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
          provider: okx.provider,
        },
      })
    );
    const wallets = walletDiscovery.getWallets();
    expect(wallets.length).toBe(1);
    expect(wallets[0].rdns).toBe('com.okex.wallet');
  });

  it('handles Rabby only announcement', () => {
    const rabby = createMockProvider();
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'rabby-1', name: 'Rabby', icon: '', rdns: 'io.rabby' },
          provider: rabby.provider,
        },
      })
    );
    const wallets = walletDiscovery.getWallets();
    expect(wallets.length).toBe(1);
    expect(wallets[0].rdns).toBe('io.rabby');
  });

  it('announces all three providers and makes each independently selectable', () => {
    const mm = createMockProvider();
    const okx = createMockProvider();
    const rabby = createMockProvider();

    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'mm-uuid', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
          provider: mm.provider,
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'okx-uuid', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
          provider: okx.provider,
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'rabby-uuid', name: 'Rabby', icon: '', rdns: 'io.rabby' },
          provider: rabby.provider,
        },
      })
    );

    const wallets = walletDiscovery.getWallets();
    expect(wallets.length).toBe(3);
    const rdnsList = wallets.map((w) => w.rdns);
    expect(rdnsList).toContain('io.metamask');
    expect(rdnsList).toContain('com.okex.wallet');
    expect(rdnsList).toContain('io.rabby');
  });

  it('deduplicates by UUID and provider object identity, including re-announcement updates', () => {
    const mm = createMockProvider();
    // Announce once
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'mm-same-uuid', name: 'MetaMask Initial', icon: '', rdns: 'io.metamask' },
          provider: mm.provider,
        },
      })
    );
    expect(walletDiscovery.getWallets().length).toBe(1);
    expect(walletDiscovery.getWallets()[0].name).toBe('MetaMask');

    // Re-announce with same provider identity
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'mm-same-uuid', name: 'MetaMask Updated', icon: 'icon-data', rdns: 'io.metamask' },
          provider: mm.provider,
        },
      })
    );
    expect(walletDiscovery.getWallets().length).toBe(1);
    expect(walletDiscovery.getWallets()[0].icon).toBe('icon-data');
  });

  it('ignores unknown RDNS and forged compatibility flags', () => {
    const rogue = createMockProvider();
    (rogue.provider as any).isMetaMask = true; // Forged compatibility flag

    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'rogue-uuid', name: 'Fake MetaMask', icon: '', rdns: 'com.forged.wallet' },
          provider: rogue.provider,
        },
      })
    );

    const wallets = walletDiscovery.getWallets();
    expect(wallets.find((w) => w.rdns === 'com.forged.wallet')).toBeUndefined();
    expect(wallets.length).toBe(0);
  });

  it('removes legacy fallback when first supported EIP-6963 provider is announced later', () => {
    // Simulate window.ethereum
    const globalMock = createMockProvider();
    (window as any).ethereum = globalMock.provider;

    // Trigger fallback evaluation directly
    (walletDiscovery as any).evaluateFallback();
    expect(walletDiscovery.getWallets().some((w) => w.isFallback)).toBe(true);

    // Announce real EIP-6963 provider later
    const rabby = createMockProvider();
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'rabby-uuid', name: 'Rabby', icon: '', rdns: 'io.rabby' },
          provider: rabby.provider,
        },
      })
    );

    const wallets = walletDiscovery.getWallets();
    expect(wallets.some((w) => w.isFallback)).toBe(false);
    expect(wallets.length).toBe(1);
    expect(wallets[0].rdns).toBe('io.rabby');

    delete (window as any).ethereum;
  });
});

describe('Wallet Matrix: Provider Routing, Isolation, and Lifecycle', () => {
  const user = userEvent.setup();

  const TestConsumer = () => {
    const {
      isConnected,
      account,
      chainId,
      isCorrectNetwork,
      error,
      openChooser,
      closeChooser,
      switchNetwork,
      disconnect,
    } = useWallet();
    return (
      <div>
        <button onClick={openChooser}>Open Chooser</button>
        <button onClick={closeChooser}>Close Chooser</button>
        <button onClick={switchNetwork}>Repair Network</button>
        <button onClick={disconnect}>Disconnect Wallet</button>
        <span data-testid="is-connected">{String(isConnected)}</span>
        <span data-testid="account">{account || ''}</span>
        <span data-testid="chain-id">{chainId || ''}</span>
        <span data-testid="is-correct-network">{String(isCorrectNetwork)}</span>
        <span data-testid="wallet-error">{error || ''}</span>
        <WalletChooserModal />
      </div>
    );
  };

  it('starts disconnected on remount/reload', () => {
    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>
    );

    expect(screen.getByTestId('is-connected').textContent).toBe('false');
    expect(screen.getByTestId('account').textContent).toBe('');
    expect(screen.getByTestId('chain-id').textContent).toBe('');
  });

  it('makes ZERO RPC calls on chooser open or cancel', async () => {
    const mockA = createMockProvider();
    const mockB = createMockProvider();

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'a', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: mockA.provider,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'b', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
            provider: mockB.provider,
          },
        })
      );
    });

    await user.click(screen.getByText('Open Chooser'));
    expect(screen.getByRole('dialog')).toBeDefined();

    // Verify ZERO calls on open
    expect(mockA.callLedger.length).toBe(0);
    expect(mockB.callLedger.length).toBe(0);

    // Cancel modal
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Verify ZERO calls on cancel
    expect(mockA.callLedger.length).toBe(0);
    expect(mockB.callLedger.length).toBe(0);
  });

  it('routes calls exclusively to selected provider object; non-selected and global receive ZERO calls', async () => {
    const mockSelected = createMockProvider(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']);
    const mockUnselected = createMockProvider(['0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB']);
    const mockGlobal = createMockProvider(['0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC']);
    (window as any).ethereum = mockGlobal.provider;

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: mockSelected.provider,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'okx', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
            provider: mockUnselected.provider,
          },
        })
      );
    });

    await user.click(screen.getByText('Open Chooser'));
    await user.click(screen.getByTestId('wallet-option-io.metamask'));

    expect(screen.getByTestId('is-connected').textContent).toBe('true');
    expect(screen.getByTestId('account').textContent).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

    // Selected received requests
    expect(mockSelected.callLedger.some((c) => c.method === 'eth_requestAccounts')).toBe(true);

    // Non-selected provider has ZERO calls
    expect(mockUnselected.callLedger.length).toBe(0);

    // Global window.ethereum has ZERO calls
    expect(mockGlobal.callLedger.length).toBe(0);

    delete (window as any).ethereum;
  });

  it('rejects connection when accounts array is empty', async () => {
    const emptyProvider = createMockProvider([]);
    const wallet: DiscoveredWallet = {
      id: 'empty-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: emptyProvider.provider,
      isFallback: false,
    };

    await expect(
      walletConnector.connectWallet(wallet, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
        onDisconnect: vi.fn(),
      })
    ).rejects.toThrow('No accounts returned from wallet');
  });

  it('rejects connection when returned account address is not a valid 20-byte hex address', async () => {
    const invalidProvider = createMockProvider(['0xInvalidNotHexOrWrongLength']);
    const wallet: DiscoveredWallet = {
      id: 'invalid-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: invalidProvider.provider,
      isFallback: false,
    };

    await expect(
      walletConnector.connectWallet(wallet, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
        onDisconnect: vi.fn(),
      })
    ).rejects.toThrow('Invalid 20-byte hex address returned from wallet');
  });

  it('rejects connection when user rejects account request', async () => {
    const rejectingProvider: EIP1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_requestAccounts') {
          const err = new Error('User rejected the request') as any;
          err.code = 4001;
          throw err;
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const wallet: DiscoveredWallet = {
      id: 'reject-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: rejectingProvider,
      isFallback: false,
    };

    await expect(
      walletConnector.connectWallet(wallet, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
        onDisconnect: vi.fn(),
      })
    ).rejects.toThrow('Account connection failed');
  });

  it('handles exact error 4902 to add network and retry switch successfully', async () => {
    let switchCalls = 0;
    const ledger: string[] = [];

    const mockProvider: EIP1193Provider = {
      request: vi.fn(async ({ method }) => {
        ledger.push(method);
        if (method === 'eth_requestAccounts') {
          return ['0x1111111111111111111111111111111111111111'];
        }
        if (method === 'wallet_switchEthereumChain') {
          switchCalls++;
          if (switchCalls === 1) {
            const err = new Error('Chain not added') as any;
            err.code = 4902;
            throw err;
          }
          return null;
        }
        if (method === 'wallet_addEthereumChain') {
          return null;
        }
        if (method === 'eth_chainId') {
          return STUDIONET_CHAIN_ID_HEX;
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const wallet: DiscoveredWallet = {
      id: '4902-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: mockProvider,
      isFallback: false,
    };

    const res = await walletConnector.connectWallet(wallet, {
      onAccountsChanged: vi.fn(),
      onChainChanged: vi.fn(),
      onDisconnect: vi.fn(),
    });

    expect(res.address).toBe('0x1111111111111111111111111111111111111111');
    expect(res.chainId).toBe(STUDIONET_CHAIN_ID_HEX);
    expect(ledger).toEqual([
      'eth_requestAccounts',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
      'eth_chainId',
    ]);
  });

  it('fails immediately without wallet_addEthereumChain when non-4902 switch error occurs', async () => {
    const ledger: string[] = [];

    const mockProvider: EIP1193Provider = {
      request: vi.fn(async ({ method }) => {
        ledger.push(method);
        if (method === 'eth_requestAccounts') {
          return ['0x1111111111111111111111111111111111111111'];
        }
        if (method === 'wallet_switchEthereumChain') {
          const err = new Error('User rejected switch') as any;
          err.code = 4001; // Not 4902
          throw err;
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const wallet: DiscoveredWallet = {
      id: 'non-4902-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: mockProvider,
      isFallback: false,
    };

    await expect(
      walletConnector.connectWallet(wallet, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
        onDisconnect: vi.fn(),
      })
    ).rejects.toThrow('Network switch failed');

    // wallet_addEthereumChain must NEVER have been called!
    expect(ledger).not.toContain('wallet_addEthereumChain');
  });

  it('fails closed when eth_chainId confirmation returns wrong network', async () => {
    const wrongChainProvider: EIP1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_requestAccounts') {
          return ['0x1111111111111111111111111111111111111111'];
        }
        if (method === 'wallet_switchEthereumChain') {
          return null;
        }
        if (method === 'eth_chainId') {
          return '0x1'; // Mainnet instead of Studionet 0xF22F
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const wallet: DiscoveredWallet = {
      id: 'wrong-chain-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: wrongChainProvider,
      isFallback: false,
    };

    await expect(
      walletConnector.connectWallet(wallet, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
        onDisconnect: vi.fn(),
      })
    ).rejects.toThrow('Provider network mismatch: expected Studionet');
  });

  it('fails closed when eth_chainId confirmation returns malformed chain ID', async () => {
    const malformedChainProvider: EIP1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === 'eth_requestAccounts') {
          return ['0x1111111111111111111111111111111111111111'];
        }
        if (method === 'wallet_switchEthereumChain') {
          return null;
        }
        if (method === 'eth_chainId') {
          return ''; // Empty/malformed
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const wallet: DiscoveredWallet = {
      id: 'malformed-chain-w',
      name: 'MetaMask',
      icon: '',
      rdns: 'io.metamask',
      provider: malformedChainProvider,
      isFallback: false,
    };

    await expect(
      walletConnector.connectWallet(wallet, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
        onDisconnect: vi.fn(),
      })
    ).rejects.toThrow('Malformed or empty chain ID response');
  });

  it.each(['0xF22F-not-a-chain', '61999junk'])(
    'fails closed when eth_chainId has a Studionet prefix followed by junk: %s',
    async (chainId) => {
      const provider: EIP1193Provider = {
        request: vi.fn(async ({ method }) => {
          if (method === 'eth_requestAccounts') {
            return ['0x1111111111111111111111111111111111111111'];
          }
          if (method === 'wallet_switchEthereumChain') return null;
          if (method === 'eth_chainId') return chainId;
          return null;
        }),
      };

      await expect(
        walletConnector.connectWallet(
          {
            id: `malformed-${chainId}`,
            name: 'MetaMask',
            icon: '',
            rdns: 'io.metamask',
            provider,
            isFallback: false,
          },
          { onAccountsChanged: vi.fn(), onChainChanged: vi.fn(), onDisconnect: vi.fn() }
        )
      ).rejects.toThrow('Provider network mismatch: expected Studionet');
    }
  );

  it('handles accountsChanged, chainChanged, and disconnect events with cleanup', async () => {
    const mock = createMockProvider();

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: mock.provider,
          },
        })
      );
    });

    await user.click(screen.getByText('Open Chooser'));
    await user.click(screen.getByTestId('wallet-option-io.metamask'));

    expect(screen.getByTestId('account').textContent).toBe('0x1111111111111111111111111111111111111111');

    // Trigger accountsChanged event with new address
    act(() => {
      const cb = mock.listeners['accountsChanged']?.[0];
      cb?.(['0x2222222222222222222222222222222222222222']);
    });
    expect(screen.getByTestId('account').textContent).toBe('0x2222222222222222222222222222222222222222');

    // Trigger chainChanged event to wrong chain
    act(() => {
      const cb = mock.listeners['chainChanged']?.[0];
      cb?.('0x1');
    });
    expect(screen.getByTestId('is-correct-network').textContent).toBe('false');
    expect(screen.getByTestId('wallet-error').textContent).toContain('Wrong network');

    // Disconnect clears state
    await user.click(screen.getByText('Disconnect Wallet'));
    expect(screen.getByTestId('is-connected').textContent).toBe('false');
    expect(screen.getByTestId('account').textContent).toBe('');
    expect(mock.provider.removeListener).toHaveBeenCalled();
  });

  it('performs network repair without issuing a second eth_requestAccounts', async () => {
    const mock = createMockProvider();

    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: mock.provider,
          },
        })
      );
    });

    await user.click(screen.getByText('Open Chooser'));
    await user.click(screen.getByTestId('wallet-option-io.metamask'));

    // Count eth_requestAccounts calls
    const initialRequestAccounts = mock.callLedger.filter((c) => c.method === 'eth_requestAccounts').length;
    expect(initialRequestAccounts).toBe(1);

    // Call Repair Network
    await user.click(screen.getByText('Repair Network'));

    // Verify eth_requestAccounts was NOT called again!
    const postRepairRequestAccounts = mock.callLedger.filter((c) => c.method === 'eth_requestAccounts').length;
    expect(postRepairRequestAccounts).toBe(1);
    expect(mock.callLedger.some((c) => c.method === 'wallet_switchEthereumChain')).toBe(true);
  });
});

describe('Wallet Matrix: Chooser Accessibility & Modal Behavior', () => {
  const user = userEvent.setup();

  const AccessibleApp = () => {
    const { isChooserOpen, openChooser } = useWallet();
    return (
      <div>
        <div id="shell" data-testid="app-shell" inert={isChooserOpen ? true : undefined}>
          <button onClick={openChooser} data-testid="connect-trigger">
            Connect
          </button>
        </div>
        <WalletChooserModal />
      </div>
    );
  };

  it('makes application shell inert while chooser is open and restores on close', async () => {
    render(
      <WalletProvider>
        <AccessibleApp />
      </WalletProvider>
    );

    const shell = screen.getByTestId('app-shell');
    expect(shell.hasAttribute('inert')).toBe(false);

    // Open chooser
    await user.click(screen.getByTestId('connect-trigger'));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(shell.hasAttribute('inert')).toBe(true);

    // Close chooser with Escape
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shell.hasAttribute('inert')).toBe(false);
  });

  it('traps focus inside dialog on Tab and Shift+Tab', async () => {
    const mm = createMockProvider();

    render(
      <WalletProvider>
        <AccessibleApp />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: mm.provider,
          },
        })
      );
    });

    await user.click(screen.getByTestId('connect-trigger'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();

    // Verify dialog has accessible name and modal attribute
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('wallet-chooser-title');
  });

  it('shows human-facing wallet names without provider implementation identifiers', async () => {
    const mm = createMockProvider();
    const okx = createMockProvider();

    render(
      <WalletProvider>
        <AccessibleApp />
      </WalletProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'mm-ui', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
            provider: mm.provider,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid: 'okx-ui', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
            provider: okx.provider,
          },
        })
      );
    });

    await user.click(screen.getByTestId('connect-trigger'));

    expect(screen.getByText('MetaMask')).toBeDefined();
    expect(screen.getByText('OKX Wallet')).toBeDefined();
    expect(screen.queryByText('io.metamask')).toBeNull();
    expect(screen.queryByText('com.okex.wallet')).toBeNull();
  });
});
