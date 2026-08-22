'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { Navbar } from '@/components/layout/Navbar';
import { WarTicker } from '@/components/layout/WarTicker';
import { BoardHeader } from '@/components/board/BoardHeader';
import { BoardTable } from '@/components/board/BoardTable';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { CreatePostModal } from '@/components/post/CreatePostModal';
import { CounterPostModal } from '@/components/post/CounterPostModal';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { apiGet, errorText, recommendedTopUpCents } from '@/components/system/api';
import { useWallet } from '@/components/system/useWallet';
import { RankedPostView, FightPair, Category } from '@/lib/types';

interface BoardResponse {
  category: Category;
  board: RankedPostView[];
  fights: FightPair[];
  metrics: {
    top_price_to_beat: number;
    gross_market_volume: number;
    total_boosts: number;
    distinct_payers: number;
  };
}

const EMPTY_METRICS = {
  top_price_to_beat: 0,
  gross_market_volume: 0,
  total_boosts: 0,
  distinct_payers: 0,
};

export default function HomePage() {
  const [board, setBoard] = useState<RankedPostView[]>([]);
  const [fights, setFights] = useState<FightPair[]>([]);
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPostForBoost, setSelectedPostForBoost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [selectedPostForCounter, setSelectedPostForCounter] = useState<RankedPostView | null>(null);
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);
  const [pulsingPostId, setPulsingPostId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { balanceCents, refresh: refreshWallet } = useWallet();

  const fetchBoardData = useCallback(async () => {
    const res = await apiGet<BoardResponse>('/api/v1/boards/global');
    setIsLoading(false);

    if (!res.ok || !res.data?.board) {
      setLoadError(errorText(res, 'The arena board could not be loaded.'));
      return;
    }

    setLoadError(null);
    setBoard(res.data.board);
    setFights(res.data.fights ?? []);
    setCategory(res.data.category);
    setMetrics(res.data.metrics ?? EMPTY_METRICS);
  }, []);

  useEffect(() => {
    void fetchBoardData();

    const eventSource = new EventSource('/api/v1/live');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'rank_change') {
          void fetchBoardData();
          setPulsingPostId(data.post_id);
          setToastMessage(`"${data.post_title}" moved to #${data.new_rank}`);
          setTimeout(() => setPulsingPostId(null), 3000);
          setTimeout(() => setToastMessage(null), 5000);
        } else if (data.type === 'new_post') {
          void fetchBoardData();
        }
      } catch {
        // SSE heartbeat frames are not JSON
      }
    };
    eventSource.onerror = () => {
      // Polling below keeps the board fresh when the stream drops.
    };

    const interval = setInterval(() => void fetchBoardData(), 10000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [fetchBoardData]);

  const openTopUpFor = (shortfallCents: number) => {
    setTopUpRecommendation(recommendedTopUpCents(shortfallCents));
    setIsTopUpOpen(true);
  };

  const handleBoostSuccess = (result: { old_rank?: number; new_rank?: number } | unknown) => {
    void fetchBoardData();
    void refreshWallet();
    const ranked = result as { old_rank?: number; new_rank?: number };
    if (ranked?.new_rank) {
      setToastMessage(
        ranked.old_rank && ranked.old_rank !== ranked.new_rank
          ? `Backing settled — moved from #${ranked.old_rank} to #${ranked.new_rank}.`
          : `Backing settled — holding #${ranked.new_rank}.`
      );
    } else {
      setToastMessage('Backing settled.');
    }
    setTimeout(() => setToastMessage(null), 6000);
  };

  const handlePostCreated = (post: unknown) => {
    void fetchBoardData();
    const created = post as { title?: string };
    setToastMessage(`"${created?.title ?? 'Your stance'}" entered the public arena.`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 sm:right-8 z-50 animate-rise" role="status" aria-live="polite">
          <div className="panel rounded-control px-4 py-3 flex items-center gap-2.5 text-dense text-ink">
            <span className="led led-gold" aria-hidden />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <Navbar onOpenCreate={() => setIsCreateOpen(true)} onBalanceUpdated={() => void refreshWallet()} />

      <WarTicker fights={fights} />

      <BoardHeader
        category={category}
        topPrice={metrics.top_price_to_beat}
        totalVolume={metrics.gross_market_volume}
        totalBoosts={metrics.total_boosts}
        distinctPayers={metrics.distinct_payers}
        onOpenCreate={() => setIsCreateOpen(true)}
      />

      <div className="flex-1 pb-16">
        {loadError ? (
          <div className="mx-auto max-w-md px-4">
            <div className="panel rounded-card p-8 text-center">
              <AlertCircle className="mx-auto mb-3 h-7 w-7 text-down" aria-hidden />
              <p role="alert" className="text-dense text-ink-2">
                {loadError}
              </p>
              <button type="button" onClick={() => void fetchBoardData()} className="btn btn-ghost btn-sm mt-5">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="mx-auto max-w-6xl space-y-3 px-4 sm:px-6 lg:px-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-20 w-full rounded-card" />
            ))}
          </div>
        ) : (
          <BoardTable
            board={board}
            onBoost={(post) => {
              setSelectedPostForBoost(post);
              setIsBoostOpen(true);
            }}
            onCounter={(post) => {
              setSelectedPostForCounter(post);
              setIsCounterOpen(true);
            }}
            onLikeExecuted={() => {
              void fetchBoardData();
              void refreshWallet();
            }}
            onInsufficientFunds={openTopUpFor}
            pulsingPostId={pulsingPostId}
          />
        )}
      </div>

      {/* Modals & Drawers */}
      <BoostDrawer
        post={selectedPostForBoost}
        isOpen={isBoostOpen}
        onClose={() => setIsBoostOpen(false)}
        onSuccess={handleBoostSuccess}
      />

      <CounterPostModal
        parentPost={selectedPostForCounter}
        isOpen={isCounterOpen}
        onClose={() => setIsCounterOpen(false)}
        onCounterCreated={handlePostCreated}
      />

      <CreatePostModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onPostCreated={handlePostCreated}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={() => {
          void refreshWallet();
          setIsTopUpOpen(false);
          setToastMessage('Wallet topped up — back a stance whenever you are ready.');
          setTimeout(() => setToastMessage(null), 6000);
        }}
        recommendedCents={topUpRecommendation}
      />
    </div>
  );
}
