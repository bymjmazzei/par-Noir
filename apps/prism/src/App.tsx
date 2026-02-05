/**
 * Prism — par Noir Auditor Program
 * DMCA content review for Rays
 * Deployed at prism.parnoir.com
 */

import React, { useState, useEffect } from 'react';
import { Shield, Users, FileCheck, LogOut, ShieldCheck } from 'lucide-react';
import { ApplyModal } from './components/ApplyModal';
import { RayView } from './components/RayView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { fetchAdminCheck, fetchAdminStats, fetchReputation, submitRayApply, ReputationResult } from './services/prismApi';

function LockedView({ onApplyOpen }: { onApplyOpen: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold tracking-tight">Prism</span>
            <span className="text-neutral-500 text-sm">par Noir Auditor Program</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-2xl mx-auto px-6 py-16 md:py-24">
        <div className="text-center space-y-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Content Auditors for par Noir
          </h1>
          <p className="text-lg text-neutral-400 leading-relaxed">
            Prism is the par Noir auditor program. Rays review DMCA-flagged content
            and reach consensus to approve or deny before content goes live.
          </p>

          <div className="grid gap-6 py-8 md:grid-cols-3 text-left">
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5">
              <Shield className="h-8 w-8 text-neutral-400 mb-3" />
              <h2 className="font-semibold mb-2">DMCA Review</h2>
              <p className="text-sm text-neutral-400">
                Content flagged by the DMCA bot or user reports is reviewed by Rays
                before it can be indexed.
              </p>
            </div>
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5">
              <Users className="h-8 w-8 text-neutral-400 mb-3" />
              <h2 className="font-semibold mb-2">Consensus-Based</h2>
              <p className="text-sm text-neutral-400">
                Two Rays must agree to approve or deny. No single person controls
                content visibility.
              </p>
            </div>
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5">
              <FileCheck className="h-8 w-8 text-neutral-400 mb-3" />
              <h2 className="font-semibold mb-2">Simple Review</h2>
              <p className="text-sm text-neutral-400">
                Swipe left to deny, right to approve. Review content, reach
                consensus, earn reputation.
              </p>
            </div>
          </div>

          <div className="pt-8 space-y-4">
            <button
              type="button"
              onClick={onApplyOpen}
              className="px-8 py-3 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Apply to become a Ray
            </button>
            <p className="text-sm text-neutral-500">
              Applicants must meet reputation requirements and share required data
              points for payment.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-neutral-800 mt-24 py-8 px-6">
        <div className="max-w-4xl mx-auto text-center text-sm text-neutral-500">
          Prism · par Noir infrastructure
        </div>
      </footer>
    </div>
  );
}

function UnlockedView() {
  const { session, signOut } = useAuth();
  const [adminState, setAdminState] = useState<{ isAdmin: boolean; isBootstrapMode: boolean } | null>(null);
  const [stats, setStats] = useState<{ pending: number; approved: number; denied: number } | null>(null);
  const [reputation, setReputation] = useState<ReputationResult | null>(null);
  const [applyStatus, setApplyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!session?.accessToken) return;
    setApplyStatus('loading');
    setApplyError(null);
    try {
      await submitRayApply(session.accessToken);
      setApplyStatus('success');
    } catch (e: any) {
      setApplyError(e?.message || 'Apply failed');
      setApplyStatus('error');
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    fetchAdminCheck(session.accessToken).then(setAdminState);
    fetchReputation(session.accessToken).then(setReputation).catch(() => setReputation(null));
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken || !adminState?.isAdmin) return;
    fetchAdminStats(session.accessToken).then(setStats);
    const interval = setInterval(() => {
      fetchAdminStats(session.accessToken).then(setStats);
    }, 30000);
    return () => clearInterval(interval);
  }, [session?.accessToken, adminState?.isAdmin]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold tracking-tight">Prism</span>
            <span className="text-neutral-500 text-sm">par Noir Auditor Program</span>
            {adminState?.isAdmin && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-amber-900/50 text-amber-400 border border-amber-800">
                <ShieldCheck className="h-3 w-3" />
                Admin{adminState?.isBootstrapMode ? ' · Bootstrap' : ''}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-8">
        {reputation !== null && (
          <div className="mb-8 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-400">Reputation Score</span>
              <span
                className={`text-lg font-bold ${reputation.eligible ? 'text-emerald-400' : 'text-amber-400'}`}
              >
                {reputation.score}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              {reputation.eligible
                ? 'Eligible for Ray application'
                : 'Build activity, content, and tenure to qualify'}
            </p>
            {reputation.eligible && (
              <button
                type="button"
                onClick={handleApply}
                disabled={applyStatus === 'loading' || applyStatus === 'success'}
                className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {applyStatus === 'loading'
                  ? 'Submitting...'
                  : applyStatus === 'success'
                    ? 'Application submitted'
                    : 'Submit Ray application'}
              </button>
            )}
            {applyError && <p className="mt-2 text-xs text-red-400">{applyError}</p>}
          </div>
        )}
        {adminState?.isAdmin && stats !== null && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{stats.pending}</div>
              <div className="text-xs text-neutral-500">Pending</div>
            </div>
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-emerald-500">{stats.approved}</div>
              <div className="text-xs text-neutral-500">Approved</div>
            </div>
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-500">{stats.denied}</div>
              <div className="text-xs text-neutral-500">Denied</div>
            </div>
          </div>
        )}
        <div className="mb-6 text-center">
          <h2 className="text-lg font-medium text-neutral-400">
            Ray View · {session?.pnIdentifier || session?.did || 'Ray'}
          </h2>
        </div>
        <RayView />
      </main>
    </div>
  );
}

function AppContent() {
  const [applyOpen, setApplyOpen] = useState(false);
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  if (session) {
    return <UnlockedView />;
  }

  return (
    <>
      <LockedView onApplyOpen={() => setApplyOpen(true)} />
      <ApplyModal open={applyOpen} onClose={() => setApplyOpen(false)} />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
