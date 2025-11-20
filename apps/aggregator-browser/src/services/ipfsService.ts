/**
 * IPFS Service for Aggregator Browser
 * Simplified IPFS operations using ipfs-http-client
 */

interface IPFSGateway {
  url: string;
  name: string;
}

export class IPFSService {
  private readonly uploadGateways: IPFSGateway[] = [
    { url: 'https://ipfs.infura.io:5001', name: 'Infura' },
    { url: 'https://gateway.pinata.cloud', name: 'Pinata' },
    { url: 'https://cloudflare-ipfs.com', name: 'Cloudflare' },
    { url: 'https://dweb.link', name: 'DWeb' }
  ];

  private readonly downloadGateways: IPFSGateway[] = [
    { url: 'https://ipfs.io', name: 'IPFS.io' },
    { url: 'https://gateway.pinata.cloud', name: 'Pinata' },
    { url: 'https://cloudflare-ipfs.com', name: 'Cloudflare' },
    { url: 'https://dweb.link', name: 'DWeb' }
  ];

  /**
   * Upload data to IPFS
   */
  async uploadToIPFS(data: string): Promise<string> {
    const uploadPromises = this.uploadGateways.map(gateway => 
      this.uploadToGateway(data, gateway)
    );

    try {
      const results = await Promise.allSettled(uploadPromises);
      const successful = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter(r => r !== null);

      if (successful.length === 0) {
        throw new Error('All IPFS gateways failed');
      }

      const cid = successful[0];
      if (!cid) {
        throw new Error('IPFS upload failed - invalid CID returned');
      }
      return cid;
    } catch (error) {
      throw new Error('IPFS upload failed - cannot proceed securely');
    }
  }

  /**
   * Upload to specific gateway using HTTP API
   */
  private async uploadToGateway(data: string, gateway: IPFSGateway): Promise<string> {
    try {
      // Create FormData for multipart/form-data
      const formData = new FormData();
      const blob = new Blob([data], { type: 'application/json' });
      formData.append('file', blob, 'data.json');

      const response = await fetch(`${gateway.url}/api/v0/add`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Gateway ${gateway.name} returned ${response.status}`);
      }

      const result = await response.json();
      if (!result.Hash) {
        throw new Error(`Gateway ${gateway.name} returned invalid response`);
      }

      return result.Hash;
    } catch (error) {
      throw new Error(`IPFS gateway upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download data from IPFS
   */
  async downloadFromIPFS(cid: string): Promise<string> {
    for (const gateway of this.downloadGateways) {
      try {
        const response = await fetch(`${gateway.url}/ipfs/${cid}`, {
          headers: {
            'Accept': 'application/json, text/plain, */*'
          }
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.text();
        if (!data || data.length < 10) {
          continue;
        }

        return data;
      } catch (error) {
        continue;
      }
    }

    throw new Error('All IPFS gateways failed for download');
  }
}

export const ipfsService = new IPFSService();

