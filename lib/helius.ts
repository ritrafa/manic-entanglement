interface File {
  uri: string;
  cdn_uri: string;
  mime: string;
}

interface Metadata {
  attributes: { value: string; trait_type: string }[];
  description: string;
  name: string;
  symbol: string;
  token_standard: string;
}

interface Links {
  image: string;
  animation_url?: string;
  external_url?: string;
}

interface Content {
  $schema: string;
  json_uri: string;
  files: File[];
  metadata: Metadata;
  links: Links;
}

interface Authority {
  address: string;
  scopes: string[];
}

interface Compression {
  eligible: boolean;
  compressed: boolean;
  data_hash: string;
  creator_hash: string;
  asset_hash: string;
  tree: string;
  seq: number;
  leaf_id: number;
}

interface Grouping {
  group_key: string;
  group_value: string;
}

interface Royalty {
  royalty_model: string;
  target: string | null;
  percent: number;
  basis_points: number;
  primary_sale_happened: boolean;
  locked: boolean;
}

interface Creator {
  address: string;
  share: number;
  verified: boolean;
}

interface Ownership {
  frozen: boolean;
  delegated: boolean;
  delegate: string | null;
  ownership_model: string;
  owner: string;
}

interface Supply {
  print_max_supply: number;
  print_current_supply: number;
  edition_nonce: number | null;
}

interface Item {
  interface: string;
  id: string;
  content: Content;
  authorities: Authority[];
  compression: Compression;
  grouping: Grouping[];
  royalty: Royalty;
  creators: Creator[];
  ownership: Ownership;
  supply: Supply | null;
  mutable: boolean;
  burnt: boolean;
}

interface AssetsResponse {
  total: number;
  limit: number;
  page: number;
  items: Item[];
}

const url = 'https://kaila-vjymzu-fast-mainnet.helius-rpc.com';

const getRelatedAssetsByOwner = async (ownerAddress: string): Promise<Item[]> => {
  if (!ownerAddress) {
    throw new Error('Owner address is required');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'my-id',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: ownerAddress,
        page: 1, // Starts at 1
        limit: 1000,
      },
    }),
  });

  //const { assets }: { assets: AssetsResponse } = await response.json();
  //const relatedResults = assets.items.filter(item =>
  //    item.grouping.some(group => group.group_value === 'h76khMf58obcfMnnQpvU9Snh71DtGQBzj2WoQwxndjL')
  //);
  //return assets;

  /*
  const { result } = await response.json();
  return result.items;
  */

  const { result }: { result: AssetsResponse } = await response.json();

  if (!result || !result.items) {
    throw new Error('Unexpected response format');
  }

  const relatedResults = result.items.filter((item: Item) =>
    item.grouping.some(group => group.group_value === 'h76khMf58obcfMnnQpvU9Snh71DtGQBzj2WoQwxndjL')
  );

  return relatedResults;
};

export { getRelatedAssetsByOwner };
