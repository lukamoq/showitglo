'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { WarTicker } from '@/components/layout/WarTicker';
import { BoardHeader } from '@/components/board/BoardHeader';
import { BoardTable } from '@/components/board/BoardTable';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { CreatePostModal } from '@/components/post/CreatePostModal';
import { CounterPostModal } from '@/components/post/CounterPostModal';
import { ShareCardModal } from '@/components/post/ShareCardModal';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { RankedPostView, WarEvent, Category } from '@/lib/types';
import { Sparkles } from 'lucide-react';

export default function HomePage() {
  const [board, setBoard] = useState<RankedPostView[]>([]);
  const [wars, setWars] = useState<WarEvent[]>([]);
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [metrics, setMetrics] = useState({
    top_price_to_beat: 0,
    gross_market_volume: 0,
    total_boosts: 0,
    distinct_payers: 0,
  });

  const [selectedPostForBoost, setSelectedPostForBoost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [selectedPostForCounter, setSelectedPostForCounter] = useState<RankedPostView | null>(null);
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [sharePost, setSharePost] = useState<RankedPostView | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [pulsingPostId, setPulsingPostId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchBoardData = async () => {
    try {
      const res = await fetch('/api/v1/boards/global');
      const data = await res.json();
      if (data.board) {
        setBoard(data.board);
        setWars(data.wars || []);
        setCategory(data.category);
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Error fetching board:', err);
    }
  };

  useEffect(() => {
    fetchBoardData();

    const eventSource = new EventSource('/api/v1/live');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'rank_change') {
          fetchBoardData();
          setPulsingPostId(data.post_id);
          setToastMessage(`⚡ "${data.post_title}" backed (+${data.kind || 'spend'}) -> #${data.new_rank}!`);
          setTimeout(() => setPulsingPostId(null), 3000);
          setTimeout(() => setToastMessage(null), 5000);
        } else if (data.type === 'new_post') {
          fetchBoardData();
        }
      } catch (e) {
        // SSE heartbeat
      }
    };

    const interval = setInterval(fetchBoardData, 10000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, []);

  const handleOpenBoost = (post: RankedPostView) => {
    setSelectedPostForBoost(post);
    setIsBoostOpen(true);
  };

  const handleOpenCounter = (post: RankedPostView) => {
    setSelectedPostForCounter(post);
    setIsCounterOpen(true);
  };

  const handleBoostSuccess = (result: any) => {
    fetchBoardData();
    setPulsingPostId(result.interaction?.post_id || result.boost?.post_id);
    setToastMessage(`🎉 Interaction confirmed! Moved from #${result.old_rank} to #${result.new_rank}!`);
    setTimeout(() => setPulsingPostId(null), 4000);
    setTimeout(() => setToastMessage(null), 6000);
  };

  const handlePostCreated = (post: any) => {
    fetchBoardData();
    setToastMessage(`✨ Opinion "${post.title}" entered the public arena!`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 sm:right-8 z-50 animate-rank-climb">
          <div className="px-4 py-3 rounded-2xl glass-panel border border-amber-500/50 bg-black/90 shadow-2xl text-xs font-semibold text-amber-300 flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <Navbar onOpenCreate={() => setIsCreateOpen(true)} />

      {/* War Ticker */}
      <WarTicker wars={wars} />

      {/* Hero Header */}
      <BoardHeader
        category={category}
        topPrice={metrics.top_price_to_beat}
        totalVolume={metrics.gross_market_volume}
        totalBoosts={metrics.total_boosts}
        distinctPayers={metrics.distinct_payers}
        onOpenCreate={() => setIsCreateOpen(true)}
      />

      {/* Leaderboard Table with 1¢ Like & Counter Controls */}
      <div className="flex-1 pb-16">
        <BoardTable
          board={board}
          onBoost={handleOpenBoost}
          onCounter={handleOpenCounter}
          onLikeExecuted={fetchBoardData}
          onInsufficientFunds={() => setIsTopUpOpen(true)}
          pulsingPostId={pulsingPostId}
        />
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

      <ShareCardModal
        post={sharePost}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={0}
        onTopUpSuccess={() => {
          fetchBoardData();
          setIsTopUpOpen(false);
        }}
      />
    </div>
  );
}
