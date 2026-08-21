import type { AddEthereumChainParameter } from './types';

// Supported Wallets Allowlist (exact RDNS identifiers)
export const SUPPORTED_RDNS = {
  METAMASK: 'io.metamask',
  METAMASK_FLASK: 'io.metamask.flask',
  OKX: 'com.okex.wallet',
  RABBY: 'io.rabby',
} as const;

export const SUPPORTED_RDNS_LIST: readonly string[] = [
  SUPPORTED_RDNS.METAMASK,
  SUPPORTED_RDNS.METAMASK_FLASK,
  SUPPORTED_RDNS.OKX,
  SUPPORTED_RDNS.RABBY,
];

// Display labels for allowed RDNS
export const RDNS_DISPLAY_NAMES: Record<string, string> = {
  [SUPPORTED_RDNS.METAMASK]: 'MetaMask',
  [SUPPORTED_RDNS.METAMASK_FLASK]: 'MetaMask Flask',
  [SUPPORTED_RDNS.OKX]: 'OKX Wallet',
  [SUPPORTED_RDNS.RABBY]: 'Rabby Wallet',
};

// Verified Studionet Network Definition
export const STUDIONET_CHAIN_ID_HEX = '0xF22F';
export const STUDIONET_CHAIN_ID_DECIMAL = 61999;
export const STUDIONET_RPC_URL = 'https://studio.genlayer.com/api';
export const STUDIONET_EXPLORER_URL = 'https://explorer-studio.genlayer.com';

export const STUDIONET_CHAIN_PARAMS: AddEthereumChainParameter = {
  chainId: STUDIONET_CHAIN_ID_HEX,
  chainName: 'GenLayer Studionet',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: [STUDIONET_RPC_URL],
  blockExplorerUrls: [STUDIONET_EXPLORER_URL],
};

export const DISCOVERY_TIMEOUT_MS = 150;
