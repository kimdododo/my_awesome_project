'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, Legend
} from 'recharts';
import { Plus, ArrowUpRight, ArrowDownRight, Minus, Mail, MessageCircle, Calendar, CheckCircle2, Circle, Search, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { SEED } from '../data/seed';
import { INITIAL_WEEKLY_AD_ROWS } from '../data/weeklyAdsSeed';
import { parseWeeklyAdsPaste } from '../lib/weeklyAdsPaste';

const BASE_DATE = new Date('2025-10-20T00:00:00');
const TODAY = '2026-04-17';
const addDays = (base, n) => {
  const d = new Date(base); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const CH_MAP = { N: 'Naver', G: 'Google', M: 'Meta' };

const RAW = SEED;
const INITIAL_LEADS = RAW.l.map(x => ({
  brand: x.b, priority: x.p, countries: x.c, platform: x.pl, email: x.e,
}));
const INITIAL_BLOG = RAW.b.map(x => ({ date: x.d, views: x.v }));
const INITIAL_ADS = RAW.a.map(x => ({
  date: addDays(BASE_DATE, x.o),
  channel: CH_MAP[x.ch],
  impressions: x.imp, clicks: x.clk, conversions: x.cv, cost: x.co,
}));

const CHANNEL_COLORS = { Naver: '#03C75A', Google: '#4285F4', Meta: '#0866FF' };

// 콜드 아웃바운드 단계 정의 — 순서가 중요
const STAGES = [
  { id: 'pending', label: '미발송',  color: '#a3a3a3', bg: 'bg-neutral-100',  text: 'text-neutral-600' },
  { id: 'sent',    label: '발송',    color: '#eab308', bg: 'bg-yellow-100',   text: 'text-yellow-800' },
  { id: 'replied', label: '회신',    color: '#f97316', bg: 'bg-orange-100',   text: 'text-orange-800' },
  { id: 'meeting', label: '미팅',    color: '#3b82f6', bg: 'bg-blue-100',     text: 'text-blue-800' },
  { id: 'won',     label: '성사',    color: '#10b981', bg: 'bg-emerald-100',  text: 'text-emerald-800' },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));
const STAGE_ORDER = { pending: 0, sent: 1, replied: 2, meeting: 3, won: 4 };

/** beforeDateStr(해당 날 00:00) 이전까지의 히스토리만 재생 → 그 시점 단계 */
function replayStageBeforeDate(stageHistory, brand, beforeDateStr) {
  let stage = 'pending';
  for (let i = 0; i < stageHistory.length; i++) {
    const h = stageHistory[i];
    if (h.brand !== brand) continue;
    if (h.date >= beforeDateStr) break;
    stage = h.stage;
  }
  return stage;
}

const fmtNum = n => (n ?? 0).toLocaleString('ko-KR');
const fmtKRW = n => '₩' + (n ?? 0).toLocaleString('ko-KR');
const fmtKRWM = n => {
  const v = n ?? 0;
  if (v >= 1e6) return '₩' + (v/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '₩' + (v/1e3).toFixed(0) + 'K';
  return '₩' + v;
};
const fmtPct = (n, d = 0) => (n == null ? '—' : (n * 100).toFixed(d) + '%');
const fmtDate = d => d?.slice(5);
const shortNum = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v;

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

// ═══════════════════════════════════════════════
//  UI ATOMS
// ═══════════════════════════════════════════════

function HeroNumber({ value, unit, color = '#0a0a0a' }) {
  return (
    <div className="flex items-baseline gap-1" style={{ color }}>
      <span className="font-serif tabular-nums" style={{ fontSize: '52px', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</span>
      {unit && <span className="text-lg text-neutral-500 ml-0.5">{unit}</span>}
    </div>
  );
}

function Delta({ curr, prev, invert = false, unit = '' }) {
  if (prev == null || prev === 0) return <span className="text-xs text-neutral-400 font-medium">— 전주 없음</span>;
  const diff = curr - prev;
  const pct = prev ? diff / prev : 0;
  const isUp = diff > 0;
  const isFlat = diff === 0;
  const isGood = isFlat ? null : (invert ? !isUp : isUp);
  const color = isFlat ? 'text-neutral-500' : isGood ? 'text-emerald-600' : 'text-red-600';
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={'inline-flex items-center gap-1 text-xs font-semibold ' + color}>
      <Icon size={14} strokeWidth={2.5} />
      {isFlat ? '동일' : (isUp ? '+' : '') + (unit ? fmtNum(Math.abs(diff)) + unit : fmtPct(Math.abs(pct)))}
      <span className="text-neutral-400 font-normal ml-1">vs 전주</span>
    </span>
  );
}

function MetricCard({ label, value, unit, delta, sub, color = '#0a0a0a' }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-neutral-200">
      <div className="text-sm text-neutral-500 font-medium mb-3">{label}</div>
      <HeroNumber value={value} unit={unit} color={color} />
      <div className="mt-3">{delta}</div>
      {sub && <div className="mt-2 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, subtitle, right }) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <h2 className="text-xl font-bold text-neutral-900" style={{ letterSpacing: '-0.01em' }}>{children}</h2>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  STAGE SELECTOR — 브랜드 행에서 사용
// ═══════════════════════════════════════════════
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

// 작은 배지 (요약 뷰용)
function StageBadge({ stage }) {
  const s = STAGE_MAP[stage] || STAGE_MAP['pending'];
  return (
    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ' + s.bg + ' ' + s.text}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}

// ═══════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════

export default function Dashboard() {
  // ─── Persistent storage state ───
  // 'idle' | 'loading' | 'saving' | 'saved' | 'error'
  const [syncStatus, setSyncStatus] = useState('loading');
  const [hasLoaded, setHasLoaded] = useState(false);

  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [ads] = useState(INITIAL_ADS);
  const [blog, setBlog] = useState(INITIAL_BLOG); // {date, views} — naver blog
  const [linkedin, setLinkedin] = useState([]); // {date, views}
  const [tab, setTab] = useState('week');

  // 브랜드 추가 폼 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBrand, setNewBrand] = useState({ brand: '', countries: '', email: '', platform: '' });

  // 오가닉 매체 입력 폼
  const [organicInput, setOrganicInput] = useState({
    source: 'blog',      // 'blog' | 'linkedin'
    date: TODAY,
    views: '',
  });

  // 브랜드별 단계 상태 (핵심!)
  // { 'Torriden': { stage: 'sent', updatedAt: '2026-04-17' }, ... }
  const [brandStages, setBrandStages] = useState({});

  // 브랜드별 변경 이력 (단계가 언제 바뀌었는지 추적 → WoW 계산)
  // [{ brand, stage, date }]
  const [stageHistory, setStageHistory] = useState([]);

  // 광고 운영 상태 override (광고 섹션용)
  const [adOverrides, setAdOverrides] = useState({});

  /** 주간 광고 집계 (엑셀 기준) — KV에 함께 저장 */
  const [weeklyAdRows, setWeeklyAdRows] = useState(INITIAL_WEEKLY_AD_ROWS);
  const [weeklyPasteText, setWeeklyPasteText] = useState('');
  const [weeklyPasteMsg, setWeeklyPasteMsg] = useState(null);

  // 검색/필터
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');

  // ─── 초기 로드 (1회만) ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/state');
        if (cancelled) return;
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (data && !data.empty && data.data) {
          const saved = data.data;
          if (saved.leads) setLeads(saved.leads);
          if (saved.blog) setBlog(saved.blog);
          if (saved.linkedin) setLinkedin(saved.linkedin);
          if (saved.brandStages) setBrandStages(saved.brandStages);
          if (saved.stageHistory) setStageHistory(saved.stageHistory);
          if (saved.weeklyAdRows && Array.isArray(saved.weeklyAdRows)) setWeeklyAdRows(saved.weeklyAdRows);
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

  // ─── 자동 저장 (debounced) ───
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!hasLoaded) return; // 초기 로드 전엔 저장 안 함

    setSyncStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const payload = {
          leads, blog, linkedin, brandStages, stageHistory, weeklyAdRows,
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
    }, 800); // 마지막 변경 후 0.8초 뒤 저장

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [leads, blog, linkedin, brandStages, stageHistory, weeklyAdRows, hasLoaded]);

  // ─── 데이터 초기화 함수 (모든 입력 리셋) ───
  async function resetAllData() {
    if (!confirm('정말 모든 입력 데이터를 초기화하시겠습니까?\n\n초기화되는 항목:\n- 콜드 리스트 단계 기록\n- 추가된 브랜드\n- 링크드인 조회수\n- 블로그 추가 기록\n- 주간 광고 엑셀 데이터(붙여넣기 반영분)\n\n되돌릴 수 없습니다.')) return;
    try {
      await fetch('/api/state', { method: 'DELETE' });
      setLeads(INITIAL_LEADS);
      setBlog(INITIAL_BLOG);
      setLinkedin([]);
      setBrandStages({});
      setStageHistory([]);
      setWeeklyAdRows(INITIAL_WEEKLY_AD_ROWS);
      setSyncStatus('saved');
    } catch (err) {
      alert('초기화 실패: ' + err.message);
    }
  }

  // ─── 날짜 범위 ───
  const thisWeekStart = useMemo(() => weekStart(TODAY), []);
  const lastWeekStart = useMemo(() => daysBefore(thisWeekStart, 7), [thisWeekStart]);
  const lastWeekEnd = useMemo(() => daysBefore(thisWeekStart, 1), [thisWeekStart]);

  // ─── 광고 집계 ───
  const adsInRange = (start, end) => ads.filter(a => a.date >= start && a.date <= end);
  const sumAds = (arr) => {
    const t = { cost:0, clicks:0, imp:0, conv:0 };
    arr.forEach(a => { t.cost+=a.cost; t.clicks+=a.clicks; t.imp+=a.impressions; t.conv+=a.conversions; });
    return t;
  };

  const adsThisWeek = useMemo(() => sumAds(adsInRange(thisWeekStart, TODAY)), [ads, thisWeekStart]);
  const adsLastWeek = useMemo(() => sumAds(adsInRange(lastWeekStart, lastWeekEnd)), [ads, lastWeekStart, lastWeekEnd]);
  const adsAllTime = useMemo(() => sumAds(ads), [ads]);

  const weeklySorted = useMemo(
    () => [...weeklyAdRows].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    [weeklyAdRows],
  );
  const weeklyRowThisWeek = useMemo(
    () => weeklyAdRows.find(r => r.weekStart === thisWeekStart),
    [weeklyAdRows, thisWeekStart],
  );
  const weeklyRowLastWeek = useMemo(
    () => weeklyAdRows.find(r => r.weekStart === lastWeekStart),
    [weeklyAdRows, lastWeekStart],
  );
  const weeklyChartData = useMemo(
    () =>
      weeklySorted.map(r => {
        const sumCh = r.convCarisAds + r.convPhone + r.convChannelTalk;
        return {
          ...r,
          shortLabel: r.weekStart.slice(5),
          convOther: Math.max(0, r.totalConversions - sumCh),
        };
      }),
    [weeklySorted],
  );

  function mergeWeeklyPasteFromText() {
    const { rows: parsed, errors } = parseWeeklyAdsPaste(weeklyPasteText);
    if (!parsed.length) {
      setWeeklyPasteMsg({
        type: 'err',
        text: errors.length ? errors.join('\n') : '파싱된 행이 없습니다. 엑셀에서 표를 복사해 탭 구분으로 붙여넣어 주세요.',
      });
      return;
    }
    const map = new Map(weeklyAdRows.map(r => [r.weekStart, { ...r }]));
    parsed.forEach(r => map.set(r.weekStart, r));
    const next = [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    setWeeklyAdRows(next);
    setWeeklyPasteMsg({
      type: 'ok',
      text: parsed.length + '주 구간 반영 · 저장 후 전체 ' + next.length + '주' + (errors.length ? ' (' + errors.length + '개 경고)' : ''),
    });
    setWeeklyPasteText('');
  }

  const channelSummary = (start, end) => {
    const agg = { Naver:{cost:0,clicks:0,conv:0,imp:0}, Google:{cost:0,clicks:0,conv:0,imp:0}, Meta:{cost:0,clicks:0,conv:0,imp:0} };
    ads.filter(a => a.date >= start && a.date <= end).forEach(a => {
      if (!agg[a.channel]) return;
      agg[a.channel].cost += a.cost;
      agg[a.channel].clicks += a.clicks;
      agg[a.channel].conv += a.conversions;
      agg[a.channel].imp += a.impressions;
    });
    return Object.entries(agg).map(([name, v]) => ({
      name, ...v,
      cpa: v.conv ? Math.round(v.cost / v.conv) : null,
      cvr: v.clicks ? v.conv / v.clicks : 0,
      ctr: v.imp ? v.clicks / v.imp : 0,
      cpc: v.clicks ? Math.round(v.cost / v.clicks) : 0,
    }));
  };

  const channelWeek = useMemo(() => channelSummary(thisWeekStart, TODAY), [ads, thisWeekStart]);
  const channelAll = useMemo(() => channelSummary('2000-01-01', TODAY), [ads]);

  // ─── 브랜드 상태 집계 (퍼널의 원천) ───
  // 각 브랜드는 "가장 진행된" 단계에 있음. sent로 간 브랜드는 sent 이상에도 카운트.
  const stageCounts = useMemo(() => {
    const counts = { pending:0, sent:0, replied:0, meeting:0, won:0 };
    leads.forEach(l => {
      const curr = brandStages[l.brand]?.stage || 'pending';
      counts[curr]++;
    });
    return counts;
  }, [leads, brandStages]);

  // 퍼널은 누적식 (발송한 건 회신/미팅/성사 다 포함해야 함)
  const funnelCumulative = useMemo(() => {
    const stageIdx = { pending:0, sent:1, replied:2, meeting:3, won:4 };
    const counts = { total: leads.length, sent:0, replied:0, meeting:0, won:0 };
    leads.forEach(l => {
      const curr = brandStages[l.brand]?.stage || 'pending';
      const idx = stageIdx[curr] || 0;
      if (idx >= 1) counts.sent++;
      if (idx >= 2) counts.replied++;
      if (idx >= 3) counts.meeting++;
      if (idx >= 4) counts.won++;
    });
    return counts;
  }, [leads, brandStages]);

  // ─── WoW 계산 (주 시작 vs 현재 단계) ───
  // 이전: stageHistory의 "이벤트 건수"를 세서, 성사→다른 단계로 되돌린 뒤에도 '이번 주 성사'가 남는 버그가 있었음.
  // 현재: 이번 월요일 0시 이전까지 재생한 단계 < 지금 단계 이면, 그 주에 해당 단계에 '도달했다'고 보고 1곳만 집계.
  const weeklyStageChange = useMemo(() => {
    const thisWeek = { sent: 0, replied: 0, meeting: 0, won: 0 };
    const lastWeek = { sent: 0, replied: 0, meeting: 0, won: 0 };
    const brands = [...new Set(leads.map(l => l.brand))];

    brands.forEach((brand) => {
      const now = brandStages[brand]?.stage || 'pending';
      const idxNow = STAGE_ORDER[now] ?? 0;

      const atThisWeekStart = replayStageBeforeDate(stageHistory, brand, thisWeekStart);
      const idxAtThisWeekStart = STAGE_ORDER[atThisWeekStart] ?? 0;
      if (idxNow >= 1 && idxAtThisWeekStart < 1) thisWeek.sent++;
      if (idxNow >= 2 && idxAtThisWeekStart < 2) thisWeek.replied++;
      if (idxNow >= 3 && idxAtThisWeekStart < 3) thisWeek.meeting++;
      if (idxNow >= 4 && idxAtThisWeekStart < 4) thisWeek.won++;

      const atLastWeekStart = replayStageBeforeDate(stageHistory, brand, lastWeekStart);
      const idxAtLastWeekStart = STAGE_ORDER[atLastWeekStart] ?? 0;
      const atThisWeekStartForLast = replayStageBeforeDate(stageHistory, brand, thisWeekStart);
      const idxEndLastWeek = STAGE_ORDER[atThisWeekStartForLast] ?? 0;
      if (idxEndLastWeek >= 1 && idxAtLastWeekStart < 1) lastWeek.sent++;
      if (idxEndLastWeek >= 2 && idxAtLastWeekStart < 2) lastWeek.replied++;
      if (idxEndLastWeek >= 3 && idxAtLastWeekStart < 3) lastWeek.meeting++;
      if (idxEndLastWeek >= 4 && idxAtLastWeekStart < 4) lastWeek.won++;
    });

    return { thisWeek, lastWeek };
  }, [leads, brandStages, stageHistory, thisWeekStart, lastWeekStart]);

  // ─── 매체별 일별 전환 ───
  const dailyConv = useMemo(() => {
    const map = new Map();
    ads.forEach(a => {
      if (!map.has(a.date)) map.set(a.date, { date:a.date, Naver:0, Google:0, Meta:0, cost:0 });
      map.get(a.date)[a.channel] = (map.get(a.date)[a.channel] || 0) + a.conversions;
      map.get(a.date).cost += a.cost;
    });
    return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
  }, [ads]);

  const dailyConvRange = (n) => {
    const cutoff = daysBefore(TODAY, n - 1);
    return dailyConv.filter(d => d.date >= cutoff);
  };

  // ─── 단계 변경 핸들러 ───
  function setStage(brand, newStage) {
    setBrandStages(prev => ({
      ...prev,
      [brand]: { stage: newStage, updatedAt: TODAY }
    }));
    setStageHistory(prev => [...prev, { brand, stage: newStage, date: TODAY }]);
  }

  // ─── 브랜드 추가 핸들러 ───
  function addBrand() {
    const name = newBrand.brand.trim();
    if (!name) return;
    // 중복 체크 (대소문자 무시)
    if (leads.some(l => l.brand.toLowerCase() === name.toLowerCase())) {
      alert('이미 리스트에 있는 브랜드입니다: ' + name);
      return;
    }
    const countries = newBrand.countries
      .split(/[,\/]/).map(s => s.trim()).filter(Boolean);
    setLeads(prev => [
      {
        brand: name,
        priority: 'NEW',
        countries,
        platform: newBrand.platform.trim(),
        email: newBrand.email.trim(),
      },
      ...prev,
    ]);
    setNewBrand({ brand: '', countries: '', email: '', platform: '' });
    setShowAddForm(false);
  }

  // ─── 오가닉 매체 입력 핸들러 ───
  function addOrganic() {
    const v = parseInt(organicInput.views, 10);
    if (isNaN(v) || v < 0 || !organicInput.date) return;
    const entry = { date: organicInput.date, views: v };
    if (organicInput.source === 'blog') {
      // 같은 날짜 있으면 덮어쓰기
      setBlog(prev => {
        const filtered = prev.filter(b => b.date !== entry.date);
        return [entry, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
    } else {
      setLinkedin(prev => {
        const filtered = prev.filter(b => b.date !== entry.date);
        return [entry, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
    }
    // 입력값만 초기화 (날짜/소스는 유지 → 연속 입력 편의)
    setOrganicInput(prev => ({ ...prev, views: '' }));
  }

  function deleteOrganic(source, date) {
    if (source === 'blog') setBlog(prev => prev.filter(b => b.date !== date));
    else setLinkedin(prev => prev.filter(b => b.date !== date));
  }

  // ─── 오가닉 집계 ───
  const organicSumInRange = (arr, start, end) =>
    arr.filter(x => x.date >= start && x.date <= end).reduce((s, x) => s + x.views, 0);

  const blogThisWeek = useMemo(() => organicSumInRange(blog, thisWeekStart, TODAY), [blog, thisWeekStart]);
  const blogLastWeek = useMemo(() => organicSumInRange(blog, lastWeekStart, lastWeekEnd), [blog, lastWeekStart, lastWeekEnd]);
  const blogAllTime  = useMemo(() => blog.reduce((s, b) => s + b.views, 0), [blog]);

  const linkedinThisWeek = useMemo(() => organicSumInRange(linkedin, thisWeekStart, TODAY), [linkedin, thisWeekStart]);
  const linkedinLastWeek = useMemo(() => organicSumInRange(linkedin, lastWeekStart, lastWeekEnd), [linkedin, lastWeekStart, lastWeekEnd]);
  const linkedinAllTime  = useMemo(() => linkedin.reduce((s, b) => s + b.views, 0), [linkedin]);

  // 일별 오가닉 차트용 (최근 30일)
  const organicDaily = useMemo(() => {
    const map = new Map();
    blog.forEach(b => {
      if (!map.has(b.date)) map.set(b.date, { date: b.date, blog: 0, linkedin: 0 });
      map.get(b.date).blog = b.views;
    });
    linkedin.forEach(b => {
      if (!map.has(b.date)) map.set(b.date, { date: b.date, blog: 0, linkedin: 0 });
      map.get(b.date).linkedin = b.views;
    });
    const cutoff = daysBefore(TODAY, 29);
    return Array.from(map.values())
      .filter(x => x.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [blog, linkedin]);

  // ─── 필터링된 리드 ───
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (search && !l.brand.toLowerCase().includes(search.toLowerCase())) return false;
      const stage = brandStages[l.brand]?.stage || 'pending';
      if (filterStage !== 'all' && stage !== filterStage) return false;
      return true;
    });
  }, [leads, brandStages, search, filterStage]);

  // ─── 헤드라인 자동 생성 ───
  const headline = useMemo(() => {
    const ch = weeklyStageChange.thisWeek;
    if (ch.won > 0) return '이번 주 성사 ' + ch.won + '건 — 드디어 결실을!';
    if (ch.meeting > 0) return '이번 주 미팅 ' + ch.meeting + '건 잡힘';
    if (ch.replied > 0) return '이번 주 회신 ' + ch.replied + '건 수신';
    if (ch.sent > 0) return '이번 주 콜드메일 ' + ch.sent + '곳 발송 완료';
    if (weeklyRowThisWeek && weeklyRowThisWeek.totalConversions > 0) {
      const prev = weeklyRowLastWeek?.totalConversions;
      const d = prev != null ? weeklyRowThisWeek.totalConversions - prev : 0;
      return '이번 주 총 전환 ' + weeklyRowThisWeek.totalConversions + '건 (실)' +
        (prev != null && d !== 0 ? (d > 0 ? ' — 전주 +' + d : ' — 전주 ' + d) : '');
    }
    const cvDelta = adsThisWeek.conv - adsLastWeek.conv;
    if (adsThisWeek.conv > 0) return '이번 주 광고 전환 ' + adsThisWeek.conv + '건' + (cvDelta > 0 ? ' — 전주 +' + cvDelta : '');
    const organicTotal = blogThisWeek + linkedinThisWeek;
    const organicLast = blogLastWeek + linkedinLastWeek;
    if (organicTotal > 0) {
      const diff = organicTotal - organicLast;
      return '이번 주 오가닉 조회 ' + organicTotal + '회' + (diff > 0 ? ' — 전주 +' + diff : diff < 0 ? ' — 전주 ' + diff : '');
    }
    return '이번 주는 조용한 편 — 아웃바운드 활동 기록이 없습니다';
  }, [weeklyStageChange, weeklyRowThisWeek, weeklyRowLastWeek, adsThisWeek, adsLastWeek, blogThisWeek, blogLastWeek, linkedinThisWeek, linkedinLastWeek]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900" style={{ fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* HEADER */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-[1200px] mx-auto px-8 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500 font-medium mb-1">CARIS · WEEKLY REPORT</div>
            <h1 className="text-xl font-bold tracking-tight">K-Beauty SEA Outbound</h1>
          </div>
          <div className="flex items-center gap-4">
            {/* 저장 상태 */}
            <div className="flex items-center gap-1.5 text-xs">
              {syncStatus === 'loading' && (
                <><Loader2 size={13} className="animate-spin text-neutral-400" /><span className="text-neutral-500">불러오는 중…</span></>
              )}
              {syncStatus === 'saving' && (
                <><Loader2 size={13} className="animate-spin text-neutral-400" /><span className="text-neutral-500">저장 중…</span></>
              )}
              {syncStatus === 'saved' && (
                <><Cloud size={13} className="text-emerald-500" /><span className="text-emerald-600 font-medium">저장됨</span></>
              )}
              {syncStatus === 'error' && (
                <><CloudOff size={13} className="text-red-500" /><span className="text-red-600 font-medium">저장 실패</span></>
              )}
              {syncStatus === 'idle' && (
                <><CloudOff size={13} className="text-neutral-400" /><span className="text-neutral-500">세션 저장</span></>
              )}
            </div>
            {/* 초기화 */}
            <button
              onClick={resetAllData}
              className="text-xs text-neutral-500 hover:text-red-600 font-medium transition-colors px-2 py-1 rounded hover:bg-red-50"
              title="모든 입력 데이터 초기화"
            >
              초기화
            </button>
            <div className="text-right border-l border-neutral-200 pl-4">
              <div className="text-xs text-neutral-500 mb-1">Report Date</div>
              <div className="text-sm font-semibold tabular-nums">2026. 04. 17 (금)</div>
            </div>
          </div>
        </div>
      </header>

      {/* TAB BAR */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-[1200px] mx-auto px-8 flex">
          {[
            { id: 'week',    label: '이번 주',     sub: 'This Week' },
            { id: 'leads',   label: '콜드 리스트',  sub: 'Outreach' },
            { id: 'ads',     label: '자사 광고',    sub: 'Ads Performance' },
            { id: 'organic', label: '오가닉 매체',  sub: 'Blog · LinkedIn' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={'px-6 py-4 text-sm font-semibold border-b-2 transition-colors ' +
                (tab === t.id ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800')}
            >
              <div>{t.label}</div>
              <div className="text-[10px] font-normal mt-0.5 opacity-60">{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-8 py-8">

        {/* ═════════ TAB: 이번 주 ═════════ */}
        {tab === 'week' && (
          <div className="space-y-8">

            {/* 헤드라인 */}
            <section className="bg-white rounded-2xl p-8 border border-neutral-200">
              <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-3">This Week&apos;s Headline</div>
              <h2 className="text-3xl font-bold text-neutral-900 leading-tight" style={{ letterSpacing: '-0.02em' }}>
                {headline}
              </h2>
              <p className="text-sm text-neutral-500 mt-3">
                {thisWeekStart} ~ {TODAY} · 월~금 기준
              </p>
            </section>

            {/* 콜드 아웃바운드 4개 카드 */}
            <section>
              <SectionTitle subtitle="브랜드 단계를 '콜드 리스트' 탭에서 바꾸면 여기에 바로 집계됩니다">
                콜드 아웃바운드 · 이번 주 활동
              </SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="발송"
                  value={fmtNum(weeklyStageChange.thisWeek.sent)}
                  unit="곳"
                  delta={<Delta curr={weeklyStageChange.thisWeek.sent} prev={weeklyStageChange.lastWeek.sent} unit="곳" />}
                  sub={'누적 ' + funnelCumulative.sent + ' / ' + leads.length}
                  color="#eab308"
                />
                <MetricCard
                  label="회신"
                  value={fmtNum(weeklyStageChange.thisWeek.replied)}
                  unit="건"
                  delta={<Delta curr={weeklyStageChange.thisWeek.replied} prev={weeklyStageChange.lastWeek.replied} unit="건" />}
                  sub={'누적 ' + funnelCumulative.replied + '건'}
                  color="#f97316"
                />
                <MetricCard
                  label="미팅"
                  value={fmtNum(weeklyStageChange.thisWeek.meeting)}
                  unit="건"
                  delta={<Delta curr={weeklyStageChange.thisWeek.meeting} prev={weeklyStageChange.lastWeek.meeting} unit="건" />}
                  sub={'누적 ' + funnelCumulative.meeting + '건'}
                  color="#3b82f6"
                />
                <MetricCard
                  label="성사"
                  value={fmtNum(weeklyStageChange.thisWeek.won)}
                  unit="건"
                  delta={<Delta curr={weeklyStageChange.thisWeek.won} prev={weeklyStageChange.lastWeek.won} unit="건" />}
                  sub={'누적 ' + funnelCumulative.won + '건'}
                  color="#10b981"
                />
              </div>
            </section>

            {/* 퍼널 요약 */}
            <section className="bg-white rounded-2xl p-8 border border-neutral-200">
              <SectionTitle subtitle="리스트에서 가장 진행된 단계 기준 누적">현재 파이프라인 상태</SectionTitle>
              <div className="grid grid-cols-5 gap-0 mt-4">
                {[
                  { label: '전체 리드', count: leads.length, color: '#525252' },
                  { label: '발송 완료', count: funnelCumulative.sent, color: '#eab308' },
                  { label: '회신 받음', count: funnelCumulative.replied, color: '#f97316' },
                  { label: '미팅 진행', count: funnelCumulative.meeting, color: '#3b82f6' },
                  { label: '성사', count: funnelCumulative.won, color: '#10b981' },
                ].map((s, i, arr) => {
                  const prev = i === 0 ? null : arr[i-1];
                  const rate = prev && prev.count > 0 ? (s.count / prev.count) : null;
                  return (
                    <div key={s.label} className={'px-4 py-2 ' + (i > 0 ? 'border-l border-neutral-100' : '')}>
                      <div className="text-xs text-neutral-500 font-semibold mb-2">{s.label}</div>
                      <div className="font-bold tabular-nums" style={{ fontSize: 36, lineHeight: 1, color: s.color }}>
                        {fmtNum(s.count)}
                      </div>
                      {rate != null && (
                        <div className="mt-2 text-xs text-neutral-500">
                          <span className="font-semibold text-neutral-900">{fmtPct(rate)}</span>
                        </div>
                      )}
                      {i === 0 && (
                        <div className="mt-2 text-xs text-neutral-500">타겟 리스트</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 pt-6 border-t border-neutral-100">
                <div className="text-xs text-neutral-500 mb-2">발송 진척도</div>
                <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full transition-all duration-700" style={{ width: ((funnelCumulative.sent / (leads.length || 1)) * 100) + '%' }} />
                </div>
                <div className="mt-2 text-xs text-neutral-600">
                  <span className="font-semibold">{funnelCumulative.sent}</span>
                  <span className="text-neutral-400"> / </span>
                  <span>{leads.length}</span>
                  <span className="text-neutral-500 ml-2">({fmtPct(funnelCumulative.sent / (leads.length || 1))})</span>
                  <span className="text-neutral-400 ml-4">· 미발송 {leads.length - funnelCumulative.sent}곳</span>
                </div>
              </div>
            </section>

            {/* 광고는 요약만 */}
            <section>
              <SectionTitle
                subtitle={weeklyRowThisWeek
                  ? '엑셀 주간 집계 · 총 전환 = 카리스 애드 + 유선 + 채널톡 (실제 문의/성과)'
                  : '주간 행이 없으면 아래 숫자는 일별 매체 시드 합산입니다'}
                right={
                  <button onClick={() => setTab('ads')} className="text-xs text-neutral-500 hover:text-neutral-900 font-semibold">
                    주간 표·붙여넣기 →
                  </button>
                }
              >
                자사 광고 · 이번 주
              </SectionTitle>
              {weeklyRowThisWeek ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <MetricCard
                    label="총 전환수 (실)"
                    value={fmtNum(weeklyRowThisWeek.totalConversions)}
                    unit="건"
                    delta={weeklyRowLastWeek
                      ? <Delta curr={weeklyRowThisWeek.totalConversions} prev={weeklyRowLastWeek.totalConversions} unit="건" />
                      : <span className="text-xs text-neutral-400">— 전주 행 없음</span>}
                    sub={'GA 광고전환 ' + fmtNum(weeklyRowThisWeek.adConversions) + ' · 애드 ' + fmtNum(weeklyRowThisWeek.convCarisAds) + ' · 유선 ' + fmtNum(weeklyRowThisWeek.convPhone) + ' · 채널톡 ' + fmtNum(weeklyRowThisWeek.convChannelTalk)}
                    color="#059669"
                  />
                  <MetricCard
                    label="총 광고비"
                    value={fmtKRWM(weeklyRowThisWeek.cost)}
                    delta={weeklyRowLastWeek
                      ? <Delta curr={weeklyRowThisWeek.cost} prev={weeklyRowLastWeek.cost} invert />
                      : <span className="text-xs text-neutral-400">—</span>}
                  />
                  <MetricCard
                    label="CPA (총비÷총전환)"
                    value={fmtKRW(weeklyRowThisWeek.cpa)}
                    delta={weeklyRowLastWeek && weeklyRowLastWeek.cpa
                      ? <Delta curr={weeklyRowThisWeek.cpa} prev={weeklyRowLastWeek.cpa} invert />
                      : <span className="text-xs text-neutral-400">—</span>}
                    sub="낮을수록 유리"
                  />
                </div>
              ) : (
                <>
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    주간 표에 <strong>{thisWeekStart}</strong> 행이 없습니다. 「자사 광고」탭에서 엑셀을 붙여넣으면 <strong>총 전환</strong> 기준 요약이 여기 표시됩니다.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <MetricCard
                      label="광고 전환 (일별 합)"
                      value={fmtNum(adsThisWeek.conv)}
                      unit="건"
                      delta={<Delta curr={adsThisWeek.conv} prev={adsLastWeek.conv} unit="건" />}
                      color="#059669"
                    />
                    <MetricCard
                      label="광고비 (일별 합)"
                      value={fmtKRWM(adsThisWeek.cost)}
                      delta={<Delta curr={adsThisWeek.cost} prev={adsLastWeek.cost} invert />}
                      sub={adsThisWeek.conv ? 'CPA ' + fmtKRW(Math.round(adsThisWeek.cost / adsThisWeek.conv)) : 'CPA —'}
                    />
                    <MetricCard
                      label="클릭 (일별 합)"
                      value={fmtNum(adsThisWeek.clicks)}
                      unit="회"
                      delta={<Delta curr={adsThisWeek.clicks} prev={adsLastWeek.clicks} unit="회" />}
                      sub={'CTR ' + fmtPct(adsThisWeek.imp ? adsThisWeek.clicks / adsThisWeek.imp : 0, 2)}
                    />
                  </div>
                  {adsThisWeek.conv === 0 && adsThisWeek.cost === 0 && (
                    <div className="mt-3 text-xs text-neutral-500 bg-neutral-100 rounded-lg px-4 py-2">
                      일별 시드에도 이번 구간 데이터가 거의 없습니다.
                    </div>
                  )}
                </>
              )}
            </section>

            {/* 오가닉 매체 요약 */}
            <section>
              <SectionTitle
                subtitle="자연 유입 채널 · 매일 기록한 조회수 합산"
                right={
                  <button onClick={() => setTab('organic')} className="text-xs text-neutral-500 hover:text-neutral-900 font-semibold">
                    기록·관리 →
                  </button>
                }
              >
                오가닉 매체 · 이번 주
              </SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  label="네이버 블로그"
                  value={fmtNum(blogThisWeek)}
                  unit="회"
                  delta={<Delta curr={blogThisWeek} prev={blogLastWeek} unit="회" />}
                  sub={'누적 ' + fmtNum(blogAllTime) + '회'}
                  color="#03C75A"
                />
                <MetricCard
                  label="링크드인"
                  value={fmtNum(linkedinThisWeek)}
                  unit="회"
                  delta={<Delta curr={linkedinThisWeek} prev={linkedinLastWeek} unit="회" />}
                  sub={linkedin.length === 0 ? '아직 기록 없음' : '누적 ' + fmtNum(linkedinAllTime) + '회'}
                  color="#0A66C2"
                />
              </div>
            </section>
          </div>
        )}

        {/* ═════════ TAB: 콜드 리스트 ═════════ */}
        {tab === 'leads' && (
          <div className="space-y-6">

            {/* 상단 필터 & 현황 요약 */}
            <section className="bg-white rounded-2xl p-6 border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">콜드 아웃바운드 리스트</h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    각 브랜드의 단계를 선택하면 이번 주 카드에 바로 반영됩니다
                  </p>
                </div>
                <button
                  onClick={() => setShowAddForm(v => !v)}
                  className={'px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ' +
                    (showAddForm ? 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300' : 'bg-neutral-900 text-white hover:bg-neutral-800')}
                >
                  <Plus size={16} /> {showAddForm ? '취소' : '브랜드 추가'}
                </button>
              </div>

              {/* 추가 폼 (토글) */}
              {showAddForm && (
                <div className="mb-4 p-5 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                        브랜드명 <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={newBrand.brand}
                        onChange={e => setNewBrand({ ...newBrand, brand: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        autoFocus
                        placeholder="예) Torriden"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                        타겟 국가
                      </label>
                      <input
                        value={newBrand.countries}
                        onChange={e => setNewBrand({ ...newBrand, countries: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        placeholder="예) Vietnam, Thailand"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 transition-colors"
                      />
                      <div className="text-[11px] text-neutral-400 mt-1">쉼표(,)로 구분</div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                        이메일
                      </label>
                      <input
                        value={newBrand.email}
                        onChange={e => setNewBrand({ ...newBrand, email: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        placeholder="예) global@brand.com"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                        플랫폼
                      </label>
                      <input
                        value={newBrand.platform}
                        onChange={e => setNewBrand({ ...newBrand, platform: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') addBrand(); }}
                        placeholder="예) Shopee / Lazada"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
                    <div className="text-xs text-neutral-500">
                      추가하면 <span className="font-semibold text-neutral-700">미발송</span> 단계로 들어갑니다
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowAddForm(false); setNewBrand({ brand:'', countries:'', email:'', platform:'' }); }}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-200 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={addBrand}
                        disabled={!newBrand.brand.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
                      >
                        리스트에 추가
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 단계별 카운트 필터 */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setFilterStage('all')}
                  className={'px-3 py-2 rounded-lg text-xs font-semibold transition-colors ' +
                    (filterStage === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
                >
                  전체 {leads.length}
                </button>
                {STAGES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setFilterStage(s.id)}
                    className={'px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ' +
                      (filterStage === s.id ? s.bg + ' ' + s.text : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label} {stageCounts[s.id]}
                  </button>
                ))}
              </div>

              {/* 검색 */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="브랜드 검색…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-200 text-sm outline-none focus:border-neutral-900 transition-colors"
                />
              </div>
            </section>

            {/* 리스트 */}
            <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="max-h-[720px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200 z-10">
                    <tr className="text-xs text-neutral-600 font-semibold">
                      <th className="text-left px-5 py-3 w-12">#</th>
                      <th className="text-left px-5 py-3">브랜드</th>
                      <th className="text-left px-5 py-3">국가</th>
                      <th className="text-left px-5 py-3">단계 (클릭해서 변경)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredLeads.map((l, i) => {
                      const current = brandStages[l.brand]?.stage || 'pending';
                      const updatedAt = brandStages[l.brand]?.updatedAt;
                      return (
                        <tr key={l.brand + '-' + i} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-5 py-3 text-neutral-400 tabular-nums text-xs">{String(i + 1).padStart(3, '0')}</td>
                          <td className="px-5 py-3">
                            <div className="font-semibold text-neutral-900">{l.brand}</div>
                            {l.email ? (
                              <div className="text-xs text-neutral-500 mt-0.5">{l.email}</div>
                            ) : (
                              <div className="text-xs text-neutral-400 mt-0.5 italic">이메일 없음</div>
                            )}
                            {updatedAt && (
                              <div className="text-xs text-neutral-400 mt-1">최근 변경: {updatedAt}</div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {l.countries.map(c => (
                                <span key={c} className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <StageSelector
                              current={current}
                              onChange={(newStage) => setStage(l.brand, newStage)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredLeads.length === 0 && (
                  <div className="text-center py-12 text-sm text-neutral-500">
                    조건에 맞는 브랜드가 없습니다
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ═════════ TAB: 자사 광고 ═════════ */}
        {tab === 'ads' && (
          <div className="space-y-8">
            <section className="bg-white rounded-2xl p-8 border border-neutral-200">
              <SectionTitle subtitle="총 전환수 = 카리스 애드 + 유선 + 채널톡 · CPA = 총 광고비 ÷ 총 전환수">
                주간 광고 집계 (엑셀)
              </SectionTitle>
              <p className="text-sm text-neutral-600 mb-6">
                <strong className="text-neutral-800">광고 전환</strong>(GA/매체)과 <strong className="text-neutral-800">총 전환수</strong>(실제 문의·성과)은 다릅니다.
                주간 성과는 <strong>총 전환</strong>과 <strong>CPA</strong>를 기준으로 보시면 됩니다.
              </p>

              <div className="h-80 mb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weeklyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#e5e5e5" vertical={false} />
                    <XAxis dataKey="shortLabel" tick={{ fontSize: 11, fill: '#737373' }} axisLine={{ stroke: '#e5e5e5' }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} tickFormatter={shortNum} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: 'none', borderRadius: 8, fontSize: 12, padding: '8px 12px' }}
                      labelStyle={{ color: '#fbbf24', marginBottom: 4 }}
                      itemStyle={{ color: '#fafafa' }}
                      formatter={(v, name) => (name === '총 광고비' ? fmtKRW(v) : v + '건')}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="convCarisAds" stackId="c" fill="#059669" name="카리스 애드" />
                    <Bar yAxisId="left" dataKey="convPhone" stackId="c" fill="#6366f1" name="유선" />
                    <Bar yAxisId="left" dataKey="convChannelTalk" stackId="c" fill="#f59e0b" name="채널톡" />
                    <Bar yAxisId="left" dataKey="convOther" stackId="c" fill="#d4d4d4" name="기타(잔차)" />
                    <Line yAxisId="right" type="monotone" dataKey="cost" name="총 광고비" stroke="#0a0a0a" strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200 mb-6">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 text-left text-xs font-semibold text-neutral-600 border-b border-neutral-200">
                      <th className="px-3 py-2 whitespace-nowrap">시작(월)</th>
                      <th className="px-3 py-2 whitespace-nowrap">연/월/주차</th>
                      <th className="px-3 py-2 text-right">노출</th>
                      <th className="px-3 py-2 text-right">클릭</th>
                      <th className="px-3 py-2 text-right">광고 전환</th>
                      <th className="px-3 py-2 text-right">CTR</th>
                      <th className="px-3 py-2 text-right">CPC</th>
                      <th className="px-3 py-2 text-right">총 광고비</th>
                      <th className="px-3 py-2 text-right">애드</th>
                      <th className="px-3 py-2 text-right">유선</th>
                      <th className="px-3 py-2 text-right">채널톡</th>
                      <th className="px-3 py-2 text-right font-bold text-neutral-900">총 전환</th>
                      <th className="px-3 py-2 text-right">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklySorted.map((r) => (
                      <tr key={r.weekStart} className="border-b border-neutral-100 hover:bg-neutral-50/80">
                        <td className="px-3 py-2 font-mono text-xs text-neutral-700 whitespace-nowrap">{r.weekStart}</td>
                        <td className="px-3 py-2 text-neutral-800 whitespace-nowrap">{r.weekLabel}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.clicks)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.adConversions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.ctr != null ? fmtPct(r.ctr, 2) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKRW(r.cpc)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKRW(r.cost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.convCarisAds)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.convPhone)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.convChannelTalk)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">{fmtNum(r.totalConversions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKRW(r.cpa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
                <div className="text-xs font-semibold text-neutral-700 mb-2">엑셀에서 표 복사 → 아래에 붙여넣기 (탭 구분, 주 단위로 병합)</div>
                <textarea
                  value={weeklyPasteText}
                  onChange={(e) => { setWeeklyPasteText(e.target.value); setWeeklyPasteMsg(null); }}
                  rows={6}
                  placeholder="첫 열: YYYY-MM-DD (주 시작일) …"
                  className="w-full text-xs font-mono border border-neutral-200 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={mergeWeeklyPasteFromText}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
                  >
                    붙여넣기 반영
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm('주간 표만 초기 샘플 데이터로 되돌릴까요?')) return;
                      setWeeklyAdRows(INITIAL_WEEKLY_AD_ROWS);
                      setWeeklyPasteMsg({ type: 'ok', text: '주간 표를 초기 시드로 되돌렸습니다.' });
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                  >
                    주간 표만 시드로 초기화
                  </button>
                </div>
                {weeklyPasteMsg && (
                  <p className={'mt-3 text-xs whitespace-pre-wrap ' + (weeklyPasteMsg.type === 'ok' ? 'text-emerald-800' : 'text-red-700')}>
                    {weeklyPasteMsg.text}
                  </p>
                )}
              </div>
            </section>

            <section>
              <SectionTitle subtitle="자사(카리스) 홍보용 광고 성과 · 콜드 아웃바운드와는 별개">
                자사 광고 누적 성과 (일별 시드)
              </SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="누적 전환"
                  value={fmtNum(adsAllTime.conv)}
                  unit="건"
                  delta={<span className="text-xs text-neutral-500">{fmtNum(adsAllTime.clicks)} 클릭 중</span>}
                  color="#059669"
                />
                <MetricCard
                  label="누적 광고비"
                  value={fmtKRWM(adsAllTime.cost)}
                  delta={<span className="text-xs text-neutral-500">CPA {adsAllTime.conv ? fmtKRW(Math.round(adsAllTime.cost/adsAllTime.conv)) : '—'}</span>}
                />
                <MetricCard
                  label="누적 클릭"
                  value={fmtNum(adsAllTime.clicks)}
                  unit="회"
                  delta={<span className="text-xs text-neutral-500">CTR {fmtPct(adsAllTime.imp ? adsAllTime.clicks/adsAllTime.imp : 0, 2)}</span>}
                />
                <MetricCard
                  label="누적 노출"
                  value={shortNum(adsAllTime.imp)}
                  unit="회"
                  delta={<span className="text-xs text-neutral-500">3개 매체 합산</span>}
                />
              </div>
            </section>

            <section className="bg-white rounded-2xl p-8 border border-neutral-200">
              <SectionTitle subtitle="막대는 매체별 전환수 (스택) · 점선은 총 광고비 (KRW)">
                매체별 전환 추이 (최근 90일)
              </SectionTitle>
              <div className="h-80">
                <ResponsiveContainer>
                  <ComposedChart data={dailyConvRange(90)} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#e5e5e5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} tickFormatter={fmtDate} axisLine={{ stroke: '#e5e5e5' }} tickLine={false} interval={8} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} tickFormatter={shortNum} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: 'none', borderRadius: 8, fontSize: 12, padding: '8px 12px' }}
                      labelStyle={{ color: '#fbbf24', marginBottom: 4 }}
                      itemStyle={{ color: '#fafafa' }}
                      formatter={(v, name) => name === '총비용' ? fmtKRW(v) : v + '건'}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="Naver"  stackId="c" fill={CHANNEL_COLORS.Naver} />
                    <Bar yAxisId="left" dataKey="Google" stackId="c" fill={CHANNEL_COLORS.Google} />
                    <Bar yAxisId="left" dataKey="Meta"   stackId="c" fill={CHANNEL_COLORS.Meta} />
                    <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#0a0a0a" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="총비용" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <SectionTitle>매체별 성과</SectionTitle>
              <div className="grid grid-cols-3 gap-4">
                {channelAll.sort((a,b) => b.conv - a.conv).map(ch => (
                  <div key={ch.name} className="bg-white rounded-2xl p-6 border border-neutral-200 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: CHANNEL_COLORS[ch.name] }} />
                    <div className="flex items-baseline justify-between mb-4">
                      <span className="text-lg font-bold">{ch.name}</span>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[ch.name] }} />
                    </div>
                    <div className="text-xs text-neutral-500 mb-1">전환</div>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-4xl font-bold tabular-nums" style={{ color: CHANNEL_COLORS[ch.name] }}>{fmtNum(ch.conv)}</span>
                      <span className="text-sm text-neutral-500">건</span>
                    </div>
                    <div className="text-xs text-neutral-500 mb-4">CVR {fmtPct(ch.cvr, 2)}</div>
                    <div className="h-px bg-neutral-100 mb-4" />
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-neutral-500 mb-0.5">광고비</div>
                        <div className="font-semibold tabular-nums">{fmtKRWM(ch.cost)}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500 mb-0.5">CPA</div>
                        <div className="font-semibold tabular-nums">{ch.cpa ? fmtKRWM(ch.cpa) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500 mb-0.5">클릭</div>
                        <div className="font-semibold tabular-nums">{fmtNum(ch.clicks)}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500 mb-0.5">CPC</div>
                        <div className="font-semibold tabular-nums">{fmtKRWM(ch.cpc)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ═════════ TAB: 오가닉 매체 ═════════ */}
        {tab === 'organic' && (
          <div className="space-y-8">

            {/* 요약 카드 */}
            <section>
              <SectionTitle subtitle="자연 유입 채널 · 매일 기록하면 주간 리포트에 자동 합산">
                오가닉 매체 현황
              </SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="네이버 블로그 · 이번 주"
                  value={fmtNum(blogThisWeek)}
                  unit="회"
                  delta={<Delta curr={blogThisWeek} prev={blogLastWeek} unit="회" />}
                  color="#03C75A"
                />
                <MetricCard
                  label="네이버 블로그 · 누적"
                  value={fmtNum(blogAllTime)}
                  unit="회"
                  delta={<span className="text-xs text-neutral-500">기록 {blog.length}일</span>}
                />
                <MetricCard
                  label="링크드인 · 이번 주"
                  value={fmtNum(linkedinThisWeek)}
                  unit="회"
                  delta={<Delta curr={linkedinThisWeek} prev={linkedinLastWeek} unit="회" />}
                  color="#0A66C2"
                />
                <MetricCard
                  label="링크드인 · 누적"
                  value={fmtNum(linkedinAllTime)}
                  unit="회"
                  delta={<span className="text-xs text-neutral-500">기록 {linkedin.length}일</span>}
                />
              </div>
            </section>

            {/* 입력 폼 */}
            <section className="bg-white rounded-2xl p-6 border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">일별 조회수 기록</h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    같은 날짜를 다시 입력하면 덮어씁니다
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                {/* 매체 토글 */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">매체</label>
                  <div className="inline-flex rounded-lg overflow-hidden border border-neutral-200">
                    <button
                      onClick={() => setOrganicInput({ ...organicInput, source: 'blog' })}
                      className={'px-4 py-2 text-sm font-semibold transition-colors ' +
                        (organicInput.source === 'blog' ? 'bg-green-100 text-green-800' : 'text-neutral-500 hover:bg-neutral-50')}
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 align-middle" />
                      네이버 블로그
                    </button>
                    <button
                      onClick={() => setOrganicInput({ ...organicInput, source: 'linkedin' })}
                      className={'px-4 py-2 text-sm font-semibold transition-colors border-l border-neutral-200 ' +
                        (organicInput.source === 'linkedin' ? 'bg-blue-100 text-blue-800' : 'text-neutral-500 hover:bg-neutral-50')}
                    >
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2 align-middle" />
                      링크드인
                    </button>
                  </div>
                </div>

                {/* 날짜 */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">날짜</label>
                  <input
                    type="date"
                    value={organicInput.date}
                    onChange={e => setOrganicInput({ ...organicInput, date: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 transition-colors tabular-nums"
                  />
                </div>

                {/* 조회수 */}
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1.5">조회수</label>
                  <input
                    type="number"
                    min="0"
                    value={organicInput.views}
                    onChange={e => setOrganicInput({ ...organicInput, views: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addOrganic(); }}
                    placeholder="예) 15"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 transition-colors tabular-nums"
                  />
                </div>

                <button
                  onClick={addOrganic}
                  disabled={!organicInput.views || isNaN(parseInt(organicInput.views, 10))}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  <Plus size={16} /> 기록
                </button>
              </div>

              <div className="mt-3 text-xs text-neutral-500">
                Tip — 오늘 날짜가 기본값으로 들어있습니다. 조회수 입력 후 Enter로 빠르게 기록하세요.
              </div>
            </section>

            {/* 일별 추이 차트 */}
            <section className="bg-white rounded-2xl p-8 border border-neutral-200">
              <SectionTitle subtitle="최근 30일 · 매체별 스택">일별 조회수 추이</SectionTitle>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={organicDaily} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#e5e5e5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} tickFormatter={fmtDate} axisLine={{ stroke: '#e5e5e5' }} tickLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: 'none', borderRadius: 8, fontSize: 12, padding: '8px 12px' }}
                      labelStyle={{ color: '#fbbf24', marginBottom: 4 }}
                      itemStyle={{ color: '#fafafa' }}
                      formatter={v => v + '회'}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="blog"     stackId="o" fill="#03C75A" name="네이버 블로그" />
                    <Bar dataKey="linkedin" stackId="o" fill="#0A66C2" name="링크드인" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {organicDaily.every(d => d.blog === 0 && d.linkedin === 0) && (
                <div className="mt-4 text-center text-sm text-neutral-500">
                  아직 기록된 조회수가 없습니다. 위 폼에서 입력해보세요.
                </div>
              )}
            </section>

            {/* 기록 리스트 (2단 컬럼) */}
            <section className="grid grid-cols-2 gap-4">
              {/* 네이버 블로그 리스트 */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <h3 className="text-base font-bold">네이버 블로그</h3>
                  </div>
                  <span className="text-xs text-neutral-500 tabular-nums">{blog.length}일 기록</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {blog.length === 0 ? (
                    <div className="text-center py-12 text-sm text-neutral-500">기록 없음</div>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-neutral-100">
                        {blog.slice(0, 60).map(b => (
                          <tr key={b.date} className="hover:bg-neutral-50 group">
                            <td className="px-5 py-2.5 text-neutral-600 tabular-nums text-xs w-28">{b.date}</td>
                            <td className="px-5 py-2.5 tabular-nums font-semibold text-neutral-900">{fmtNum(b.views)}<span className="text-xs text-neutral-400 font-normal ml-1">회</span></td>
                            <td className="px-5 py-2.5 w-10 text-right">
                              <button
                                onClick={() => deleteOrganic('blog', b.date)}
                                className="text-xs text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="삭제"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* 링크드인 리스트 */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    <h3 className="text-base font-bold">링크드인</h3>
                  </div>
                  <span className="text-xs text-neutral-500 tabular-nums">{linkedin.length}일 기록</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {linkedin.length === 0 ? (
                    <div className="text-center py-12 text-sm text-neutral-500">
                      아직 기록 없음 — 위 폼에서<br />
                      &apos;링크드인&apos; 선택 후 입력해보세요
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-neutral-100">
                        {linkedin.slice(0, 60).map(b => (
                          <tr key={b.date} className="hover:bg-neutral-50 group">
                            <td className="px-5 py-2.5 text-neutral-600 tabular-nums text-xs w-28">{b.date}</td>
                            <td className="px-5 py-2.5 tabular-nums font-semibold text-neutral-900">{fmtNum(b.views)}<span className="text-xs text-neutral-400 font-normal ml-1">회</span></td>
                            <td className="px-5 py-2.5 w-10 text-right">
                              <button
                                onClick={() => deleteOrganic('linkedin', b.date)}
                                className="text-xs text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="삭제"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        <footer className="mt-10 pt-6 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-500">
          <span>K-Beauty SEA Outbound · Weekly Report</span>
          <span>
            리스트 {leads.length}곳 · 발송 {funnelCumulative.sent} · 미팅 {funnelCumulative.meeting} · 성사 {funnelCumulative.won}
          </span>
        </footer>
      </main>
    </div>
  );
}
