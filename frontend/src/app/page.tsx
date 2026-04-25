'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Stats, Trait } from '@/lib/types';
import { TraitRoll } from '@/components/TraitRoll';
import { StatAllocatorModal } from '@/components/StatAllocatorModal';
import { POINT_POOL } from '@/lib/format';

const MAX_REROLLS = 1;

export default function NewGamePage() {
  const router = useRouter();
  const [name, setName] = useState('');

  const [rolledTraits, setRolledTraits] = useState<Trait[] | null>(null);
  const [rerollsLeft, setRerollsLeft] = useState(MAX_REROLLS);
  const [rolling, setRolling] = useState(false);

  const [allocOpen, setAllocOpen] = useState(false);
  const [chosenStats, setChosenStats] = useState<Stats | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doRoll = async (isReroll: boolean) => {
    setRolling(true);
    setError(null);
    try {
      const res = await api.rollTraits();
      setRolledTraits(res.traits);
      // Trait set changes the allocator's floor; invalidate any prior allocation.
      setChosenStats(null);
      if (isReroll) setRerollsLeft((n) => Math.max(0, n - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRolling(false);
    }
  };

  const canStart =
    rolledTraits !== null && chosenStats !== null && !loading;

  const start = async () => {
    if (!rolledTraits || !chosenStats) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.startGame({
        name,
        traitIds: rolledTraits.map((t) => t.id),
        // Backend uses DEFAULT_BACKGROUND_ID when omitted.
        backgroundId: '',
        stats: chosenStats,
      });
      router.push(`/game/${res.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="hero">
        <h1>CS2 电竞选手人生模拟器</h1>
        <p>从青训替补到登上赛场中央。每一次选择都算数。</p>
      </div>

      <div className="panel">
        <div className="panel-title">选手名片</div>
        <input
          type="text"
          value={name}
          maxLength={16}
          placeholder="输入选手 ID（例如：nex / zyr0o）"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="panel">
        <div className="panel-title">特质（随机）</div>
        {rolledTraits ? (
          <TraitRoll
            traits={rolledTraits}
            rerollsLeft={rerollsLeft}
            onReroll={() => doRoll(true)}
            rolling={rolling}
          />
        ) : (
          <div>
            <div className="stat-desc" style={{ marginBottom: 10 }}>
              特质随机抽取，有正面、负面和中性。抽到后可以重抽 1 次。
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={rolling}
              onClick={() => doRoll(false)}
            >
              {rolling ? '抽取中…' : '抽取 3 个特质'}
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          属性分配（底线之上再分 {POINT_POOL} 点）
        </div>
        {!rolledTraits ? (
          <div className="stat-desc">请先抽取特质。</div>
        ) : chosenStats ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <span className="delta-chip up">智力 {chosenStats.intelligence}</span>
            <span className="delta-chip up">敏捷 {chosenStats.agility}</span>
            <span className="delta-chip up">经验 {chosenStats.experience}</span>
            <span className="delta-chip up">金钱 {chosenStats.money}</span>
            <span className="delta-chip up">心态 {chosenStats.mentality}</span>
            <span className="delta-chip up">体质 {chosenStats.constitution}</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setAllocOpen(true)}
              style={{ marginLeft: 8 }}
            >
              重新分配
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => setAllocOpen(true)}
          >
            打开分配面板
          </button>
        )}
      </div>

      {error && <div className="error">错误：{error}</div>}

      <div style={{ marginTop: 12 }}>
        <button
          className="primary-button"
          disabled={!canStart}
          onClick={start}
        >
          {loading ? '创建中…' : '开始生涯'}
        </button>
      </div>

      <StatAllocatorModal
        open={allocOpen}
        traits={rolledTraits ?? []}
        onCancel={() => setAllocOpen(false)}
        onConfirm={(s) => {
          setChosenStats(s);
          setAllocOpen(false);
        }}
      />
    </div>
  );
}
