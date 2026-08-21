// App Configuration & Contract Address Validator

export interface AppContractConfig {
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
  contractAddress: string | null;
  isConfigured: boolean;
  configError: string | null;
}

export function validateContractAddress(address: unknown): {
  isValid: boolean;
  address: string | null;
  error: string | null;
} {
  if (!address || typeof address !== 'string') {
    return {
      isValid: false,
      address: null,
      error: 'VITE_CONTRACT_ADDRESS is not set. A deployed Studionet contract address is required for live reads and writes.',
    };
  }

  const trimmed = address.trim();
  const addressRegex = /^0x[0-9a-fA-F]{40}$/;

  if (!addressRegex.test(trimmed)) {
    return {
      isValid: false,
      address: null,
      error: `Invalid VITE_CONTRACT_ADDRESS format: "${trimmed}". Must be a valid 20-byte hex address (0x...)`,
    };
  }

  return {
    isValid: true,
    address: trimmed,
    error: null,
  };
}

export function getContractConfig(): AppContractConfig {
  const rpcUrl = import.meta.env.VITE_GENLAYER_RPC_URL || 'https://studio.genlayer.com/api';
  const rawChainId = import.meta.env.VITE_GENLAYER_CHAIN_ID;
  const chainId = rawChainId ? parseInt(String(rawChainId), 10) : 61999;
  const explorerUrl = import.meta.env.VITE_GENLAYER_EXPLORER_URL || 'https://explorer-studio.genlayer.com';
  const rawContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

  const addressValidation = validateContractAddress(rawContractAddress);

  return {
    rpcUrl,
    chainId,
    explorerUrl,
    contractAddress: addressValidation.address,
    isConfigured: addressValidation.isValid,
    configError: addressValidation.error,
  };
}
