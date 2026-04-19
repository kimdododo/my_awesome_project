'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line, Legend, Cell
} from 'recharts';
import {
  Plus, ArrowUpRight, ArrowDownRight, Minus, Search,
  Cloud, CloudOff, Loader2, Target, Wallet, Users, Trash2, Check, X, Info,
  LayoutDashboard, ClipboardPenLine, Pencil,
} from 'lucide-react';
import { SEED } from '../data/seed';
import { INITIAL_WEEKLY_AD_ROWS } from '../data/weeklyAdsSeed';
import { parseWeeklyAdsPaste } from '../lib/weeklyAdsPaste';
import { DAILY_AD_ANCHOR_DEFAULT, dateForOffset, offsetForDate } from '../lib/dailyAdsDates';

/* ============================================================
   CONFIG
   ============================================================ */
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeEmptyAdRow(forDay) {
  return {
    weekStart: weekStart(forDay),
    weekLabel: '',
    impressions: '', clicks: '', adConversions: '',
    ctr: '', cpc: '', cost: '',
    convCarisAds: '', convPhone: '', convChannelTalk: '',
  };
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

/* ============================================================
   UTILITIES
   ============================================================ */
const fmtNum = n => (n ?? 0).toLocaleString('ko-KR');
const fmtKRW = n => '₩' + (n ?? 0).toLocaleString('ko-KR');
const fmtKRWM = n => {
  const v = n ?? 0;
  if (v >= 1e6) return '₩' + (v/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '₩' + (v/1e3).toFixed(0) + 'K';
  return '₩' + v;
};
const fmtPct = (n, d = 0) => (n == null ? '—' : (n * 100).toFixed(d) + '%');
const shortNum = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v;

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
    <div className={'bg-white rounded-2xl border border-neutral-200 ' + className} {...rest}>
      {children}
    </div>
  );
}

function MiniStat({ label, value, unit, delta, sub, accent, icon: Icon }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-neutral-400" />}
        <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">{label}</div>
      </div>
      <div className="flex items-baseline gap-1" style={{ color: accent || '#0a0a0a' }}>
        <span className="text-4xl font-bold tabular-nums" style={{ letterSpacing: '-0.02em' }}>{value}</span>
        {unit && <span className="text-base text-neutral-400 ml-0.5">{unit}</span>}
      </div>
      {delta && <div className="mt-2">{delta}</div>}
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, subtitle, right }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-neutral-900" style={{ letterSpacing: '-0.01em' }}>{children}</h2>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
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
  const [dailyChannelFilter, setDailyChannelFilter] = useState('all');
  const [newDaily, setNewDaily] = useState(() => ({ ch: 'N', date: localISODate() }));

  // ─── Brand stages ───
  const [brandStages, setBrandStages] = useState({});
  const [stageHistory, setStageHistory] = useState([]);

  // ─── UI state ───
  const [tab, setTab] = useState('week');
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrand, setNewBrand] = useState({ brand: '', countries: '', email: '', platform: '' });
  const [leadEdit, setLeadEdit] = useState(null);

  // ─── Input panels (데이터 입력 탭) ───
  const [newAdRow, setNewAdRow] = useState(() => makeEmptyAdRow(localISODate()));
  const [pasteText, setPasteText] = useState('');
  const [pasteMsg, setPasteMsg] = useState(null);
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
    if (!confirm('모든 입력 데이터를 초기화합니다.\n콜드 리스트 단계, 추가 브랜드, 주간 광고 행, 일별 N/G/M 시트, 링크드인·블로그 추가 기록이 모두 사라집니다.\n되돌릴 수 없습니다. 계속할까요?')) return;
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
     WEEKLY ADS — AGGREGATIONS
     ──────────────────────────────────────────── */
  const weeklySorted = useMemo(
    () => [...weeklyAdRows].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    [weeklyAdRows]
  );

  const thisWeekAd = useMemo(() => weeklyAdRows.find(r => r.weekStart === thisWeekStart) || null, [weeklyAdRows, thisWeekStart]);
  const lastWeekAd = useMemo(() => weeklyAdRows.find(r => r.weekStart === lastWeekStart) || null, [weeklyAdRows, lastWeekStart]);

  const last8 = useMemo(() => weeklySorted.slice(-8), [weeklySorted]);

  /* ────────────────────────────────────────────
     COLD LIST STAGES
     ──────────────────────────────────────────── */
  const allBrands = useMemo(
    () => Array.from(new Set([...leads.map(l => l.brand), ...Object.keys(brandStages)])).sort(),
    [leads, brandStages]
  );

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

  const weeklyStageChange = useMemo(() => {
    const thisWeek = { sent: 0, replied: 0, meeting: 0, won: 0 };
    const lastWeek = { sent: 0, replied: 0, meeting: 0, won: 0 };
    stageHistory.forEach(h => {
      if (h.date >= thisWeekStart && h.date <= todayStr && thisWeek[h.stage] != null) thisWeek[h.stage]++;
      if (h.date >= lastWeekStart && h.date <= lastWeekEnd && lastWeek[h.stage] != null) lastWeek[h.stage]++;
    });
    return { thisWeek, lastWeek };
  }, [stageHistory, thisWeekStart, lastWeekStart, lastWeekEnd, todayStr]);

  /* ────────────────────────────────────────────
     ORGANIC
     ──────────────────────────────────────────── */
  const blogThisWeek = useMemo(() => blog.filter(b => b.date >= thisWeekStart && b.date <= todayStr).reduce((s, b) => s + b.views, 0), [blog, thisWeekStart, todayStr]);
  const blogLastWeek = useMemo(() => blog.filter(b => b.date >= lastWeekStart && b.date <= lastWeekEnd).reduce((s, b) => s + b.views, 0), [blog, lastWeekStart, lastWeekEnd]);
  const linkedinThisWeek = useMemo(() => linkedin.filter(b => b.date >= thisWeekStart && b.date <= todayStr).reduce((s, b) => s + b.views, 0), [linkedin, thisWeekStart, todayStr]);
  const linkedinLastWeek = useMemo(() => linkedin.filter(b => b.date >= lastWeekStart && b.date <= lastWeekEnd).reduce((s, b) => s + b.views, 0), [linkedin, lastWeekStart, lastWeekEnd]);

  const funnelChartData = useMemo(() => ([
    { key: 'total', label: '전체', count: leads.length },
    { key: 'sent', label: '발송', count: funnelCumulative.sent },
    { key: 'replied', label: '회신', count: funnelCumulative.replied },
    { key: 'meeting', label: '미팅', count: funnelCumulative.meeting },
    { key: 'won', label: '성사', count: funnelCumulative.won },
  ]), [leads.length, funnelCumulative]);

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

  const filteredDailyRows = useMemo(() => {
    const rows = dailyChannelFilter === 'all'
      ? dailyAdRows
      : dailyAdRows.filter(r => r.ch === dailyChannelFilter);
    return [...rows].sort((a, b) => {
      const da = dateForOffset(dailyAdsAnchor, a.o);
      const db = dateForOffset(dailyAdsAnchor, b.o);
      if (da !== db) return db.localeCompare(da);
      return a.ch.localeCompare(b.ch);
    });
  }, [dailyAdRows, dailyChannelFilter, dailyAdsAnchor]);

  const dailyThisWeekTotals = useMemo(() => {
    const t = {
      N: { imp: 0, clk: 0, cv: 0, co: 0 },
      G: { imp: 0, clk: 0, cv: 0, co: 0 },
      M: { imp: 0, clk: 0, cv: 0, co: 0 },
    };
    for (const r of dailyAdRows) {
      const d = dateForOffset(dailyAdsAnchor, r.o);
      if (d < thisWeekStart || d > todayStr) continue;
      if (!t[r.ch]) continue;
      t[r.ch].imp += r.imp;
      t[r.ch].clk += r.clk;
      t[r.ch].cv += r.cv;
      t[r.ch].co += r.co;
    }
    return t;
  }, [dailyAdRows, dailyAdsAnchor, thisWeekStart, todayStr]);

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

  function patchDailyRow(ch, o, patch) {
    setDailyAdRows(prev => prev.map(r => (r.ch === ch && r.o === o ? { ...r, ...patch } : r)));
  }

  function setDailyField(ch, o, key, rawVal) {
    const n = parseInt(String(rawVal).replace(/[,₩\s]/g, ''), 10);
    const v = Number.isFinite(n) && n >= 0 ? n : 0;
    patchDailyRow(ch, o, { [key]: v });
  }

  function addDailyRowFromForm() {
    const ch = newDaily.ch;
    const dateStr = newDaily.date;
    if (!dateStr || !['N', 'G', 'M'].includes(ch)) return;
    const o = offsetForDate(dailyAdsAnchor, dateStr);
    if (!Number.isFinite(o)) return;
    setDailyAdRows(prev => {
      if (prev.some(r => r.ch === ch && r.o === o)) {
        alert('같은 매체·같은 날짜 행이 이미 있습니다. 아래 표에서 수정하세요.');
        return prev;
      }
      return [...prev, { o, ch, imp: 0, clk: 0, cv: 0, co: 0 }].sort((a, b) => {
        if (a.ch !== b.ch) return a.ch.localeCompare(b.ch);
        return a.o - b.o;
      });
    });
  }

  function deleteDailyRow(ch, o) {
    if (!confirm('이 일별 행을 삭제할까요?')) return;
    setDailyAdRows(prev => prev.filter(r => !(r.ch === ch && r.o === o)));
  }

  /* ────────────────────────────────────────────
     WEEKLY AD: manual add + paste
     ──────────────────────────────────────────── */
  function addWeeklyAdRow() {
    const row = newAdRow;
    if (!row.weekStart) { alert('주 시작일(월요일)을 입력하세요'); return; }
    const ws = weekStart(row.weekStart); // 월요일 보정
    const impressions = parseInt(row.impressions, 10) || 0;
    const clicks = parseInt(row.clicks, 10) || 0;
    const adConversions = parseInt(row.adConversions, 10) || 0;
    const cost = parseInt(String(row.cost).replace(/[₩,\s]/g, ''), 10) || 0;
    const convCarisAds = parseInt(row.convCarisAds, 10) || 0;
    const convPhone = parseInt(row.convPhone, 10) || 0;
    const convChannelTalk = parseInt(row.convChannelTalk, 10) || 0;
    const totalConversions = convCarisAds + convPhone + convChannelTalk;
    const cpc = clicks ? Math.round(cost / clicks) : 0;
    const ctr = impressions ? clicks / impressions : 0;
    const cpa = totalConversions ? Math.round(cost / totalConversions) : 0;

    const newEntry = {
      weekStart: ws,
      weekLabel: row.weekLabel.trim(),
      impressions, clicks, adConversions,
      ctr, cpc, cost,
      convCarisAds, convPhone, convChannelTalk,
      totalConversions, cpa,
    };

    setWeeklyAdRows(p => {
      const filtered = p.filter(r => r.weekStart !== ws);
      return [...filtered, newEntry].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    });
    setNewAdRow(makeEmptyAdRow(todayStr));
    setPasteMsg({ kind: 'ok', text: `${ws} 주 데이터가 저장되었습니다. (총 전환 ${totalConversions}건)` });
    setTimeout(() => setPasteMsg(null), 4000);
  }

  function deleteWeeklyAdRow(ws) {
    if (!confirm(`${ws} 주 광고 행을 삭제하시겠어요?`)) return;
    setWeeklyAdRows(p => p.filter(r => r.weekStart !== ws));
  }

  function applyPaste() {
    const { rows, errors } = parseWeeklyAdsPaste(pasteText);
    if (!rows.length) {
      setPasteMsg({ kind: 'error', text: '인식된 행이 없습니다. 탭 구분된 표를 붙여넣으세요. ' + (errors[0] || '') });
      return;
    }
    setWeeklyAdRows(prev => {
      const map = new Map(prev.map(r => [r.weekStart, r]));
      rows.forEach(r => map.set(r.weekStart, r));
      return [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    });
    setPasteText('');
    setPasteMsg({
      kind: 'ok',
      text: `${rows.length}개 주 데이터가 저장되었습니다` + (errors.length ? ` (경고 ${errors.length}건)` : ''),
    });
    setTimeout(() => setPasteMsg(null), 5000);
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

  /* ────────────────────────────────────────────
     Headline (for This Week tab)
     ──────────────────────────────────────────── */
  const headline = useMemo(() => {
    if (thisWeekAd) {
      const total = thisWeekAd.totalConversions || 0;
      const last = lastWeekAd?.totalConversions || 0;
      const diff = total - last;
      if (total > 0) {
        if (diff > 0) return `이번 주 총 전환 ${total}건 · 전주 대비 +${diff}건`;
        if (diff < 0) return `이번 주 총 전환 ${total}건 · 전주 대비 ${diff}건`;
        return `이번 주 총 전환 ${total}건 · 전주와 동일`;
      }
    }
    const ch = weeklyStageChange.thisWeek;
    if (ch.won > 0) return `이번 주 성사 ${ch.won}건 — 결실!`;
    if (ch.meeting > 0) return `이번 주 미팅 ${ch.meeting}건 잡힘`;
    if (ch.sent > 0) return `이번 주 콜드메일 ${ch.sent}곳 발송`;
    return '이번 주 데이터를 입력해주세요';
  }, [thisWeekAd, lastWeekAd, weeklyStageChange]);

  /* ────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-white text-neutral-900" style={{ fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css');
        .tabular-nums { font-variant-numeric: tabular-nums; }
      `}</style>

      {/* HEADER */}
      <header className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-4 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] text-neutral-500 font-semibold uppercase tracking-[0.12em] mb-1">CARIS · 주간 대시보드</div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900">K-Beauty SEA Outbound</h1>
            <p className="text-xs text-neutral-500 mt-1.5 max-w-md leading-relaxed">
              엑셀 시트를 나눠 쓰지 말고, 이 앱 한 곳에 주간 광고·오가닉·콜드 리스트를 입력하세요. 저장되면 팀 전체가 같은 데이터를 봅니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 sm:justify-end">
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
        </div>
      </header>

      {/* TAB BAR */}
      <div className="bg-white backdrop-blur border-b border-neutral-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 flex gap-1 sm:gap-2 overflow-x-auto pb-px">
          {[
            { id: 'week',  label: '이번 주',     sub: '한눈에 보기', Icon: LayoutDashboard },
            { id: 'leads', label: '콜드 리스트', sub: '연락처 · 진행 단계', Icon: Users },
            { id: 'input', label: '데이터 입력', sub: '숫자 기록', Icon: ClipboardPenLine },
          ].map(t => {
            const Icon = t.Icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={'flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left border-b-2 transition-colors shrink-0 rounded-t-lg ' +
                  (active ? 'border-neutral-900 bg-white text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50/80')}
              >
                <span className={'p-1.5 rounded-lg border ' + (active ? 'bg-white border-neutral-300 text-neutral-800' : 'bg-white border-transparent text-neutral-500')}>
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-sm font-bold">{t.label}</span>
                  <span className="block text-[10px] font-medium mt-0.5 opacity-70">{t.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-8 py-8">

        {/* ═══════════════════════════════════ TAB: 이번 주 ═══════════════════════════════════ */}
        {tab === 'week' && (
          <div className="space-y-6">

            {/* HERO — 이번 주 가장 중요한 숫자 */}
            <Card className="overflow-hidden border-neutral-200 shadow-sm">
              <div className="p-8 bg-white">
                <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">
                  <Target size={14} className="text-neutral-400" />
                  이번 주 광고로 들어온 문의·전환 (건수)
                </div>
                {thisWeekAd ? (
                  <>
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="tabular-nums font-bold text-neutral-900" style={{ fontSize: 96, lineHeight: 1, letterSpacing: '-0.04em' }}>
                        {fmtNum(thisWeekAd.totalConversions)}
                      </span>
                      <span className="text-3xl text-neutral-400 font-medium">건</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
                      {lastWeekAd ? (
                        (() => {
                          const diff = thisWeekAd.totalConversions - lastWeekAd.totalConversions;
                          const up = diff > 0;
                          const flat = diff === 0;
                          const color = flat ? 'text-neutral-500' : up ? 'text-neutral-800' : 'text-neutral-500';
                          const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
                          return (
                            <span className={'inline-flex items-center gap-1 font-semibold ' + color}>
                              <Icon size={16} strokeWidth={2.5} />
                              {flat ? '전주와 동일' : (up ? '+' : '') + diff + '건 vs 전주 ' + lastWeekAd.totalConversions + '건'}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-neutral-500">전주 데이터 없음</span>
                      )}
                      <span className="text-neutral-300">|</span>
                      <span className="text-neutral-600">{thisWeekAd.weekLabel || thisWeekStart}</span>
                    </div>
                    <div className="mt-6 pt-6 border-t border-neutral-200 grid grid-cols-3 gap-6">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-2">
                          <span className="w-2 h-2 rounded-full bg-neutral-400" />
                          카리스 애드
                        </div>
                        <div className="text-3xl font-bold tabular-nums text-neutral-900">{thisWeekAd.convCarisAds}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {thisWeekAd.totalConversions ? ((thisWeekAd.convCarisAds / thisWeekAd.totalConversions) * 100).toFixed(0) + '%' : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-2">
                          <span className="w-2 h-2 rounded-full bg-neutral-400" />
                          유선
                        </div>
                        <div className="text-3xl font-bold tabular-nums text-neutral-900">{thisWeekAd.convPhone}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {thisWeekAd.totalConversions ? ((thisWeekAd.convPhone / thisWeekAd.totalConversions) * 100).toFixed(0) + '%' : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase tracking-wider mb-2">
                          <span className="w-2 h-2 rounded-full bg-neutral-400" />
                          채널톡
                        </div>
                        <div className="text-3xl font-bold tabular-nums text-neutral-900">{thisWeekAd.convChannelTalk}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {thisWeekAd.totalConversions ? ((thisWeekAd.convChannelTalk / thisWeekAd.totalConversions) * 100).toFixed(0) + '%' : '—'}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="tabular-nums font-bold text-neutral-300" style={{ fontSize: 96, lineHeight: 1, letterSpacing: '-0.04em' }}>—</span>
                    </div>
                    <p className="text-neutral-500 mb-5">이번 주 ({thisWeekStart} 월요일 기준) 숫자가 아직 없습니다. 아래 버튼에서 입력할 수 있습니다.</p>
                    <button
                      type="button"
                      onClick={() => setTab('input')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-50 font-semibold rounded-lg text-sm transition-colors shadow-sm"
                    >
                      <Plus size={16} /> 이번 주 숫자 입력하기
                    </button>
                  </>
                )}
              </div>

              {/* 8-week trend inside hero card */}
              {last8.length > 0 && (
                <div className="p-6 border-t border-neutral-200">
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">최근 8주 총 전환 추이</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">막대 = 총 전환수 · 점선 = CPA</p>
                    </div>
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer>
                      <ComposedChart data={last8} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="#e5e5e5" vertical={false} />
                        <XAxis
                          dataKey="weekLabel"
                          tick={{ fontSize: 10, fill: '#737373' }}
                          axisLine={{ stroke: '#e5e5e5' }}
                          tickLine={false}
                          interval={0}
                          tickFormatter={(v) => v ? v.replace(/^\d{4}\./, '').replace('월', '/').replace('주차', '주') : ''}
                        />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#a3a3a3' }} axisLine={false} tickLine={false} tickFormatter={shortNum} />
                        <Tooltip
                          contentStyle={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12, padding: '8px 12px' }}
                          labelStyle={{ color: '#171717', marginBottom: 4, fontWeight: 600 }}
                          itemStyle={{ color: '#404040' }}
                          formatter={(v, name) => name === 'CPA' ? fmtKRW(v) : v + '건'}
                        />
                        <Bar yAxisId="left" dataKey="totalConversions" name="총 전환" radius={[4, 4, 0, 0]}>
                          {last8.map((row) => (
                            <Cell key={row.weekStart} fill={row.weekStart === thisWeekStart ? '#404040' : '#d4d4d4'} />
                          ))}
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="cpa" name="CPA" stroke="#737373" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </Card>

            {/* SECONDARY METRICS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <MiniStat
                  label="광고비"
                  value={thisWeekAd ? fmtKRWM(thisWeekAd.cost) : '—'}
                  delta={thisWeekAd && lastWeekAd ? <Delta curr={thisWeekAd.cost} prev={lastWeekAd.cost} invert /> : null}
                  sub={thisWeekAd ? 'CPA ' + (thisWeekAd.cpa ? fmtKRW(thisWeekAd.cpa) : '—') : '입력 필요'}
                  icon={Wallet}
                />
              </Card>
              <Card>
                <MiniStat
                  label="콜드 발송 (이번 주)"
                  value={fmtNum(weeklyStageChange.thisWeek.sent)}
                  unit="곳"
                  delta={<Delta curr={weeklyStageChange.thisWeek.sent} prev={weeklyStageChange.lastWeek.sent} unit="곳" small />}
                  sub={`누적 ${funnelCumulative.sent} / ${leads.length} (${fmtPct(funnelCumulative.sent / (leads.length || 1))})`}
                  accent="#171717"
                  icon={Users}
                />
              </Card>
              <Card>
                <MiniStat
                  label="미팅 성사 (이번 주)"
                  value={fmtNum(weeklyStageChange.thisWeek.meeting + weeklyStageChange.thisWeek.won)}
                  unit="건"
                  delta={<Delta curr={weeklyStageChange.thisWeek.meeting + weeklyStageChange.thisWeek.won} prev={weeklyStageChange.lastWeek.meeting + weeklyStageChange.lastWeek.won} unit="건" small />}
                  sub={`누적 미팅 ${funnelCumulative.meeting} · 성사 ${funnelCumulative.won}`}
                  accent="#171717"
                  icon={Check}
                />
              </Card>
            </div>

            {/* HEADLINE (간단 요약) */}
            <Card className="p-5 bg-white border-neutral-200">
              <div className="flex items-start gap-3">
                <div className="w-1 h-12 bg-neutral-300 rounded-full shrink-0 mt-1" />
                <div>
                  <div className="text-xs text-neutral-500 font-semibold uppercase tracking-[0.15em] mb-1">이번 주 한 줄 요약</div>
                  <h2 className="text-lg font-bold leading-snug text-neutral-900">{headline}</h2>
                </div>
              </div>
            </Card>

            {/* 파이프라인 현황 */}
            <Card className="p-6">
              <SectionTitle
                subtitle="리스트에서 가장 진행된 단계 기준 누적"
                right={<button onClick={() => setTab('leads')} className="text-xs text-neutral-500 hover:text-neutral-900 font-semibold">전체 리스트 →</button>}
              >
                콜드 파이프라인
              </SectionTitle>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: '전체 리드', count: leads.length, color: '#171717' },
                  { label: '발송',     count: funnelCumulative.sent,     color: '#404040' },
                  { label: '회신',     count: funnelCumulative.replied,  color: '#404040' },
                  { label: '미팅',     count: funnelCumulative.meeting,  color: '#404040' },
                  { label: '성사',     count: funnelCumulative.won,      color: '#171717' },
                ].map((s, i, arr) => {
                  const prev = i === 0 ? null : arr[i - 1];
                  const rate = prev && prev.count > 0 ? (s.count / prev.count) : null;
                  return (
                    <div key={s.label} className="p-3 rounded-lg bg-white border border-neutral-200">
                      <div className="text-xs text-neutral-500 font-semibold mb-1.5">{s.label}</div>
                      <div className="font-bold tabular-nums" style={{ fontSize: 28, lineHeight: 1, color: s.color }}>{fmtNum(s.count)}</div>
                      {rate != null && <div className="text-[11px] text-neutral-500 mt-1">→ {fmtPct(rate)}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <div className="h-2 bg-white border border-neutral-200 rounded-full overflow-hidden">
                  <div className="h-full bg-neutral-400 rounded-full transition-all duration-700" style={{ width: ((funnelCumulative.sent / (leads.length || 1)) * 100) + '%' }} />
                </div>
                <div className="mt-1.5 text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-900">{funnelCumulative.sent}</span>
                  <span className="text-neutral-400"> / {leads.length}</span>
                  <span className="ml-2">발송 진척 {fmtPct(funnelCumulative.sent / (leads.length || 1))}</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-neutral-200">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-neutral-900">단계별 누적 (막대)</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">각 단계 이상으로 진행된 리드 수 · 위 숫자 카드와 동일한 기준입니다.</p>
                </div>
                <div className="h-44 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#e5e5e5" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#737373' }}
                        axisLine={{ stroke: '#e5e5e5' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12, padding: '8px 12px' }}
                        labelStyle={{ color: '#171717', marginBottom: 4, fontWeight: 600 }}
                        formatter={(v) => [`${fmtNum(v)}곳`, '누적']}
                      />
                      <Bar dataKey="count" name="리드" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {funnelChartData.map((row, i) => (
                          <Cell key={row.key} fill={i === 0 ? '#737373' : '#d4d4d4'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            {/* 오가닉 요약 */}
            <Card className="p-6">
              <SectionTitle
                subtitle="자연 유입 · 매일 기록하면 여기에 반영"
                right={<button onClick={() => setTab('input')} className="text-xs text-neutral-500 hover:text-neutral-900 font-semibold">기록하기 →</button>}
              >
                오가닉 유입 (이번 주)
              </SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-neutral-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-neutral-400" />
                    <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">네이버 블로그</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-neutral-900">{fmtNum(blogThisWeek)}<span className="text-sm text-neutral-500 ml-1 font-normal">회</span></div>
                  <div className="mt-1.5"><Delta curr={blogThisWeek} prev={blogLastWeek} unit="회" small /></div>
                </div>
                <div className="p-4 rounded-xl bg-white border border-neutral-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-neutral-400" />
                    <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">링크드인</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-neutral-900">{fmtNum(linkedinThisWeek)}<span className="text-sm text-neutral-500 ml-1 font-normal">회</span></div>
                  <div className="mt-1.5"><Delta curr={linkedinThisWeek} prev={linkedinLastWeek} unit="회" small /></div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-neutral-200">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-neutral-900">최근 14일 일별 조회수</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">날짜별 막대 = 블로그·링크드인 (둘 다 기록된 날은 나란히 표시)</p>
                </div>
                <div className="h-52 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={organicDailySeries} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="#e5e5e5" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: '#737373' }}
                        axisLine={{ stroke: '#e5e5e5' }}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#737373' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12, padding: '8px 12px' }}
                        labelFormatter={(_, p) => {
                          const d = p?.[0]?.payload?.d;
                          return d ? fmtKoreanDate(d) : '';
                        }}
                        formatter={(v, name) => [fmtNum(v) + '회', name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="blog" name="네이버 블로그" fill="#d4d4d4" radius={[2, 2, 0, 0]} maxBarSize={14} />
                      <Bar dataKey="linkedin" name="링크드인" fill="#a3a3a3" radius={[2, 2, 0, 0]} maxBarSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            <Card className="p-6 shadow-sm">
              <SectionTitle
                subtitle="일별 N/G/M 시트를 앱에 옮긴 합계(이번 주 월~오늘) · 앵커 날짜는 입력 탭에서 수정"
                right={<button type="button" onClick={() => { setTab('input'); setTimeout(() => document.getElementById('hub-daily')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }} className="text-xs text-neutral-500 hover:text-neutral-900 font-semibold">일별 시트 →</button>}
              >
                일별 매체 (이번 주)
              </SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { ch: 'N', label: '네이버' },
                  { ch: 'G', label: '구글' },
                  { ch: 'M', label: '메타' },
                ].map(({ ch, label }) => {
                  const x = dailyThisWeekTotals[ch];
                  return (
                    <div key={ch} className="rounded-xl border border-neutral-200 bg-white p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-neutral-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">{label}</span>
                      </div>
                      <div className="text-lg font-bold tabular-nums text-neutral-900">{fmtKRWM(x.co)}</div>
                      <div className="text-[11px] text-neutral-500 mt-1">노출 {fmtNum(x.imp)} · 클릭 {fmtNum(x.clk)} · 전환 {fmtNum(x.cv)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════ TAB: 콜드 리스트 ═══════════════════════════════════ */}
        {tab === 'leads' && (
          <div className="space-y-5">
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
          </div>
        )}

        {/* ═══════════════════════════════════ TAB: 데이터 입력 ═══════════════════════════════════ */}
        {tab === 'input' && (
          <div className="space-y-6">

            <div className="flex items-start gap-3 p-4 sm:p-5 bg-white border border-neutral-200 rounded-2xl">
              <Info size={20} className="text-neutral-500 shrink-0 mt-0.5" />
              <div className="text-sm text-neutral-700">
                <p className="font-bold text-base text-neutral-900 mb-1">한 곳에만 입력하세요</p>
                <p className="leading-relaxed text-neutral-600">
                  아래 순서대로 채우면 됩니다. 상단에 <span className="font-semibold text-neutral-800">저장됨</span>이 보이면 팀과 같은 데이터를 쓰는 것이며,{' '}
                  <span className="font-semibold text-neutral-800">이번 주</span> 탭의 숫자·그래프·요약이 함께 갱신됩니다. 엑셀 붙여넣기는 선택 사항입니다.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { id: 'hub-weekly', title: '1. 주간 핵심', desc: '전환·광고비 한 줄' },
                { id: 'hub-daily', title: '2. 일별 매체', desc: '네이버·구글·메타' },
                { id: 'hub-organic', title: '3. 블로그·SNS', desc: '조회수 일별' },
                { id: 'hub-leads', title: '4. 콜드 리스트', desc: '연락·진행', tab: 'leads' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (c.tab) setTab(c.tab);
                    else document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="text-left rounded-2xl p-4 bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">바로가기</div>
                  <div className="text-lg font-bold mt-1 text-neutral-900">{c.title}</div>
                  <div className="text-xs mt-1.5 text-neutral-500 leading-snug">{c.desc}</div>
                </button>
              ))}
            </div>

            {/* ─── 주간 광고 직접 입력 ─── */}
            <Card id="hub-weekly" className="p-6 scroll-mt-28 shadow-sm">
              <SectionTitle subtitle="한 주 = 한 행 · 빈 칸은 0으로 처리 · 같은 주 재입력 시 덮어쓰기">
                주간 광고 성과 입력
              </SectionTitle>

              <div className="grid grid-cols-12 gap-3 mb-3">
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">주 시작일 (월요일)</label>
                  <input
                    type="date"
                    value={newAdRow.weekStart}
                    onChange={e => setNewAdRow({ ...newAdRow, weekStart: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">라벨 (선택)</label>
                  <input
                    value={newAdRow.weekLabel}
                    onChange={e => setNewAdRow({ ...newAdRow, weekLabel: e.target.value })}
                    placeholder="2026.4월 3주차"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">노출</label>
                  <input
                    type="number"
                    value={newAdRow.impressions}
                    onChange={e => setNewAdRow({ ...newAdRow, impressions: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">클릭</label>
                  <input
                    type="number"
                    value={newAdRow.clicks}
                    onChange={e => setNewAdRow({ ...newAdRow, clicks: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">총 광고비 (₩)</label>
                  <input
                    type="number"
                    value={newAdRow.cost}
                    onChange={e => setNewAdRow({ ...newAdRow, cost: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 mb-3 border border-neutral-200">
                <div className="text-xs font-semibold text-neutral-600 mb-2">전환 내역 (총 전환 = 카리스 애드 + 유선 + 채널톡)</div>
                <div className="grid grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle bg-neutral-400" />
                      카리스 애드
                    </label>
                    <input
                      type="number"
                      value={newAdRow.convCarisAds}
                      onChange={e => setNewAdRow({ ...newAdRow, convCarisAds: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle bg-neutral-400" />
                      유선
                    </label>
                    <input
                      type="number"
                      value={newAdRow.convPhone}
                      onChange={e => setNewAdRow({ ...newAdRow, convPhone: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle bg-neutral-400" />
                      채널톡
                    </label>
                    <input
                      type="number"
                      value={newAdRow.convChannelTalk}
                      onChange={e => setNewAdRow({ ...newAdRow, convChannelTalk: e.target.value })}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                    />
                  </div>
                  <div>
                    <div className="block text-xs font-semibold text-neutral-600 mb-1">= 총 전환 (자동)</div>
                    <div className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-900 text-sm font-semibold tabular-nums text-center">
                      {(parseInt(newAdRow.convCarisAds, 10) || 0) + (parseInt(newAdRow.convPhone, 10) || 0) + (parseInt(newAdRow.convChannelTalk, 10) || 0)}건
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  같은 주를 다시 입력하면 <span className="font-semibold">덮어씁니다</span>. CTR / CPC / CPA는 자동 계산됩니다.
                </div>
                <button
                  onClick={addWeeklyAdRow}
                  className="px-5 py-2.5 bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-50 font-semibold rounded-lg text-sm flex items-center gap-2 shadow-sm"
                >
                  <Plus size={16} /> 주간 데이터 저장
                </button>
              </div>

              {pasteMsg && (
                <div className={'mt-3 px-4 py-2 rounded-lg text-sm font-medium ' +
                  (pasteMsg.kind === 'ok' ? 'bg-white text-neutral-800 border border-neutral-200' : 'bg-white text-neutral-800 border border-neutral-300')}>
                  {pasteMsg.text}
                </div>
              )}

              {/* 엑셀 붙여넣기 (접이식) */}
              <details className="mt-5 border-t border-neutral-100 pt-5">
                <summary className="cursor-pointer text-xs font-semibold text-neutral-500 hover:text-neutral-800 select-none">
                  엑셀 표 한 번에 붙여넣기 (대량 입력)
                </summary>
                <div className="mt-3">
                  <p className="text-xs text-neutral-500 mb-2">헤더 포함 13열. 탭 구분된 엑셀 행을 그대로 복사 → 붙여넣기</p>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    rows={6}
                    placeholder="2026-04-13	2026.4월 3주차	15000	200	3	1.33%	₩8000	₩1600000	5	1	2	8	₩200000"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs font-mono outline-none focus:border-neutral-900 resize-y"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={applyPaste}
                      disabled={!pasteText.trim()}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      붙여넣기 적용
                    </button>
                  </div>
                </div>
              </details>
            </Card>

            <Card id="hub-daily" className="p-6 scroll-mt-28 border-neutral-200 shadow-sm bg-white">
              <SectionTitle subtitle={`행 ${dailyAdRows.length}건 · 날짜 = 기준일 + 오프셋(o) · 기준일: ${dailyAdsAnchor}`}>
                일별 매체 시트 (네이버 · 구글 · 메타)
              </SectionTitle>
              <p className="text-xs text-neutral-600 mb-4 leading-relaxed">
                엑셀에서 쓰던 일 단위 시트를 여기로 옮겼습니다. 셀을 수정하면 자동 저장됩니다. 기준일을 바꾸면 같은 o라도 달력 열에 표시되는 날짜가 바뀌므로, 엑셀과 맞출 때만 조정하세요.
              </p>

              <div className="flex flex-wrap gap-3 items-end mb-4 p-4 bg-white rounded-xl border border-neutral-200">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">기준일 (o=0)</label>
                  <input
                    type="date"
                    value={dailyAdsAnchor}
                    onChange={e => setDailyAdsAnchor(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: '전체' },
                    { id: 'N', label: '네이버' },
                    { id: 'G', label: '구글' },
                    { id: 'M', label: '메타' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDailyChannelFilter(f.id)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ' +
                        (dailyChannelFilter === f.id ? 'bg-white text-neutral-900 border-neutral-900 shadow-sm' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300')}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-end mb-4 p-4 bg-white rounded-xl border border-neutral-200">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">매체</label>
                  <select
                    value={newDaily.ch}
                    onChange={e => setNewDaily({ ...newDaily, ch: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-neutral-300 text-sm bg-white outline-none focus:border-neutral-900"
                  >
                    <option value="N">네이버 (N)</option>
                    <option value="G">구글 (G)</option>
                    <option value="M">메타 (M)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">날짜</label>
                  <input
                    type="date"
                    value={newDaily.date}
                    onChange={e => setNewDaily({ ...newDaily, date: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-neutral-300 text-sm outline-none focus:border-neutral-900 tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={addDailyRowFromForm}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-50 shadow-sm"
                >
                  행 추가
                </button>
              </div>

              <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
                <div className="max-h-[420px] sm:max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="sticky top-0 bg-white border-b border-neutral-200 z-[1]">
                      <tr className="text-left text-neutral-600 font-semibold">
                        <th className="px-3 py-2.5">날짜</th>
                        <th className="px-2 py-2.5 w-10">매체</th>
                        <th className="px-2 py-2.5">o</th>
                        <th className="px-2 py-2.5 text-right">노출</th>
                        <th className="px-2 py-2.5 text-right">클릭</th>
                        <th className="px-2 py-2.5 text-right">전환</th>
                        <th className="px-2 py-2.5 text-right">비용(₩)</th>
                        <th className="px-2 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filteredDailyRows.map(r => {
                        const d = dateForOffset(dailyAdsAnchor, r.o);
                        return (
                          <tr key={r.ch + '-' + r.o} className="hover:bg-neutral-50/80 group">
                            <td className="px-3 py-1.5 tabular-nums text-neutral-700 whitespace-nowrap">{d}</td>
                            <td className="px-2 py-1.5 font-bold text-neutral-800">{r.ch}</td>
                            <td className="px-2 py-1.5 tabular-nums text-neutral-400">{r.o}</td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={r.imp}
                                onChange={e => setDailyField(r.ch, r.o, 'imp', e.target.value)}
                                className="w-full min-w-[4.5rem] max-w-[7rem] ml-auto text-right px-2 py-1 rounded border border-neutral-200 tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={r.clk}
                                onChange={e => setDailyField(r.ch, r.o, 'clk', e.target.value)}
                                className="w-full min-w-[4rem] max-w-[6rem] ml-auto text-right px-2 py-1 rounded border border-neutral-200 tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={r.cv}
                                onChange={e => setDailyField(r.ch, r.o, 'cv', e.target.value)}
                                className="w-full min-w-[4rem] max-w-[6rem] ml-auto text-right px-2 py-1 rounded border border-neutral-200 tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={r.co}
                                onChange={e => setDailyField(r.ch, r.o, 'co', e.target.value)}
                                className="w-full min-w-[5rem] max-w-[8rem] ml-auto text-right px-2 py-1 rounded border border-neutral-200 tabular-nums"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => deleteDailyRow(r.ch, r.o)}
                                className="p-1 text-neutral-400 hover:text-neutral-700 rounded opacity-60 group-hover:opacity-100"
                                title="행 삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {/* 저장된 주간 행 리스트 */}
            <Card className="overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold">저장된 주간 행 ({weeklyAdRows.length}주)</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">최신 순 · 이번 주 행은 안쪽 테두리로 구분</p>
                </div>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200">
                    <tr className="text-xs text-neutral-600 font-semibold">
                      <th className="text-left px-4 py-2.5">주 시작</th>
                      <th className="text-left px-4 py-2.5">라벨</th>
                      <th className="text-right px-4 py-2.5">광고비</th>
                      <th className="text-right px-4 py-2.5 text-neutral-900">총 전환</th>
                      <th className="text-right px-4 py-2.5">CPA</th>
                      <th className="px-2 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {[...weeklyAdRows].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).map((r, i) => {
                      const isThisWeek = r.weekStart === thisWeekStart;
                      return (
                        <tr key={r.weekStart} className={'group hover:bg-neutral-50/60 ' + (isThisWeek ? 'bg-white ring-1 ring-inset ring-neutral-200' : '')}>
                          <td className="px-4 py-2.5 tabular-nums text-xs">
                            {r.weekStart}
                            {isThisWeek && <span className="ml-1.5 text-[10px] font-bold text-neutral-700">이번 주</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-neutral-500">{r.weekLabel || '—'}</td>
                          <td className="px-4 py-2.5 tabular-nums text-right">{fmtKRWM(r.cost)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-right font-bold text-neutral-900">{fmtNum(r.totalConversions)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-right text-xs">{r.cpa ? fmtKRWM(r.cpa) : '—'}</td>
                          <td className="px-2 py-2.5">
                            <button
                              onClick={() => deleteWeeklyAdRow(r.weekStart)}
                              className="p-1.5 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* ─── 오가닉 조회수 입력 ─── */}
            <Card id="hub-organic" className="p-6 scroll-mt-28 shadow-sm">
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
        )}

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

        <footer className="mt-10 pt-6 border-t border-neutral-200 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-neutral-500">
          <span>K-Beauty SEA Outbound · Weekly Report</span>
          <span className="tabular-nums">
            이번 주 전환 {thisWeekAd ? thisWeekAd.totalConversions : '—'}건 · 리드 {leads.length}곳 · 미팅 {funnelCumulative.meeting}
          </span>
        </footer>
      </main>
    </div>
  );
}
