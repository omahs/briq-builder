import { Provider } from '@/starknet_wrapper';
import getBaseUrl from '@/url';

import { CHAIN_NETWORKS, getCurrentNetwork } from './Network';

export function getProvider(): Provider {
    return getProviderForNetwork(getCurrentNetwork());
}

export function getProviderForNetwork(network: CHAIN_NETWORKS): Provider {
    return {
        'mock': new Provider({ baseUrl: getBaseUrl() + '/mock_chain' }),
        'localhost': new Provider({ baseUrl: 'http://localhost:5050' }),
        'starknet-testnet': new Provider({ network: 'goerli-alpha' }),
        'starknet-testnet-legacy': new Provider({ network: 'goerli-alpha' }),
        'starknet-mainnet': new Provider({ network: 'mainnet-alpha' }),
    }[network];
}