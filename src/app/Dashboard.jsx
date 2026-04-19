'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend,
} from 'recharts';
import {
  Plus, ArrowUpRight, ArrowDownRight, Minus, Search,
  Cloud, CloudOff, Loader2, Trash2, X,
  Pencil, ChevronRight,
} from 'lucide-react';
import { SEED } from '../data/seed';
import { INITIAL_WEEKLY_AD_ROWS } from '../data/weeklyAdsSeed';
import { DAILY_AD_ANCHOR_DEFAULT } from '../lib/dailyAdsDates';

/* ============================================================
   CONFIG
   ============================================================ */
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const RAW = SEED;
const INITIAL_LEADS = RAW.l.map(x => ({
  brand: x.b, priority: x.p, countries: x.c, platform: x.pl, email: x.e,
}));
const INITIAL_BLOG = RAW.b.map(x => ({ date: x.d, views: x.v }));
const INITIAL_DAILY_AD_ROWS = RAW.a.map(r => ({
  o: r.o, ch: r.ch, imp: r.imp, clk: r.clk, cv: r.cv, co: r.co,
}));

function normalizeDailyAdRows(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out = [];
  for (const r of arr) {
    if (!r || r.ch == null || r.o == null) return null;
    const ch = String(r.ch);
    if (!['N', 'G', 'M'].includes(ch)) return null;
    const o = Number(r.o);
    if (!Number.isFinite(o)) return null;
    out.push({
      o,
      ch,
      imp: Math.max(0, Number(r.imp) || 0),
      clk: Math.max(0, Number(r.clk) || 0),
      cv: Math.max(0, Number(r.cv) || 0),
      co: Math.max(0, Number(r.co) || 0),
    });
  }
  return out;
}

const STAGES = [
  { id: 'pending', label: '미발송', color: '#a3a3a3', bg: 'bg-white',  text: 'text-neutral-800' },
  { id: 'sent',    label: '발송',   color: '#737373', bg: 'bg-white',   text: 'text-neutral-800' },
  { id: 'replied', label: '회신',   color: '#525252', bg: 'bg-white',   text: 'text-neutral-800' },
  { id: 'meeting', label: '미팅',   color: '#404040', bg: 'bg-white',   text: 'text-neutral-800' },
  { id: 'won',     label: '성사',   color: '#262626', bg: 'bg-white',   text: 'text-neutral-900' },
];
const STAGE_ORDER = { pending: 0, sent: 1, replied: 2, meeting: 3, won: 4 };

/** 막대 차트에서 가장 최신 구간만 강조 */
const CHART_BAR_LATEST = '#1d4ed8';
const CHART_BAR_MUTED = '#cbd5e1';
const CHART_BAR_MUTED_LI = '#94a3b8';

/* ============================================================
   UTILITIES
   ============================================================ */
const fmtNum = n => (n ?? 0).toLocaleString('ko-KR');
const fmtPct = (n, d = 0) => (n == null ? '—' : (n * 100).toFixed(d) + '%');

function fmtKoreanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wk = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')} (${wk})`;
}

function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function daysBefore(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* ============================================================
   UI PRIMITIVES
   ============================================================ */

function Delta({ curr, prev, invert = false, unit = '', small = false }) {
  if (prev == null || prev === 0) {
    return <span className={'text-neutral-400 font-medium ' + (small ? 'text-xs' : 'text-sm')}>— 전주 없음</span>;
  }
  const diff = curr - prev;
  const pct = prev ? diff / prev : 0;
  const isUp = diff > 0;
  const isFlat = diff === 0;
  const isGood = isFlat ? null : (invert ? !isUp : isUp);
  const color = isFlat ? 'text-neutral-500' : isGood ? 'text-neutral-800' : 'text-neutral-500';
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={'inline-flex items-center gap-1 font-semibold ' + color + ' ' + (small ? 'text-xs' : 'text-sm')}>
      <Icon size={small ? 13 : 15} strokeWidth={2.5} />
      {isFlat ? '동일' : (isUp ? '+' : '') + (unit ? fmtNum(Math.abs(diff)) + unit : fmtPct(Math.abs(pct)))}
      <span className="text-neutral-400 font-normal ml-1">vs 전주</span>
    </span>
  );
}

function Card({ children, className = '', ...rest }) {
  return (
    <div className={'bg-white rounded-2xl border border-slate-200 shadow-sm shadow-slate-900/[0.03] ' + className} {...rest}>
      {children}
    </div>
  );
}

function SectionTitle({ children, subtitle, right }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{children}</h2>
        {subtitle && <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** 가로 스테퍼 + 단계 간 전환율 */
function PipelineStepper({ steps, rates }) {
  return (
    <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-[720px] items-stretch md:min-w-0">
        {steps.map((step, i) => (
          <React.Fragment key={step.key}>
            <div className="min-w-[88px] flex-1 rounded-xl border border-slate-200 bg-white px-2 py-4 text-center shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{step.short}</div>
              <div className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-slate-900 md:text-2xl">{fmtNum(step.count)}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">곳</div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 px-0.5 sm:w-24">
                <ChevronRight className="hidden text-slate-300 sm:block" size={18} strokeWidth={2} aria-hidden />
                <div className="rounded-md bg-blue-50 px-2 py-1 text-center text-[11px] font-bold tabular-nums text-blue-950 ring-1 ring-blue-100/80">
                  {fmtPct(rates[i], 1)}
                </div>
                <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">전환율</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function StageSelector({ current, onChange }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-neutral-200 bg-white">
      {STAGES.map(s => {
        const active = current === s.id;
        return (
          <button
            key={s.id}
            onClick={(e) => { e.stopPropagation(); onChange(s.id); }}
            className={'px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ' +
              (active ? s.bg + ' ' + s.text : 'text-neutral-500 hover:bg-neutral-50')}
            style={active ? { boxShadow: 'inset 0 0 0 1px ' + s.color + '40' } : {}}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   MAIN
   ============================================================ */

export default function Dashboard() {
  const todayStr = useMemo(() => localISODate(), []);

  // ─── Sync ───
  const [syncStatus, setSyncStatus] = useState('loading');
  const [hasLoaded, setHasLoaded] = useState(false);

  // ─── Core data ───
  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [blog, setBlog] = useState(INITIAL_BLOG);
  const [linkedin, setLinkedin] = useState([]);
  const [weeklyAdRows, setWeeklyAdRows] = useState(INITIAL_WEEKLY_AD_ROWS);
  const [dailyAdRows, setDailyAdRows] = useState(INITIAL_DAILY_AD_ROWS);
  const [dailyAdsAnchor, setDailyAdsAnchor] = useState(DAILY_AD_ANCHOR_DEFAULT);

  // ─── Brand stages ───
  const [brandStages, setBrandStages] = useState({});
  const [stageHistory, setStageHistory] = useState([]);

  // ─── UI state ───
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrand, setNewBrand] = useState({ brand: '', countries: '', email: '', platform: '' });
  const [leadEdit, setLeadEdit] = useState(null);

  const [organicInput, setOrganicInput] = useState(() => ({
    source: 'blog', date: localISODate(), views: '',
  }));

  // ─── Date range ───
  const thisWeekStart = useMemo(() => weekStart(todayStr), [todayStr]);
  const lastWeekStart = useMemo(() => daysBefore(thisWeekStart, 7), [thisWeekStart]);
  const lastWeekEnd = useMemo(() => daysBefore(thisWeekStart, 1), [thisWeekStart]);

  // ─── Persistent storage ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/state');
        if (cancelled) return;
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (data && !data.empty && data.data) {
          const s = data.data;
          if (s.leads) setLeads(s.leads);
          if (s.blog) setBlog(s.blog);
          if (s.linkedin) setLinkedin(s.linkedin);
          if (s.brandStages) setBrandStages(s.brandStages);
          if (s.stageHistory) setStageHistory(s.stageHistory);
          if (s.weeklyAdRows) setWeeklyAdRows(s.weeklyAdRows);
          const dr = normalizeDailyAdRows(s.dailyAdRows);
          if (dr) setDailyAdRows(dr);
          if (typeof s.dailyAdsAnchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.dailyAdsAnchor)) {
            setDailyAdsAnchor(s.dailyAdsAnchor);
          }
        }
        setSyncStatus('saved');
        setHasLoaded(true);
      } catch (err) {
        setSyncStatus('error');
        setHasLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!hasLoaded) return;
    setSyncStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const payload = {
          leads, blog, linkedin, weeklyAdRows, brandStages, stageHistory,
          dailyAdRows, dailyAdsAnchor,
          savedAt: new Date().toISOString(),
        };
        const res = await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) setSyncStatus('saved');
        else setSyncStatus('error');
      } catch (err) {
        setSyncStatus('error');
      }
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [leads, blog, linkedin, weeklyAdRows, brandStages, stageHistory, dailyAdRows, dailyAdsAnchor, hasLoaded]);

  async function resetAllData() {
    if (!confirm('모든 입력 데이터를 초기화합니다.\n콜드 리스트·단계, 추가 브랜드, 저장된 광고 시트(백업용), 링크드인·블로그 기록이 모두 사라집니다.\n되돌릴 수 없습니다. 계속할까요?')) return;
    try {
      await fetch('/api/state', { method: 'DELETE' });
      setLeads(INITIAL_LEADS);
      setBlog(INITIAL_BLOG);
      setLinkedin([]);
      setWeeklyAdRows(INITIAL_WEEKLY_AD_ROWS);
      setDailyAdRows(RAW.a.map(r => ({ ...r })));
      setDailyAdsAnchor(DAILY_AD_ANCHOR_DEFAULT);
      setBrandStages({});
      setStageHistory([]);
      setSyncStatus('saved');
    } catch (err) {
      alert('초기화 실패: ' + err.message);
    }
  }

  /* ────────────────────────────────────────────
     COLD PIPELINE + ORGANIC
     ──────────────────────────────────────────── */
  const stageCounts = useMemo(() => {
    const counts = { pending: 0, sent: 0, replied: 0, meeting: 0, won: 0 };
    leads.forEach(l => {
      const curr = brandStages[l.brand]?.stage || 'pending';
      counts[curr]++;
    });
    return counts;
  }, [leads, brandStages]);

  const funnelCumulative = useMemo(() => {
    const c = { total: leads.length, sent: 0, replied: 0, meeting: 0, won: 0 };
    leads.forEach(l => {
      const curr = brandStages[l.brand]?.stage || 'pending';
      const idx = STAGE_ORDER[curr] || 0;
      if (idx >= 1) c.sent++;
      if (idx >= 2) c.replied++;
      if (idx >= 3) c.meeting++;
      if (idx >= 4) c.won++;
    });
    return c;
  }, [leads, brandStages]);

  /* ────────────────────────────────────────────
     ORGANIC (week totals for Delta)
     ──────────────────────────────────────────── */
  const blogThisWeek = useMemo(() => blog.filter(b => b.date >= thisWeekStart && b.date <= todayStr).reduce((s, b) => s + b.views, 0), [blog, thisWeekStart, todayStr]);
  const blogLastWeek = useMemo(() => blog.filter(b => b.date >= lastWeekStart && b.date <= lastWeekEnd).reduce((s, b) => s + b.views, 0), [blog, lastWeekStart, lastWeekEnd]);
  const linkedinThisWeek = useMemo(() => linkedin.filter(b => b.date >= thisWeekStart && b.date <= todayStr).reduce((s, b) => s + b.views, 0), [linkedin, thisWeekStart, todayStr]);
  const linkedinLastWeek = useMemo(() => linkedin.filter(b => b.date >= lastWeekStart && b.date <= lastWeekEnd).reduce((s, b) => s + b.views, 0), [linkedin, lastWeekStart, lastWeekEnd]);

  const pipelineStepsModel = useMemo(() => {
    const T = leads.length;
    const S = funnelCumulative.sent;
    const R = funnelCumulative.replied;
    const M = funnelCumulative.meeting;
    const W = funnelCumulative.won;
    const steps = [
      { key: 'total', label: '전체 리드', short: '전체', count: T },
      { key: 'sent', label: '발송', short: '발송', count: S },
      { key: 'replied', label: '회신', short: '회신', count: R },
      { key: 'meeting', label: '미팅', short: '미팅', count: M },
      { key: 'won', label: '성사', short: '성사', count: W },
    ];
    const rates = [];
    for (let j = 0; j < steps.length - 1; j++) {
      const from = steps[j].count;
      const to = steps[j + 1].count;
      rates.push(from > 0 ? to / from : 0);
    }
    return { steps, rates };
  }, [leads.length, funnelCumulative]);

  const pipelineChartData = useMemo(
    () => pipelineStepsModel.steps.map((s, i, arr) => ({
      key: s.key,
      label: s.short,
      count: s.count,
      fill: i === arr.length - 1 ? CHART_BAR_LATEST : CHART_BAR_MUTED,
    })),
    [pipelineStepsModel],
  );

  const organicDailySeries = useMemo(() => {
    const bMap = new Map(blog.map(x => [x.date, x.views]));
    const lMap = new Map(linkedin.map(x => [x.date, x.views]));
    const rows = [];
    for (let i = 13; i >= 0; i--) {
      const d = daysBefore(todayStr, i);
      rows.push({
        d,
        label: `${d.slice(5, 7)}.${d.slice(8, 10)}`,
        blog: bMap.get(d) ?? 0,
        linkedin: lMap.get(d) ?? 0,
      });
    }
    return rows;
  }, [blog, linkedin, todayStr]);

  /* ────────────────────────────────────────────
     HANDLERS
     ──────────────────────────────────────────── */
  function setStage(brand, newStage) {
    setBrandStages(p => ({ ...p, [brand]: { stage: newStage, updatedAt: todayStr } }));
    setStageHistory(p => [...p, { brand, stage: newStage, date: todayStr }]);
  }

  function saveLeadEdit() {
    if (!leadEdit) return;
    const countries = leadEdit.countries.split(/[,\/]/).map(s => s.trim()).filter(Boolean);
    setLeads(p => p.map(l =>
      l.brand === leadEdit.brand
        ? { ...l, priority: leadEdit.priority, countries, platform: leadEdit.platform.trim(), email: leadEdit.email.trim() }
        : l
    ));
    setLeadEdit(null);
  }

  function addBrand() {
    const name = newBrand.brand.trim();
    if (!name) return;
    if (leads.some(l => l.brand.toLowerCase() === name.toLowerCase())) {
      alert('이미 리스트에 있는 브랜드입니다: ' + name);
      return;
    }
    const countries = newBrand.countries.split(/[,\/]/).map(s => s.trim()).filter(Boolean);
    setLeads(p => [
      { brand: name, priority: 'NEW', countries, platform: newBrand.platform.trim(), email: newBrand.email.trim() },
      ...p,
    ]);
    setNewBrand({ brand: '', countries: '', email: '', platform: '' });
    setShowAddBrand(false);
  }

  function deleteBrand(name) {
    if (!confirm(`"${name}"를 리스트에서 삭제하시겠어요?`)) return;
    setLeads(p => p.filter(l => l.brand !== name));
    setBrandStages(p => { const n = { ...p }; delete n[name]; return n; });
  }

  function addOrganic() {
    const v = parseInt(organicInput.views, 10);
    if (isNaN(v) || v < 0 || !organicInput.date) return;
    const entry = { date: organicInput.date, views: v };
    if (organicInput.source === 'blog') {
      setBlog(p => {
        const filtered = p.filter(b => b.date !== entry.date);
        return [entry, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
    } else {
      setLinkedin(p => {
        const filtered = p.filter(b => b.date !== entry.date);
        return [entry, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
    }
    setOrganicInput(p => ({ ...p, views: '' }));
  }

  function deleteOrganic(source, date) {
    if (source === 'blog') setBlog(p => p.filter(b => b.date !== date));
    else setLinkedin(p => p.filter(b => b.date !== date));
  }

  /* ────────────────────────────────────────────
     Filtered leads
     ──────────────────────────────────────────── */
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (search && !l.brand.toLowerCase().includes(search.toLowerCase())) return false;
      const stage = brandStages[l.brand]?.stage || 'pending';
      if (filterStage !== 'all' && stage !== filterStage) return false;
      return true;
    });
  }, [leads, brandStages, search, filterStage]);

  useEffect(() => {
    setOrganicInput(i => ({ ...i, date: i.date || todayStr }));
  }, [todayStr]);

  /* ────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css');
        .tabular-nums { font-variant-numeric: tabular-nums; }
      `}</style>

      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-3 sm:py-4 flex flex-wrap items-center justify-end gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 bg-white border border-neutral-200">
            {syncStatus === 'loading' && (<><Loader2 size={13} className="animate-spin text-neutral-400" /><span className="text-neutral-500">불러오는 중</span></>)}
            {syncStatus === 'saving'  && (<><Loader2 size={13} className="animate-spin text-neutral-400" /><span className="text-neutral-500">저장 중</span></>)}
            {syncStatus === 'saved'   && (<><Cloud size={13} className="text-neutral-500" /><span className="text-neutral-700 font-medium">저장됨</span></>)}
            {syncStatus === 'error'   && (<><CloudOff size={13} className="text-neutral-500" /><span className="text-neutral-700 font-medium">저장 실패</span></>)}
          </div>
          <button onClick={resetAllData} className="text-xs text-neutral-500 hover:text-neutral-900 font-medium px-2 py-1.5 rounded-lg hover:bg-neutral-50/80 border border-transparent hover:border-neutral-200" title="모든 입력 초기화">
            초기화
          </button>
          <div className="text-left sm:text-right border border-neutral-200 rounded-xl px-4 py-2 bg-white">
            <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-0.5">오늘</div>
            <div className="text-sm font-semibold tabular-nums text-neutral-900">{fmtKoreanDate(todayStr)}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">

        <div className="space-y-6">
            {/* 파이프라인 — 가로 스테퍼 + 단계 간 전환율 */}
            <Card className="p-6 md:p-7">
              <SectionTitle subtitle="전체 리드 → 발송 → 회신 → 미팅 → 성사 · 각 단계 이상 누적 · 화살표 사이는 이전 단계 대비 전환율">
                콜드 파이프라인
              </SectionTitle>
              <PipelineStepper steps={pipelineStepsModel.steps} rates={pipelineStepsModel.rates} />
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                전환율 = 다음 단계 인원 ÷ 이전 단계 인원. 리스트에서 가장 앞선 단계만 반영합니다.
              </p>
            </Card>

            <Card className="overflow-hidden p-6 md:p-7">
              <SectionTitle subtitle="위 스테퍼와 동일한 누적 인원 · 막대 = 해당 단계 이상 도달한 리드 수">
                콜드 파이프라인 그래프
              </SectionTitle>
              <div className="h-56 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="#f1f5f9" strokeWidth={1} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, padding: '6px 10px' }}
                      formatter={(v) => [fmtNum(v) + '곳', '누적']}
                    />
                    <Bar dataKey="count" name="누적" radius={[4, 4, 0, 0]} maxBarSize={52}>
                      {pipelineChartData.map(row => (
                        <Cell key={row.key} fill={row.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card id="hub-leads" className="p-6 scroll-mt-28">
              <div className="flex items-start justify-between mb-5 gap-4">
                <div>
                  <h2 className="text-xl font-bold">콜드 아웃바운드 리스트</h2>
                  <p className="text-sm text-neutral-500 mt-1">단계 변경은 즉시 저장되며, 우측 <span className="font-semibold text-neutral-700">편집</span>에서 국가·이메일·플랫폼을 시트처럼 수정할 수 있습니다.</p>
                </div>
                <button
                  onClick={() => setShowAddBrand(v => !v)}
                  className={'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors shrink-0 ' +
                    (showAddBrand ? 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50' : 'bg-white border border-neutral-900 text-neutral-900 hover:bg-neutral-50 shadow-sm')}
                >
                  {showAddBrand ? <><X size={16} /> 취소</> : <><Plus size={16} /> 브랜드 추가</>}
                </button>
              </div>

              {showAddBrand && (
                <div className="mb-5 p-5 bg-white rounded-xl border border-neutral-200">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">브랜드명 <span className="text-neutral-400">*</span></label>
                      <input
                        value={newBrand.brand}
                        onChange={e => setNewBrand({ ...newBrand, brand: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        autoFocus
                        placeholder="예) Torriden"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">타겟 국가</label>
                      <input
                        value={newBrand.countries}
                        onChange={e => setNewBrand({ ...newBrand, countries: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        placeholder="Vietnam, Thailand"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">이메일</label>
                      <input
                        value={newBrand.email}
                        onChange={e => setNewBrand({ ...newBrand, email: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        placeholder="global@brand.com"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">플랫폼</label>
                      <input
                        value={newBrand.platform}
                        onChange={e => setNewBrand({ ...newBrand, platform: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        placeholder="Shopee / Lazada"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={addBrand}
                      disabled={!newBrand.brand.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      리스트에 추가
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => setFilterStage('all')}
                  className={'px-3 py-1.5 rounded-lg text-xs font-semibold ' +
                    (filterStage === 'all' ? 'bg-white border border-neutral-900 text-neutral-900 shadow-sm' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300')}
                >
                  전체 {leads.length}
                </button>
                {STAGES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setFilterStage(s.id)}
                    className={'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ' +
                      (filterStage === s.id ? 'bg-white border border-neutral-900 text-neutral-900 shadow-sm' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300')}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label} {stageCounts[s.id]}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="브랜드 검색"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-200 text-sm outline-none focus:border-neutral-900"
                />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="max-h-[680px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200 z-10">
                    <tr className="text-xs text-neutral-600 font-semibold">
                      <th className="text-left px-5 py-3 w-12">#</th>
                      <th className="text-left px-5 py-3">브랜드</th>
                      <th className="text-left px-4 py-3 w-14">등급</th>
                      <th className="text-left px-5 py-3">국가</th>
                      <th className="text-left px-5 py-3">단계</th>
                      <th className="text-right px-4 py-3 w-24">편집</th>
                      <th className="px-3 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredLeads.map((l, i) => {
                      const current = brandStages[l.brand]?.stage || 'pending';
                      const updatedAt = brandStages[l.brand]?.updatedAt;
                      return (
                        <tr key={l.brand + '-' + i} className="hover:bg-neutral-50/50 group transition-colors">
                          <td className="px-5 py-3 text-neutral-400 tabular-nums text-xs">{String(i + 1).padStart(3, '0')}</td>
                          <td className="px-5 py-3">
                            <div className="font-semibold text-neutral-900">{l.brand}</div>
                            {l.email ? (
                              <div className="text-xs text-neutral-500 mt-0.5">{l.email}</div>
                            ) : (
                              <div className="text-xs text-neutral-400 mt-0.5 italic">이메일 없음</div>
                            )}
                            {updatedAt && <div className="text-xs text-neutral-400 mt-1">최근 변경: {updatedAt}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex min-w-[2rem] justify-center text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-md bg-white text-neutral-700 border border-neutral-200">
                              {l.priority || '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {l.countries.map(c => (
                                <span key={c} className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-white text-neutral-700 border border-neutral-200">{c}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <StageSelector current={current} onChange={(ns) => setStage(l.brand, ns)} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setLeadEdit({
                                brand: l.brand,
                                priority: l.priority || '',
                                countries: (l.countries || []).join(', '),
                                platform: l.platform || '',
                                email: l.email || '',
                              })}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300"
                            >
                              <Pencil size={12} /> 편집
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => deleteBrand(l.brand)}
                              className="p-1.5 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="브랜드 삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredLeads.length === 0 && (
                  <div className="text-center py-16 text-sm text-neutral-500">조건에 맞는 브랜드가 없습니다</div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle subtitle="이번 주 합계 · 아래 그래프는 최근 14일">
                오가닉 유입 (네이버 블로그 · 링크드인)
              </SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-neutral-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600">네이버 블로그</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-neutral-900">{fmtNum(blogThisWeek)}<span className="ml-1 text-sm font-normal text-neutral-500">회</span></div>
                  <div className="mt-1.5"><Delta curr={blogThisWeek} prev={blogLastWeek} unit="회" small /></div>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-neutral-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600">링크드인</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-neutral-900">{fmtNum(linkedinThisWeek)}<span className="ml-1 text-sm font-normal text-neutral-500">회</span></div>
                  <div className="mt-1.5"><Delta curr={linkedinThisWeek} prev={linkedinLastWeek} unit="회" small /></div>
                </div>
              </div>
              <div className="mt-6 border-t border-neutral-200 pt-6">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-neutral-900">최근 14일 일별 조회수</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">날짜별 막대 = 블로그·링크드인</p>
                </div>
                <div className="h-52 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={organicDailySeries} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="#f1f5f9" strokeWidth={1} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={1} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, padding: '6px 10px', boxShadow: '0 4px 12px rgb(15 23 42 / 0.06)' }}
                        labelFormatter={(_, p) => {
                          const d = p?.[0]?.payload?.d;
                          return d ? fmtKoreanDate(d) : '';
                        }}
                        formatter={(v, name) => [fmtNum(v) + '회', name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="blog" name="네이버 블로그" radius={[2, 2, 0, 0]} maxBarSize={14}>
                        {organicDailySeries.map((row, idx) => (
                          <Cell key={row.d + '-blog'} fill={idx === organicDailySeries.length - 1 ? CHART_BAR_LATEST : CHART_BAR_MUTED} />
                        ))}
                      </Bar>
                      <Bar dataKey="linkedin" name="링크드인" radius={[2, 2, 0, 0]} maxBarSize={14}>
                        {organicDailySeries.map((row, idx) => (
                          <Cell key={row.d + '-li'} fill={idx === organicDailySeries.length - 1 ? CHART_BAR_LATEST : CHART_BAR_MUTED_LI} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            <Card id="hub-organic" className="scroll-mt-28 p-6 shadow-sm">
              <SectionTitle subtitle="일별 기록 · 같은 날짜는 덮어쓰기 · Enter로 빠르게 저장">
                오가닉 조회수 (블로그 · 링크드인)
              </SectionTitle>

              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">매체</label>
                  <div className="inline-flex rounded-lg overflow-hidden border border-neutral-200">
                    <button
                      onClick={() => setOrganicInput({ ...organicInput, source: 'blog' })}
                      className={'px-4 py-2 text-sm font-semibold ' +
                        (organicInput.source === 'blog' ? 'bg-white text-neutral-900 shadow-[inset_0_0_0_1px_rgba(23,23,23,0.12)]' : 'text-neutral-500 hover:bg-neutral-50/80')}
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-neutral-400 mr-2 align-middle" />
                      네이버 블로그
                    </button>
                    <button
                      onClick={() => setOrganicInput({ ...organicInput, source: 'linkedin' })}
                      className={'px-4 py-2 text-sm font-semibold border-l border-neutral-200 ' +
                        (organicInput.source === 'linkedin' ? 'bg-white text-neutral-900 shadow-[inset_0_0_0_1px_rgba(23,23,23,0.12)]' : 'text-neutral-500 hover:bg-neutral-50/80')}
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-neutral-400 mr-2 align-middle" />
                      링크드인
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">날짜</label>
                  <input
                    type="date"
                    value={organicInput.date}
                    onChange={e => setOrganicInput({ ...organicInput, date: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">조회수</label>
                  <input
                    type="number"
                    min="0"
                    value={organicInput.views}
                    onChange={e => setOrganicInput({ ...organicInput, views: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addOrganic(); }}
                    placeholder="예) 15"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <button
                  onClick={addOrganic}
                  disabled={!organicInput.views || isNaN(parseInt(organicInput.views, 10))}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
                >
                  <Plus size={16} /> 기록
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-5">
                {/* 블로그 */}
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-neutral-400" />
                      <span className="text-sm font-bold">네이버 블로그</span>
                    </div>
                    <span className="text-xs text-neutral-500 tabular-nums">{blog.length}일</span>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto">
                    {blog.length === 0 ? (
                      <div className="text-center py-8 text-sm text-neutral-400">기록 없음</div>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-neutral-100">
                          {blog.slice(0, 40).map(b => (
                            <tr key={b.date} className="hover:bg-neutral-50 group">
                              <td className="px-4 py-2 tabular-nums text-xs text-neutral-600 w-28">{b.date}</td>
                              <td className="px-4 py-2 tabular-nums font-semibold text-right">{fmtNum(b.views)}<span className="text-xs text-neutral-400 font-normal ml-1">회</span></td>
                              <td className="px-2 py-2 w-8 text-right">
                                <button onClick={() => deleteOrganic('blog', b.date)} className="text-neutral-400 hover:text-neutral-700 opacity-0 group-hover:opacity-100">
                                  <X size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* 링크드인 */}
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-neutral-400" />
                      <span className="text-sm font-bold">링크드인</span>
                    </div>
                    <span className="text-xs text-neutral-500 tabular-nums">{linkedin.length}일</span>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto">
                    {linkedin.length === 0 ? (
                      <div className="text-center py-8 text-sm text-neutral-400 px-4">
                        아직 기록 없음 —<br />위 폼에서 &apos;링크드인&apos; 선택 후 입력
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-neutral-100">
                          {linkedin.slice(0, 40).map(b => (
                            <tr key={b.date} className="hover:bg-neutral-50 group">
                              <td className="px-4 py-2 tabular-nums text-xs text-neutral-600 w-28">{b.date}</td>
                              <td className="px-4 py-2 tabular-nums font-semibold text-right">{fmtNum(b.views)}<span className="text-xs text-neutral-400 font-normal ml-1">회</span></td>
                              <td className="px-2 py-2 w-8 text-right">
                                <button onClick={() => deleteOrganic('linkedin', b.date)} className="text-neutral-400 hover:text-neutral-700 opacity-0 group-hover:opacity-100">
                                  <X size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </Card>
        </div>

        {leadEdit && (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/15 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setLeadEdit(null)}
          >
            <div
              className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-neutral-200 p-6 sm:p-7 max-h-[90vh] overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lead-edit-title"
              onClick={e => e.stopPropagation()}
            >
              <h3 id="lead-edit-title" className="text-lg font-bold text-neutral-900">리드 정보 편집</h3>
              <p className="text-sm text-neutral-500 mt-1 mb-5">{leadEdit.brand}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">우선순위 (시트 등급)</label>
                  <select
                    value={leadEdit.priority}
                    onChange={e => setLeadEdit({ ...leadEdit, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 bg-white"
                  >
                    {['', 'A', 'B', 'C', 'D', 'NEW'].map(p => (
                      <option key={p || 'none'} value={p}>{p === '' ? '(미지정)' : p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">타겟 국가 (쉼표로 구분)</label>
                  <input
                    value={leadEdit.countries}
                    onChange={e => setLeadEdit({ ...leadEdit, countries: e.target.value })}
                    placeholder="Vietnam, Thailand"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">플랫폼</label>
                  <input
                    value={leadEdit.platform}
                    onChange={e => setLeadEdit({ ...leadEdit, platform: e.target.value })}
                    placeholder="Shopee / Lazada"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">이메일</label>
                  <input
                    value={leadEdit.email}
                    onChange={e => setLeadEdit({ ...leadEdit, email: e.target.value })}
                    placeholder="contact@brand.com"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setLeadEdit(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-50 border border-neutral-200"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveLeadEdit}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-neutral-900 text-neutral-900 hover:bg-neutral-50 shadow-sm"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-end border-t border-slate-200 pt-6 text-xs text-slate-500">
          <span className="tabular-nums">
            리드 {fmtNum(leads.length)}곳 · 발송 {fmtNum(funnelCumulative.sent)} · 성사 {fmtNum(funnelCumulative.won)}
          </span>
        </footer>
      </main>
    </div>
  );
}
