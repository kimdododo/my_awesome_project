'use client';

// BrandGrid — habit-tracker 스타일 102 브랜드 그리드 + 휴리스틱 점수 배지
//
// 입력:
//   leads        : Dashboard 의 leads 배열
//   brandStages  : { [brand]: { stage, updatedAt } }
//   events       : 클라이언트 캐시된 brand events (없으면 빈배열)
//   onSelect     : (brand) => void   (클릭 시 호출)
//   onChangeStage: (brand, newStage) => void   (점수 카드의 단계 변경)
//
// 점수는 src/lib/leadScore.js 의 휴리스틱으로 계산.
// 색상은 STAGE 팔레트와 합치, 점수가 높을수록 채도/대비 강조.

import React, { useMemo, useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { scoreLead, compareByScoreDesc } from '../lib/leadScore.js';

// Dashboard 와 동일한 stage id/label 사용
const STAGE_META = {
  pending:  { label: '미발송', bg: 'bg-slate-100',   border: 'border-slate-200',   text: 'text-slate-700',   accent: 'bg-slate-400'  },
  sent:     { label: '발송',   bg: 'bg-sky-50',      border: 'border-sky-200',     text: 'text-sky-900',     accent: 'bg-sky-500'    },
  replied:  { label: '회신',   bg: 'bg-violet-50',   border: 'border-violet-200',  text: 'text-violet-900',  accent: 'bg-violet-500' },
  meeting:  { label: '미팅',   bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-900',  accent: 'bg-orange-500' },
  won:      { label: '성사',   bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-950', accent: 'bg-emerald-500'},
};
const STAGE_IDS = ['pending', 'sent', 'replied', 'meeting', 'won'];

function scoreColor(score) {
  if (score >= 70) return 'bg-emerald-600 text-white';
  if (score >= 50) return 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200';
  if (score >= 30) return 'bg-amber-100 text-amber-900 ring-1 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
}

function eventsByBrand(events) {
  const m = new Map();
  for (const e of (events || [])) {
    if (!e?.brand) continue;
    const key = e.brand.trim().toLowerCase();
    const arr = m.get(key) || [];
    arr.push(e);
    m.set(key, arr);
  }
  return m;
}

export default function BrandGrid({ leads = [], brandStages = {}, events = [], onSelect, onChangeStage }) {
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all'); // 'all' | stage id
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'name'
  const [selected, setSelected] = useState(null); // brand name

  const evtMap = useMemo(() => eventsByBrand(events), [events]);

  const enriched = useMemo(() => {
    return leads.map(lead => {
      const stage = brandStages[lead.brand]?.stage || 'pending';
      const brandEvents = evtMap.get(lead.brand.trim().toLowerCase()) || [];
      const { score, reasons } = scoreLead({ lead, currentStage: stage, events: brandEvents });
      return { lead, stage, score, reasons, eventCount: brandEvents.length };
    });
  }, [leads, brandStages, evtMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = enriched;
    if (q) out = out.filter(x => x.lead.brand.toLowerCase().includes(q) || (x.lead.countries || []).some(c => c.toLowerCase().includes(q)));
    if (stageFilter !== 'all') out = out.filter(x => x.stage === stageFilter);
    if (sortBy === 'score') out = [...out].sort(compareByScoreDesc);
    else out = [...out].sort((a, b) => a.lead.brand.localeCompare(b.lead.brand, 'ko'));
    return out;
  }, [enriched, query, stageFilter, sortBy]);

  const stageCounts = useMemo(() => {
    const c = { all: enriched.length, pending: 0, sent: 0, replied: 0, meeting: 0, won: 0 };
    enriched.forEach(x => { c[x.stage] = (c[x.stage] || 0) + 1; });
    return c;
  }, [enriched]);

  const selectedRow = selected ? enriched.find(x => x.lead.brand === selected) : null;

  return (
    <div className="space-y-4">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="브랜드 / 국가 검색"
            className="rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm outline-none focus:border-slate-900"
          />
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <Filter size={12} /> <span className="font-semibold">정렬</span>
          <button
            onClick={() => setSortBy('score')}
            className={'rounded-md px-2 py-1 text-xs font-semibold transition ' + (sortBy === 'score' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
          >점수</button>
          <button
            onClick={() => setSortBy('name')}
            className={'rounded-md px-2 py-1 text-xs font-semibold transition ' + (sortBy === 'name' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
          >이름</button>
        </div>
      </div>

      {/* 단계 필터 칩 */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStageFilter('all')}
          className={'rounded-full px-3 py-1 text-xs font-semibold transition ' + (stageFilter === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
        >
          전체 <span className="ml-1 opacity-80 tabular-nums">{stageCounts.all}</span>
        </button>
        {STAGE_IDS.map(id => {
          const m = STAGE_META[id];
          const on = stageFilter === id;
          return (
            <button
              key={id}
              onClick={() => setStageFilter(id)}
              className={'rounded-full px-3 py-1 text-xs font-semibold transition border ' + (on ? `${m.bg} ${m.text} ${m.border} ring-1 ring-current/10` : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
            >
              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${m.accent}`} />
              {m.label} <span className="ml-1 opacity-80 tabular-nums">{stageCounts[id] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* 그리드 */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))' }}
      >
        {filtered.map(({ lead, stage, score }) => {
          const meta = STAGE_META[stage] || STAGE_META.pending;
          const isSelected = selected === lead.brand;
          return (
            <button
              key={lead.brand + (lead.countries?.[0] || '')}
              type="button"
              onClick={() => { setSelected(lead.brand); onSelect?.(lead.brand); }}
              className={[
                'group relative flex aspect-square flex-col items-stretch justify-between overflow-hidden rounded-lg border p-1.5 text-left transition',
                meta.bg, meta.border, meta.text,
                isSelected ? 'ring-2 ring-slate-900 shadow-md' : 'hover:ring-1 hover:ring-slate-300 hover:shadow-sm',
              ].join(' ')}
              title={`${lead.brand} · ${meta.label} · 점수 ${score}`}
            >
              {/* 점수 배지 */}
              <span className={`absolute right-1 top-1 rounded-md px-1 py-0.5 text-[9px] font-bold tabular-nums leading-tight ${scoreColor(score)}`}>
                {score}
              </span>
              {/* 브랜드명 */}
              <span className="line-clamp-2 pr-7 text-[10.5px] font-semibold leading-tight">{lead.brand}</span>
              {/* 국가 + 우선순위 */}
              <span className="flex items-end justify-between gap-1 text-[9px]">
                <span className="line-clamp-1 opacity-75">{(lead.countries || []).slice(0,2).join('·') || '—'}</span>
                {lead.priority && (
                  <span className="rounded bg-white/70 px-1 font-bold opacity-80">{lead.priority}</span>
                )}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
            조건에 맞는 브랜드가 없습니다
          </div>
        )}
      </div>

      {/* 선택된 브랜드 상세 */}
      {selectedRow && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">선택</div>
              <div className="text-lg font-bold text-slate-900">{selectedRow.lead.brand}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {selectedRow.lead.priority || '—'} · {(selectedRow.lead.countries || []).join(', ') || '국가 미지정'} · {selectedRow.lead.platform || '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">휴리스틱 점수</div>
              <div className={`mt-0.5 inline-flex items-center rounded-md px-2 py-1 text-xl font-bold tabular-nums ${scoreColor(selectedRow.score)}`}>
                {selectedRow.score}<span className="ml-1 text-xs opacity-70">/100</span>
              </div>
            </div>
          </div>

          {/* 단계 변경 */}
          {onChangeStage && (
            <div className="mb-3 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">단계</span>
              {STAGE_IDS.map(id => {
                const m = STAGE_META[id];
                const on = selectedRow.stage === id;
                return (
                  <button
                    key={id}
                    onClick={() => onChangeStage(selectedRow.lead.brand, id)}
                    className={'rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ' + (on ? `${m.bg} ${m.text} ${m.border}` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 점수 근거 */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">점수 근거</div>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {selectedRow.reasons.map((r, i) => {
                const positive = r.delta > 0;
                const negative = r.delta < 0;
                return (
                  <li key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
                    <span className="text-slate-700">{r.label}</span>
                    <span className={'font-bold tabular-nums ' + (positive ? 'text-emerald-700' : negative ? 'text-rose-700' : 'text-slate-500')}>
                      {r.delta > 0 ? '+' : ''}{r.delta}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="font-semibold">점수 색상:</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded bg-emerald-600" /> 70+</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded bg-emerald-100 ring-1 ring-emerald-200" /> 50-69</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded bg-amber-100 ring-1 ring-amber-200" /> 30-49</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded bg-slate-100 ring-1 ring-slate-200" /> &lt;30</span>
      </div>
    </div>
  );
}
