import type {
  RecoveryCustodianRow,
  RecoveryDeliveryRow,
  RecoveryOwnerRow,
  RecoveryRelayStore,
  RecoveryRequestRow,
} from './recoveryRelayService';

/** In-memory RecoveryRelayStore for route tests. */
export function createMemoryRecoveryRelayStore(): RecoveryRelayStore & {
  owners: Map<string, RecoveryOwnerRow>;
  custodians: Map<string, RecoveryCustodianRow>;
  requests: Map<string, RecoveryRequestRow>;
  deliveries: Map<string, RecoveryDeliveryRow>;
} {
  const owners = new Map<string, RecoveryOwnerRow>();
  const custodians = new Map<string, RecoveryCustodianRow>();
  const requests = new Map<string, RecoveryRequestRow>();
  const deliveries = new Map<string, RecoveryDeliveryRow>();
  const ck = (ownerHash: string, custodianId: string) => `${ownerHash}|${custodianId}`;
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  return {
    owners,
    custodians,
    requests,
    deliveries,
    async getOwner(ownerHash) {
      const row = owners.get(ownerHash);
      return row ? clone(row) : null;
    },
    async upsertOwner(row) {
      owners.set(row.ownerHash, clone(row));
    },
    async listCustodians(ownerHash) {
      return [...custodians.values()].filter((c) => c.ownerHash === ownerHash).map(clone);
    },
    async getCustodian(ownerHash, custodianId) {
      const row = custodians.get(ck(ownerHash, custodianId));
      return row ? clone(row) : null;
    },
    async listCustodiansByCustodianPn(custodianPnHash) {
      return [...custodians.values()]
        .filter((c) => c.custodianPnHash === custodianPnHash && c.status === 'accepted')
        .map(clone);
    },
    async upsertCustodian(row) {
      custodians.set(ck(row.ownerHash, row.custodianId), clone(row));
    },
    async getRequest(requestId) {
      const row = requests.get(requestId);
      return row ? clone(row) : null;
    },
    async insertRequest(row) {
      requests.set(row.requestId, clone(row));
    },
    async updateRequest(requestId, patch) {
      const row = requests.get(requestId);
      if (row) requests.set(requestId, { ...row, ...clone(patch), updatedAt: new Date().toISOString() });
    },
    async listRequestsForOwner(ownerHash) {
      return [...requests.values()].filter((r) => r.ownerHash === ownerHash).map(clone);
    },
    async putCustodyDelivery(row) {
      for (const [id, d] of deliveries) {
        if (d.kind === 'custody' && d.ownerHash === row.ownerHash && d.custodianId === row.custodianId) {
          deliveries.delete(id);
        }
      }
      deliveries.set(row.id, clone(row));
    },
    async listCustodyDeliveries(ownerHash, custodianId) {
      return [...deliveries.values()]
        .filter((d) => d.kind === 'custody' && d.ownerHash === ownerHash && d.custodianId === custodianId)
        .map(clone);
    },
    async getDelivery(id) {
      const row = deliveries.get(id);
      return row ? clone(row) : null;
    },
    async deleteDelivery(id) {
      deliveries.delete(id);
    },
    async deleteCustodyDeliveriesForOwner(ownerHash) {
      for (const [id, d] of deliveries) {
        if (d.kind === 'custody' && d.ownerHash === ownerHash) deliveries.delete(id);
      }
    },
    async putReleaseDelivery(row) {
      deliveries.set(row.id, clone(row));
    },
    async listReleaseDeliveries(requestId) {
      return [...deliveries.values()].filter((d) => d.kind === 'release' && d.requestId === requestId).map(clone);
    },
  };
}
