import { createClient, chains } from 'genlayer-js';
import type { EIP1193Provider } from '../wallet/types';
import { getContractConfig } from './config';

export function getReadClient() {
  const config = getContractConfig();
  return createClient({
    chain: chains.studionet,
    endpoint: config.rpcUrl,
  });
}

export function getWriteClient(provider: EIP1193Provider, accountAddress: string) {
  const config = getContractConfig();
  return createClient({
    chain: chains.studionet,
    endpoint: config.rpcUrl,
    provider: provider as any,
    account: accountAddress as any,
  });
}
