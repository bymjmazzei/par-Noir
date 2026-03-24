/**
 * DataCollectionManager resolves CustomEvent handlers asynchronously. Tests register
 * listeners so those promises complete without a real UI.
 */
export function installIdentityEventAutoResolve(): () => void {
  const onDataCollection = (e: Event) => {
    const ev = e as CustomEvent<{
      request?: { dataPoints?: string[] };
      resolve?: (v: unknown) => void;
    }>;
    ev.detail?.resolve?.({
      success: true,
      requestId: 'mock-req-id',
      proofs: [],
      dataPoints: ev.detail?.request?.dataPoints ?? [],
      timestamp: new Date().toISOString(),
    });
  };

  const onStandard = (e: Event) => {
    const ev = e as CustomEvent<{
      request?: { dataPointId?: string };
      dataPoint?: unknown;
      resolve?: (v: unknown) => void;
    }>;
    ev.detail?.resolve?.({
      success: true,
      dataPointId: ev.detail?.request?.dataPointId,
      proof: {},
      dataPoint: ev.detail?.dataPoint,
    });
  };

  const onProposal = (e: Event) => {
    const ev = e as CustomEvent<{ resolve?: (v: unknown) => void }>;
    ev.detail?.resolve?.({ success: true, proposalId: 'mock-proposal-id' });
  };

  const onVote = (e: Event) => {
    const ev = e as CustomEvent<{ resolve?: (v: unknown) => void }>;
    ev.detail?.resolve?.({ success: true, voteId: 'mock-vote-id' });
  };

  window.addEventListener('identity:dataCollection', onDataCollection);
  window.addEventListener('identity:standardDataPoint', onStandard);
  window.addEventListener('identity:dataPointProposal', onProposal);
  window.addEventListener('identity:proposalVote', onVote);

  return () => {
    window.removeEventListener('identity:dataCollection', onDataCollection);
    window.removeEventListener('identity:standardDataPoint', onStandard);
    window.removeEventListener('identity:dataPointProposal', onProposal);
    window.removeEventListener('identity:proposalVote', onVote);
  };
}
