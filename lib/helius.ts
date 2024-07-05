

const url = 'https://kaila-vjymzu-fast-mainnet.helius-rpc.com';

const getRelatedAssetsByOwner = async (ownerAddress: string): Promise<any> => {
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

  const {result} = await response.json();
  const items = result.items;
  const reducedItems = items.map((item: { content: any; plugins: any; grouping: any; }) => ({
    file: item.content?.files[0]?.cdn_uri,
    data: item.plugins?.attributes?.data?.attribute_list,
    collection: item.grouping[0]?.group_value
}));

  return reducedItems;
};

export { getRelatedAssetsByOwner };
