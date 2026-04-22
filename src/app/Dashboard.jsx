'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend,
  LineChart, Line,
} from 'recharts';
import {
  Plus, ArrowUpRight, ArrowDownRight, Minus, Search,
  Cloud, CloudOff, Loader2, Trash2, X,
  Pencil, ChevronRight, Send,
  Kanban, Users, BookOpen, TrendingUp,
} from 'lucide-react';
import { SEED } from '../data/seed';
import { INITIAL_CONVERSION_CHANNEL_ROWS } from '../data/conversionChannelSeed';
import { INITIAL_WEEKLY_AD_ROWS } from '../data/weeklyAdsSeed';
import { DAILY_AD_ANCHOR_DEFAULT } from '../lib/dailyAdsDates';
import { track } from '../lib/tracking/client';
import { renderColdEmail } from '../lib/email-template';

/* ============================================================
   CONFIG
   ============================================================ */
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLocalTimeHMS(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
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

function nonNegInt(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeConversionChannelRows(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') return null;
    const karisAd = nonNegInt(r.karisAd ?? r.karis_ad);
    const phone = nonNegInt(r.phone);
    const channelTalk = nonNegInt(r.channelTalk ?? r.channel_talk);
    const total = nonNegInt(r.total ?? r.total_conversions);
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `cc-${out.length}`;
    out.push({ id, karisAd, phone, channelTalk, total });
  }
  return out;
}

function cloneConversionChannelSeed() {
  return INITIAL_CONVERSION_CHANNEL_ROWS.map(r => ({ ...r }));
}

const LOCAL_BACKUP_KEY = 'kbeauty-dashboard:state:v1';
const LOCAL_EVENT_BACKUP_KEY = 'kbeauty-dashboard:events:v1';

function safeJsonStringify(v) {
  try { return JSON.stringify(v); } catch { return ''; }
}
async function trackEvent(name, props = {}) {
  const evt = {
    name,
    props,
    ts: new Date().toISOString(),
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
  };

  // Always keep local backup (for quick debugging / when KV is disconnected).
  try {
    const raw = window.localStorage.getItem(LOCAL_EVENT_BACKUP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(arr) ? [...arr, evt].slice(-300) : [evt];
    window.localStorage.setItem(LOCAL_EVENT_BACKUP_KEY, safeJsonStringify(next));
  } catch {
    // ignore
  }

  // Unified pipeline (UTM + sinks) — best-effort only.
  try {
    track(name, props, { legacy: { path: evt.path, ts: evt.ts } });
  } catch {
    // ignore
  }
}

/** 콜드 리스트 단계 — 필터 칩·단계 선택기 공통 팔레트 (명도 대비 유지) */
const STAGES = [
  {
    id: 'pending',
    label: '미발송',
    dot: '#64748b',
    chipOn: 'border-slate-300 bg-slate-100 text-slate-900 shadow-sm ring-1 ring-slate-200/80',
    chipOff: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/90',
    segOn: 'bg-slate-700 text-white shadow-sm ring-1 ring-slate-600/30',
    segOff: 'text-slate-500 hover:bg-white/80 hover:text-slate-800',
  },
  {
    id: 'sent',
    label: '발송',
    dot: '#0284c7',
    chipOn: 'border-sky-300 bg-sky-50 text-sky-950 shadow-sm ring-1 ring-sky-100',
    chipOff: 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70',
    segOn: 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-500/40',
    segOff: 'text-slate-600 hover:bg-sky-50/80 hover:text-sky-900',
  },
  {
    id: 'replied',
    label: '회신',
    dot: '#7c3aed',
    chipOn: 'border-violet-300 bg-violet-50 text-violet-950 shadow-sm ring-1 ring-violet-100',
    chipOff: 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50/70',
    segOn: 'bg-violet-600 text-white shadow-sm ring-1 ring-violet-500/40',
    segOff: 'text-slate-600 hover:bg-violet-50/80 hover:text-violet-900',
  },
  {
    id: 'meeting',
    label: '미팅',
    dot: '#ea580c',
    chipOn: 'border-orange-300 bg-orange-50 text-orange-950 shadow-sm ring-1 ring-orange-100',
    chipOff: 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/80',
    segOn: 'bg-orange-600 text-white shadow-sm ring-1 ring-orange-500/40',
    segOff: 'text-slate-600 hover:bg-orange-50/90 hover:text-orange-950',
  },
  {
    id: 'won',
    label: '성사',
    dot: '#059669',
    chipOn: 'border-emerald-400 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-100',
    chipOff: 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/80',
    segOn: 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/40',
    segOff: 'text-slate-600 hover:bg-emerald-50/90 hover:text-emerald-900',
  },
];
const STAGE_ORDER = { pending: 0, sent: 1, replied: 2, meeting: 3, won: 4 };

/** 파이프라인 막대 — 단계별 (스테퍼 색과 대응) */
const PIPELINE_BAR_FILL = {
  total: '#2c3c63',
  sent: '#1d6a96',
  replied: '#7c3aed',
  meeting: '#ea580c',
  won: '#059669',
};

/** 오가닉 일별 막대 — 네이버 블로그 초록 / 링크드인 블루 (표·카드와 동일 톤) */
const ORGANIC_BLOG_BAR = '#86efac';
const ORGANIC_BLOG_BAR_LAST = '#16a34a';
const ORGANIC_LI_BAR = '#93c5fd';
const ORGANIC_LI_BAR_LAST = '#2563eb';

/** 인바운드 리드 섹션 — 꺾은선 색상 */
const CC_LINE = {
  karisAd: { stroke: '#2563eb', fill: '#3b82f6' },
  phone: { stroke: '#7c3aed', fill: '#8b5cf6' },
  channelTalk: { stroke: '#ea580c', fill: '#f97316' },
  total: { stroke: '#0f766e', fill: '#14b8a6' },
};

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

/** Recharts 기본 Legend는 Bar마다 Cell로 색을 바꾸면 아이콘이 검정으로 나오는 경우가 있어 고정 범례 사용 */
function OrganicBarLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-7 gap-y-1 px-2 pt-2 text-[11px] font-semibold tracking-tight">
      <span className="inline-flex items-center gap-2 text-emerald-900">
        <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-white shadow-sm" style={{ backgroundColor: ORGANIC_BLOG_BAR_LAST }} />
        네이버 블로그
      </span>
      <span className="inline-flex items-center gap-2 text-blue-900">
        <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-white shadow-sm" style={{ backgroundColor: ORGANIC_LI_BAR_LAST }} />
        링크드인
      </span>
    </div>
  );
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

function SectionTitle({ children, right }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{children}</h2>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

const MAIN_NAV = [
  { id: 'pipeline', label: '콜드 파이프라인', short: '파이프라인', Icon: Kanban },
  { id: 'leads', label: '아웃바운드 리드', short: '리드', Icon: Users },
  { id: 'organic', label: '오가닉', short: '오가닉', Icon: BookOpen },
  { id: 'conversion', label: '인바운드 리드', short: '인바운드 리드', Icon: TrendingUp },
];

function MainNavButton({ item, active, onSelect, variant }) {
  const Icon = item.Icon;
  const isOn = active === item.id;
  if (variant === 'rail') {
    return (
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all ' +
          (isOn
            ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25 ring-1 ring-slate-800/60'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
        }
      >
        <Icon size={18} strokeWidth={2} className={isOn ? 'text-sky-300' : 'text-slate-400'} aria-hidden />
        <span className="min-w-0 leading-snug">{item.label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={
        'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-all ' +
        (isOn
          ? 'bg-slate-900 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300')
      }
    >
      {item.short}
    </button>
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
    <div
      className="inline-flex flex-nowrap gap-0.5 rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50 to-slate-100/90 p-0.5 shadow-sm"
      onClick={e => e.stopPropagation()}
    >
      {STAGES.map(s => {
        const active = current === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(s.id); }}
            className={
              'shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold tracking-tight transition-all duration-150 whitespace-nowrap ' +
              (active ? s.segOn : s.segOff)
            }
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function stageNextAction(stageId) {
  switch (stageId) {
    case 'pending':
      return { title: '첫 메일 발송', hint: '브랜드 담당자에게 1차 제안 메일을 보냅니다.' };
    case 'sent':
      return { title: '후속 메일(리마인드)', hint: 'D+2~3에 짧게 리마인드로 회신율을 끌어올립니다.' };
    case 'replied':
      return { title: '미팅 제안 보내기', hint: '가능 시간 2~3개 + 아젠다 3줄로 미팅 전환을 띄웁니다.' };
    case 'meeting':
      return { title: '오퍼/다음 스텝 확정', hint: '견적/패키지 + 마감일을 제시해 성사 확률을 올립니다.' };
    case 'won':
      return { title: '업셀 포인트 체크', hint: '재구매/확장 제안을 위한 성과 요약 3줄을 남깁니다.' };
    default:
      return { title: '다음 액션', hint: '' };
  }
}

function buildEmailTemplate({ brand, stageId, countries = [], platform = '' }) {
  const countryLine = countries?.length ? countries.join(', ') : '';
  const intro = `안녕하세요 ${brand} 팀 담당자님,\n\nK-Beauty 브랜드의 SEA(동남아) 유통/광고 성과 개선을 돕는 Caris입니다.`;
  const context = [
    countryLine ? `- 타겟 국가: ${countryLine}` : null,
    platform ? `- 현재/관심 플랫폼: ${platform}` : null,
  ].filter(Boolean).join('\n');

  if (stageId === 'pending') {
    return {
      subject: `[제안] ${brand} SEA 유통·광고 성과 개선 (15분 미팅)`,
      body:
        `${intro}\n\n` +
        (context ? `${context}\n\n` : '') +
        `간단히 15분만 시간 주시면,\n` +
        `1) SEA 채널별 성장 포인트 1~2개\n` +
        `2) 빠르게 테스트 가능한 액션(광고/입점/운영)\n` +
        `을 브랜드 상황에 맞춰 제안드리겠습니다.\n\n` +
        `이번 주 가능하신 시간대 2~3개만 공유해주실 수 있을까요?\n\n` +
        `감사합니다.\nCaris 드림\n`,
    };
  }
  if (stageId === 'sent') {
    return {
      subject: `[리마인드] ${brand} SEA 성과 개선 제안 드립니다`,
      body:
        `안녕하세요 ${brand} 팀 담당자님,\n\n` +
        `지난번에 SEA 유통/광고 성과 개선 관련해 짧게 제안드렸는데, 확인하셨을지 리마인드로 연락드립니다.\n` +
        `가능하시다면 15분만 통화/미팅으로 현재 상황을 듣고 빠른 액션을 제안드리고 싶습니다.\n\n` +
        `이번 주 가능 시간 2~3개만 회신 부탁드립니다.\n\n` +
        `감사합니다.\nCaris 드림\n`,
    };
  }
  if (stageId === 'replied') {
    return {
      subject: `[미팅 제안] ${brand} — 아젠다 공유드립니다`,
      body:
        `안녕하세요 ${brand} 팀 담당자님,\n\n` +
        `회신 감사합니다. 미팅은 15~20분이면 충분합니다.\n\n` +
        `아젠다(초안)\n` +
        `- 현재 SEA 채널 운영 현황(2~3분)\n` +
        `- 빠르게 개선 가능한 레버 2개(광고/입점/운영)\n` +
        `- 다음 액션과 일정\n\n` +
        `가능하신 시간 후보 2~3개와, 선호하시는 미팅 방식(Zoom/Google Meet) 알려주시면 바로 잡아드리겠습니다.\n\n` +
        `감사합니다.\nCaris 드림\n`,
    };
  }
  if (stageId === 'meeting') {
    return {
      subject: `[다음 스텝] ${brand} — 실행안/오퍼 공유`,
      body:
        `안녕하세요 ${brand} 팀 담당자님,\n\n` +
        `미팅 감사합니다. 논의 내용을 바탕으로 실행안/오퍼(초안)를 공유드립니다.\n` +
        `- 1차 목표: (예) 전환/리드 개선, 입점 준비\n` +
        `- 2주 내 실행 항목: (예) 캠페인 구조/크리에이티브 테스트\n` +
        `- 필요한 자료: (예) SKU/마진/현재 광고 데이터)\n\n` +
        `가능하시면 이번 주 내로 “진행 여부”만 먼저 확정해주시면, 다음 단계(자료/세팅)를 바로 시작하겠습니다.\n\n` +
        `감사합니다.\nCaris 드림\n`,
    };
  }
  return {
    subject: `[Follow-up] ${brand}`,
    body: `안녕하세요 ${brand} 팀 담당자님,\n\n감사합니다.\n`,
  };
}

function QuickLeadActions({ lead, stageId, onSendClick }) {
  const action = stageNextAction(stageId);
  const hasEmail = Boolean(lead?.email?.trim());
  const tmpl = buildEmailTemplate({
    brand: lead.brand,
    stageId,
    countries: lead.countries,
    platform: lead.platform,
  });

  const useSendFlow = stageId === 'pending' && Boolean(onSendClick);
  const mailto = hasEmail
    ? `mailto:${encodeURIComponent(lead.email.trim())}?subject=${encodeURIComponent(tmpl.subject)}&body=${encodeURIComponent(tmpl.body)}`
    : '#';

  return (
    <div className="flex flex-col items-end gap-1.5">
      {useSendFlow ? (
        <button
          type="button"
          onClick={() => {
            if (!hasEmail) return;
            trackEvent('cta_email_click', { brand: lead.brand, stageId, hasEmail: true });
            onSendClick(lead);
          }}
          disabled={!hasEmail}
          className={
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-sm ring-1 transition-all ' +
            (hasEmail
              ? 'bg-slate-900 text-white ring-slate-900/20 hover:bg-slate-800'
              : 'bg-slate-100 text-slate-400 ring-slate-200 cursor-not-allowed')
          }
          title={hasEmail ? '콜드메일 미리보기 후 발송' : '이메일이 없어서 발송할 수 없습니다.'}
        >
          <Send size={12} /> {action.title}
        </button>
      ) : (
        <a
          href={mailto}
          onClick={(e) => {
            if (!hasEmail) {
              e.preventDefault();
              return;
            }
            trackEvent('cta_email_click', { brand: lead.brand, stageId, hasEmail: true });
          }}
          className={
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-sm ring-1 transition-all ' +
            (hasEmail
              ? 'bg-slate-900 text-white ring-slate-900/20 hover:bg-slate-800'
              : 'bg-slate-100 text-slate-400 ring-slate-200 cursor-not-allowed')
          }
          title={hasEmail ? action.hint : '이메일이 없어서 바로 메일을 열 수 없습니다.'}
          aria-disabled={!hasEmail}
        >
          {action.title}
        </a>
      )}
      <button
        type="button"
        onClick={async () => {
          const text = `Subject: ${tmpl.subject}\n\n${tmpl.body}`;
          try {
            await navigator.clipboard.writeText(text);
            trackEvent('cta_copy_template', { brand: lead.brand, stageId });
          } catch {
            // ignore
          }
        }}
        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900"
        title="메일 템플릿을 클립보드에 복사"
      >
        템플릿 복사
      </button>
    </div>
  );
}

/* ============================================================
   MAIN
   ============================================================ */

export default function Dashboard() {
  /** 로컬 캘린더 기준 오늘 — 첫 마운트만 고정하면 자정 이후에도 어제로 남으므로 주기·포커스에서 갱신 */
  const [todayStr, setTodayStr] = useState(() => localISODate());
  const [clockStr, setClockStr] = useState(() => formatLocalTimeHMS());

  // ─── Sync ───
  const [syncStatus, setSyncStatus] = useState('loading');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [storageMode, setStorageMode] = useState('unknown'); // 'kv' | 'memory' | 'unknown'

  // ─── Core data ───
  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [blog, setBlog] = useState(INITIAL_BLOG);
  const [linkedin, setLinkedin] = useState([]);
  const [weeklyAdRows, setWeeklyAdRows] = useState(INITIAL_WEEKLY_AD_ROWS);
  const [dailyAdRows, setDailyAdRows] = useState(INITIAL_DAILY_AD_ROWS);
  const [dailyAdsAnchor, setDailyAdsAnchor] = useState(DAILY_AD_ANCHOR_DEFAULT);
  const [conversionChannelRows, setConversionChannelRows] = useState(cloneConversionChannelSeed);
  const [conversionInput, setConversionInput] = useState({
    karisAd: '', phone: '', channelTalk: '', total: '',
  });
  const [mainNav, setMainNav] = useState('pipeline');

  // ─── Brand stages ───
  const [brandStages, setBrandStages] = useState({});
  const [stageHistory, setStageHistory] = useState([]);

  // ─── UI state ───
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrand, setNewBrand] = useState({ brand: '', countries: '', email: '', platform: '' });
  const [leadEdit, setLeadEdit] = useState(null);

  // ─── Cold email send modal ───
  const [sendPreview, setSendPreview] = useState(null); // { brand, email, subject, body } | null
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState(null);

  const [organicInput, setOrganicInput] = useState(() => ({
    source: 'blog', date: localISODate(), views: '',
  }));

  useEffect(() => {
    function tick() {
      setClockStr(formatLocalTimeHMS());
      const d = localISODate();
      setTodayStr(prev => (prev === d ? prev : d));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    function onVisibility() {
      if (document.visibilityState === 'visible') tick();
    }
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ─── Date range ───
  const thisWeekStart = useMemo(() => weekStart(todayStr), [todayStr]);
  const lastWeekStart = useMemo(() => daysBefore(thisWeekStart, 7), [thisWeekStart]);
  const lastWeekEnd = useMemo(() => daysBefore(thisWeekStart, 1), [thisWeekStart]);

  // ─── Persistent storage ───
  const storageRef = useRef('unknown'); // 'kv' | 'memory' | 'unknown'
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/state');
        if (cancelled) return;
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (data?.storage) {
          storageRef.current = data.storage;
          setStorageMode(data.storage);
        }

        let s = null;
        if (data && !data.empty && data.data) {
          s = data.data;
        } else {
          // Fallback: browser-local backup (useful when server is using memory or when KV isn't attached)
          try {
            const raw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
            if (raw) s = JSON.parse(raw);
          } catch {
            // ignore
          }
        }

        if (s) {
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
          const cc = normalizeConversionChannelRows(s.conversionChannelRows);
          if (cc) setConversionChannelRows(cc);
        }
        setSyncStatus('saved');
        setHasLoaded(true);
      } catch (err) {
        // If server load fails, try local backup before giving up.
        try {
          const raw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
          if (raw) {
            const s = JSON.parse(raw);
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
            const cc = normalizeConversionChannelRows(s.conversionChannelRows);
            if (cc) setConversionChannelRows(cc);
            setSyncStatus('saved');
            setHasLoaded(true);
            return;
          }
        } catch {
          // ignore
        }
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus('saving');
      const payload = {
        leads, blog, linkedin, weeklyAdRows, brandStages, stageHistory,
        dailyAdRows, dailyAdsAnchor, conversionChannelRows,
        savedAt: new Date().toISOString(),
      };

      // Always keep a browser-local backup (survives server restarts; single-device).
      try {
        window.localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota / disabled storage
      }

      try {
        const res = await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          try {
            const data = await res.json();
            if (data?.storage) {
              storageRef.current = data.storage;
              setStorageMode(data.storage);
            }
          } catch {
            // ignore
          }
          setSyncStatus('saved');
        }
        else setSyncStatus('error');
      } catch (err) {
        setSyncStatus('error');
      }
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [leads, blog, linkedin, weeklyAdRows, brandStages, stageHistory, dailyAdRows, dailyAdsAnchor, conversionChannelRows, hasLoaded]);

  async function resetAllData() {
    if (!confirm('모든 입력 데이터를 초기화합니다.\n콜드 리스트·단계, 추가 브랜드, 저장된 광고 시트(백업용), 링크드인·블로그 기록, 인바운드 리드 기록이 모두 사라집니다.\n되돌릴 수 없습니다. 계속할까요?')) return;
    try {
      await fetch('/api/state', { method: 'DELETE' });
      try { window.localStorage.removeItem(LOCAL_BACKUP_KEY); } catch { /* ignore */ }
      setLeads(INITIAL_LEADS);
      setBlog(INITIAL_BLOG);
      setLinkedin([]);
      setWeeklyAdRows(INITIAL_WEEKLY_AD_ROWS);
      setDailyAdRows(RAW.a.map(r => ({ ...r })));
      setDailyAdsAnchor(DAILY_AD_ANCHOR_DEFAULT);
      setBrandStages({});
      setStageHistory([]);
      setConversionChannelRows(cloneConversionChannelSeed());
      setSyncStatus('saved');
      trackEvent('reset_all_data', { date: todayStr });
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
    () => pipelineStepsModel.steps.map(s => ({
      key: s.key,
      label: s.short,
      count: s.count,
      fill: PIPELINE_BAR_FILL[s.key] ?? '#64748b',
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

  const conversionChannelChartData = useMemo(
    () => conversionChannelRows.map((r, i) => ({
      ...r,
      idx: i + 1,
      label: `#${String(i + 1).padStart(2, '0')}`,
    })),
    [conversionChannelRows],
  );

  /* ────────────────────────────────────────────
     HANDLERS
     ──────────────────────────────────────────── */
  function setStage(brand, newStage) {
    const prev = brandStages[brand]?.stage || 'pending';
    setBrandStages(p => ({ ...p, [brand]: { stage: newStage, updatedAt: todayStr } }));
    setStageHistory(p => [...p, { brand, stage: newStage, date: todayStr }]);
    trackEvent('stage_changed', { brand, from: prev, to: newStage, date: todayStr });
  }

  function openSendPreview(lead) {
    const email = lead?.email?.trim();
    if (!email) return;
    const { subject, body } = renderColdEmail(lead.brand);
    setSendError(null);
    setSendPreview({ brand: lead.brand, email, subject, body });
  }

  async function confirmSendEmail() {
    if (!sendPreview || sendBusy) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: sendPreview.brand, to: sendPreview.email }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      trackEvent('cold_email_sent', { brand: sendPreview.brand, messageId: json.messageId });
      setStage(sendPreview.brand, 'sent');
      setSendPreview(null);
    } catch (err) {
      setSendError(err.message || '알 수 없는 에러');
    } finally {
      setSendBusy(false);
    }
  }

  function saveLeadEdit() {
    if (!leadEdit) return;
    const countries = leadEdit.countries.split(/[,\/]/).map(s => s.trim()).filter(Boolean);
    setLeads(p => p.map(l =>
      l.brand === leadEdit.brand
        ? { ...l, priority: leadEdit.priority, countries, platform: leadEdit.platform.trim(), email: leadEdit.email.trim() }
        : l
    ));
    trackEvent('lead_edited', { brand: leadEdit.brand });
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
    trackEvent('lead_added', { brand: name, hasEmail: Boolean(newBrand.email.trim()) });
    setNewBrand({ brand: '', countries: '', email: '', platform: '' });
    setShowAddBrand(false);
  }

  function deleteBrand(name) {
    if (!confirm(`"${name}"를 리스트에서 삭제하시겠어요?`)) return;
    setLeads(p => p.filter(l => l.brand !== name));
    setBrandStages(p => { const n = { ...p }; delete n[name]; return n; });
    trackEvent('lead_deleted', { brand: name });
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
    trackEvent('organic_views_recorded', { source: organicInput.source, date: entry.date, views: entry.views });
  }

  function deleteOrganic(source, date) {
    if (source === 'blog') setBlog(p => p.filter(b => b.date !== date));
    else setLinkedin(p => p.filter(b => b.date !== date));
    trackEvent('organic_views_deleted', { source, date });
  }

  function addConversionChannelRow() {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `cc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setConversionChannelRows(p => [
      ...p,
      {
        id,
        karisAd: nonNegInt(conversionInput.karisAd),
        phone: nonNegInt(conversionInput.phone),
        channelTalk: nonNegInt(conversionInput.channelTalk),
        total: nonNegInt(conversionInput.total),
      },
    ]);
    setConversionInput({ karisAd: '', phone: '', channelTalk: '', total: '' });
    trackEvent('inbound_conversions_row_added', {
      id,
      karisAd: nonNegInt(conversionInput.karisAd),
      phone: nonNegInt(conversionInput.phone),
      channelTalk: nonNegInt(conversionInput.channelTalk),
      total: nonNegInt(conversionInput.total),
    });
  }

  function deleteConversionChannelRow(id) {
    setConversionChannelRows(p => p.filter(r => r.id !== id));
    trackEvent('inbound_conversions_row_deleted', { id });
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
     RENDER
     ──────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-end gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <div className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 bg-white border border-neutral-200">
            {syncStatus === 'loading' && (<><Loader2 size={13} className="animate-spin text-neutral-400" /><span className="text-neutral-500">불러오는 중</span></>)}
            {syncStatus === 'saving'  && (<><Loader2 size={13} className="animate-spin text-neutral-400" /><span className="text-neutral-500">저장 중</span></>)}
            {syncStatus === 'saved'   && (
              <>
                <Cloud size={13} className="text-neutral-500" />
                <span className="text-neutral-700 font-medium">
                  {storageMode === 'memory' ? '임시 저장(이 브라우저)' : '저장됨'}
                </span>
              </>
            )}
            {syncStatus === 'error'   && (<><CloudOff size={13} className="text-neutral-500" /><span className="text-neutral-700 font-medium">저장 실패</span></>)}
          </div>
          <button onClick={resetAllData} className="text-xs text-neutral-500 hover:text-neutral-900 font-medium px-2 py-1.5 rounded-lg hover:bg-neutral-50/80 border border-transparent hover:border-neutral-200" title="모든 입력 초기화">
            초기화
          </button>
          <div className="text-left sm:text-right border border-neutral-200 rounded-xl px-4 py-2 bg-white">
            <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-0.5">오늘</div>
            <div className="text-sm font-semibold tabular-nums text-neutral-900">{fmtKoreanDate(todayStr)}</div>
            <div className="mt-1 text-base font-bold tabular-nums tracking-tight text-neutral-800">{clockStr}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col overflow-hidden md:flex-row">
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2.5 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MAIN_NAV.map(item => (
            <MainNavButton key={item.id} item={item} active={mainNav} onSelect={setMainNav} variant="pill" />
          ))}
        </div>

        <aside className="relative hidden w-[13.75rem] shrink-0 flex-col border-r border-slate-200 bg-white py-5 pl-4 pr-3 shadow-sm shadow-slate-900/[0.02] md:sticky md:top-0 md:self-start md:max-h-screen md:overflow-y-auto md:flex">
          <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">메뉴</p>
          <nav className="flex flex-col gap-1" aria-label="대시보드 섹션">
            {MAIN_NAV.map(item => (
              <MainNavButton key={item.id} item={item} active={mainNav} onSelect={setMainNav} variant="rail" />
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-7 lg:px-10">
          <div className={`mx-auto w-full flex-1 space-y-6 ${mainNav === 'leads' ? 'max-w-[1120px]' : 'max-w-[960px]'}`}>

            {mainNav === 'pipeline' && (
            <>
            <Card className="p-6 md:p-7">
              <SectionTitle>
                콜드 파이프라인
              </SectionTitle>
              <PipelineStepper steps={pipelineStepsModel.steps} rates={pipelineStepsModel.rates} />
            </Card>

            <Card className="overflow-hidden p-6 md:p-7">
              <SectionTitle>
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
                    <Bar dataKey="count" name="누적" radius={[6, 6, 0, 0]} maxBarSize={52} stroke="#fff" strokeWidth={1}>
                      {pipelineChartData.map(row => (
                        <Cell key={row.key} fill={row.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            </>
            )}

            {mainNav === 'leads' && (
            <>
            <Card id="hub-leads" className="p-6 scroll-mt-28">
              <div className="flex items-start justify-between mb-5 gap-4">
                <div>
                  <h2 className="text-xl font-bold">콜드 아웃바운드 리스트</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    목표는 <span className="font-semibold text-neutral-800">다음 단계로 이동</span>입니다. 각 행의 CTA로 “다음 액션”을 바로 실행하세요.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddBrand(v => !v)}
                  className={'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors shrink-0 ' +
                    (showAddBrand ? 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50' : 'bg-white border border-neutral-900 text-neutral-900 hover:bg-neutral-50 shadow-sm')}
                >
                  {showAddBrand ? <><X size={16} /> 닫기</> : <><Plus size={16} /> 리드 추가</>}
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
                      리드로 등록
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setFilterStage('all')}
                  className={
                    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ' +
                    (filterStage === 'all'
                      ? 'border-slate-800 bg-slate-800 text-white shadow-md shadow-slate-900/15'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50')
                  }
                >
                  전체 {leads.length}
                </button>
                {STAGES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFilterStage(s.id)}
                    className={
                      'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ' +
                      (filterStage === s.id ? s.chipOn : s.chipOff)
                    }
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full shadow-sm ring-1 ring-black/5"
                      style={{ backgroundColor: s.dot }}
                      aria-hidden
                    />
                    <span>{s.label}</span>
                    <span className="tabular-nums opacity-90">{stageCounts[s.id]}</span>
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
              <div className="max-h-[680px] overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[920px]">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200 z-10">
                    <tr className="text-xs text-neutral-600 font-semibold">
                      <th className="w-12 px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">브랜드</th>
                      <th className="w-14 px-4 py-3 text-left">등급</th>
                      <th className="px-5 py-3 text-left">국가</th>
                      <th className="min-w-[288px] whitespace-nowrap px-5 py-3 text-left">단계</th>
                      <th className="px-4 py-3 text-right w-40">다음 액션</th>
                      <th className="text-right px-4 py-3 w-24">편집</th>
                      <th className="px-3 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filteredLeads.map((l, i) => {
                      const current = brandStages[l.brand]?.stage || 'pending';
                      const stageAccent = STAGES.find(x => x.id === current)?.dot ?? STAGES[0].dot;
                      const updatedAt = brandStages[l.brand]?.updatedAt;
                      return (
                        <tr
                          key={l.brand + '-' + i}
                          className="group transition-colors hover:bg-slate-50/80"
                          style={{ borderLeft: `3px solid ${stageAccent}` }}
                        >
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
                          <td className="min-w-[288px] whitespace-nowrap px-5 py-3 align-middle">
                            <StageSelector current={current} onChange={(ns) => setStage(l.brand, ns)} />
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <QuickLeadActions lead={l} stageId={current} onSendClick={openSendPreview} />
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
            </>
            )}

            {mainNav === 'organic' && (
            <>
            <Card className="p-6">
              <SectionTitle>
                오가닉 유입 (네이버 블로그 · 링크드인)
              </SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm shadow-emerald-900/[0.04]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm ring-2 ring-emerald-200" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-900">네이버 블로그</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-emerald-950">{fmtNum(blogThisWeek)}<span className="ml-1 text-sm font-normal text-emerald-700/80">회</span></div>
                  <div className="mt-1.5"><Delta curr={blogThisWeek} prev={blogLastWeek} unit="회" small /></div>
                </div>
                <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm shadow-blue-900/[0.04]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600 shadow-sm ring-2 ring-blue-200" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">링크드인</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums text-blue-950">{fmtNum(linkedinThisWeek)}<span className="ml-1 text-sm font-normal text-blue-700/80">회</span></div>
                  <div className="mt-1.5"><Delta curr={linkedinThisWeek} prev={linkedinLastWeek} unit="회" small /></div>
                </div>
              </div>
              <div className="mt-6 border-t border-neutral-200 pt-6">
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
                      <Legend content={<OrganicBarLegend />} />
                      <Bar dataKey="blog" name="네이버 블로그" fill={ORGANIC_BLOG_BAR_LAST} radius={[3, 3, 0, 0]} maxBarSize={16} stroke="#fff" strokeWidth={0.5}>
                        {organicDailySeries.map((row, idx) => (
                          <Cell
                            key={row.d + '-blog'}
                            fill={idx === organicDailySeries.length - 1 ? ORGANIC_BLOG_BAR_LAST : ORGANIC_BLOG_BAR}
                          />
                        ))}
                      </Bar>
                      <Bar dataKey="linkedin" name="링크드인" fill={ORGANIC_LI_BAR_LAST} radius={[3, 3, 0, 0]} maxBarSize={16} stroke="#fff" strokeWidth={0.5}>
                        {organicDailySeries.map((row, idx) => (
                          <Cell
                            key={row.d + '-li'}
                            fill={idx === organicDailySeries.length - 1 ? ORGANIC_LI_BAR_LAST : ORGANIC_LI_BAR}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            <Card id="hub-organic" className="scroll-mt-28 p-6 shadow-sm">
              <SectionTitle>
                오가닉 조회수 (블로그 · 링크드인)
              </SectionTitle>

              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">매체</label>
                  <div className="inline-flex rounded-lg overflow-hidden border border-neutral-200">
                    <button
                      onClick={() => setOrganicInput({ ...organicInput, source: 'blog' })}
                      className={'px-4 py-2 text-sm font-semibold ' +
                        (organicInput.source === 'blog'
                          ? 'bg-emerald-50 text-emerald-950 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.35)]'
                          : 'text-neutral-500 hover:bg-emerald-50/50')}
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-2 align-middle ring-2 ring-emerald-200" />
                      네이버 블로그
                    </button>
                    <button
                      onClick={() => setOrganicInput({ ...organicInput, source: 'linkedin' })}
                      className={'px-4 py-2 text-sm font-semibold border-l border-neutral-200 ' +
                        (organicInput.source === 'linkedin'
                          ? 'bg-blue-50 text-blue-950 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.35)]'
                          : 'text-neutral-500 hover:bg-blue-50/50')}
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-600 mr-2 align-middle ring-2 ring-blue-200" />
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
                  <Plus size={16} /> 조회수 기록
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-5">
                {/* 블로그 */}
                <div className="overflow-hidden rounded-xl border-2 border-emerald-200 bg-emerald-50/40 shadow-sm shadow-emerald-900/[0.03]">
                  <div className="flex items-center justify-between border-b-2 border-emerald-200 bg-emerald-100/90 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 ring-2 ring-emerald-300" />
                      <span className="text-sm font-bold text-emerald-950">네이버 블로그</span>
                    </div>
                    <span className="tabular-nums text-xs font-semibold text-emerald-800/90">{blog.length}일</span>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto bg-white/80">
                    {blog.length === 0 ? (
                      <div className="py-8 text-center text-sm text-emerald-700/60">기록 없음</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-emerald-100 bg-emerald-50/90 text-left text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                            <th className="w-28 px-4 py-2">날짜</th>
                            <th className="px-4 py-2 text-right">조회수</th>
                            <th className="w-8 px-2 py-2" aria-label="삭제" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-100">
                          {blog.slice(0, 40).map(row => (
                            <tr key={row.date} className="group hover:bg-emerald-50/70">
                              <td className="w-28 px-4 py-2.5 tabular-nums text-xs font-medium text-emerald-900/85">{row.date}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-emerald-950">
                                {fmtNum(row.views)}<span className="ml-1 text-xs font-semibold text-emerald-600/90">회</span>
                              </td>
                              <td className="w-8 px-2 py-2 text-right">
                                <button onClick={() => deleteOrganic('blog', row.date)} className="text-emerald-400 hover:text-emerald-800 opacity-0 group-hover:opacity-100" type="button" title="삭제">
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
                <div className="overflow-hidden rounded-xl border-2 border-blue-200 bg-blue-50/40 shadow-sm shadow-blue-900/[0.03]">
                  <div className="flex items-center justify-between border-b-2 border-blue-200 bg-blue-100/90 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600 ring-2 ring-blue-300" />
                      <span className="text-sm font-bold text-blue-950">링크드인</span>
                    </div>
                    <span className="tabular-nums text-xs font-semibold text-blue-800/90">{linkedin.length}일</span>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto bg-white/80">
                    {linkedin.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-blue-700/60">
                        아직 기록 없음 —<br />위 폼에서 &apos;링크드인&apos; 선택 후 입력
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-blue-100 bg-blue-50/90 text-left text-[11px] font-bold uppercase tracking-wide text-blue-800">
                            <th className="w-28 px-4 py-2">날짜</th>
                            <th className="px-4 py-2 text-right">조회수</th>
                            <th className="w-8 px-2 py-2" aria-label="삭제" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                          {linkedin.slice(0, 40).map(row => (
                            <tr key={row.date} className="group hover:bg-blue-50/70">
                              <td className="w-28 px-4 py-2.5 tabular-nums text-xs font-medium text-blue-900/85">{row.date}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-blue-950">
                                {fmtNum(row.views)}<span className="ml-1 text-xs font-semibold text-blue-600/90">회</span>
                              </td>
                              <td className="w-8 px-2 py-2 text-right">
                                <button onClick={() => deleteOrganic('linkedin', row.date)} className="text-blue-400 hover:text-blue-800 opacity-0 group-hover:opacity-100" type="button" title="삭제">
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
            </>
            )}

            {mainNav === 'conversion' && (
            <>
            <Card className="overflow-hidden p-6 md:p-7">
              <SectionTitle>
                인바운드 리드 (카리스 애드 · 유선 · 채널톡 · 총 전환수)
              </SectionTitle>
              <div className="h-64 w-full min-w-0">
                {conversionChannelChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-sm text-slate-500">
                    아래에서 숫자를 입력해 첫 행을 추가하면 그래프가 표시됩니다.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={conversionChannelChartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke="#f1f5f9" strokeWidth={1} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        interval={conversionChannelChartData.length > 18 ? 1 : 0}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 12px rgb(15 23 42 / 0.06)' }}
                        formatter={(v, name) => [fmtNum(v), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Line
                        type="monotone"
                        dataKey="karisAd"
                        name="카리스 애드"
                        stroke={CC_LINE.karisAd.stroke}
                        strokeWidth={2.25}
                        dot={{ r: 4, fill: CC_LINE.karisAd.fill, stroke: '#fff', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: CC_LINE.karisAd.fill, stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="phone"
                        name="유선"
                        stroke={CC_LINE.phone.stroke}
                        strokeWidth={2.25}
                        dot={{ r: 4, fill: CC_LINE.phone.fill, stroke: '#fff', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: CC_LINE.phone.fill, stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="channelTalk"
                        name="채널톡"
                        stroke={CC_LINE.channelTalk.stroke}
                        strokeWidth={2.25}
                        dot={{ r: 4, fill: CC_LINE.channelTalk.fill, stroke: '#fff', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: CC_LINE.channelTalk.fill, stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="총 전환수"
                        stroke={CC_LINE.total.stroke}
                        strokeWidth={3}
                        dot={{ r: 4.5, fill: CC_LINE.total.fill, stroke: '#fff', strokeWidth: 2 }}
                        activeDot={{ r: 7, fill: CC_LINE.total.fill, stroke: '#fff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-6">
                {[
                  { key: 'karisAd', label: '카리스 애드' },
                  { key: 'phone', label: '유선' },
                  { key: 'channelTalk', label: '채널톡' },
                  { key: 'total', label: '총 전환수' },
                ].map(({ key, label }) => (
                  <div key={key} className="min-w-[5.5rem] flex-1">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={conversionInput[key]}
                      onChange={e => setConversionInput(p => ({ ...p, [key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addConversionChannelRow(); }}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-slate-900"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addConversionChannelRow}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  <Plus size={16} /> 전환 기록 추가
                </button>
              </div>

              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">카리스 애드</th>
                      <th className="px-3 py-2.5">유선</th>
                      <th className="px-3 py-2.5">채널톡</th>
                      <th className="px-3 py-2.5">총 전환수</th>
                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conversionChannelRows.map((r, i) => (
                      <tr key={r.id} className="group hover:bg-slate-50/80">
                        <td className="px-3 py-2 tabular-nums text-xs text-slate-500">{String(i + 1).padStart(2, '0')}</td>
                        <td className="px-3 py-2 tabular-nums font-medium text-slate-900">{fmtNum(r.karisAd)}</td>
                        <td className="px-3 py-2 tabular-nums font-medium text-slate-900">{fmtNum(r.phone)}</td>
                        <td className="px-3 py-2 tabular-nums font-medium text-slate-900">{fmtNum(r.channelTalk)}</td>
                        <td className="px-3 py-2 tabular-nums font-medium text-slate-900">{fmtNum(r.total)}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => deleteConversionChannelRow(r.id)}
                            className="rounded p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-800 group-hover:opacity-100"
                            title="이 행 삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {conversionChannelRows.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-500">행이 없습니다.</div>
                )}
              </div>
            </Card>
            </>
            )}
          </div>

          <footer className="mx-auto mt-8 w-full max-w-[960px] shrink-0 border-t border-slate-200 pt-6 text-xs text-slate-500 flex flex-wrap items-center justify-end">
            <span className="tabular-nums">
              리드 {fmtNum(leads.length)}곳 · 발송 {fmtNum(funnelCumulative.sent)} · 성사 {fmtNum(funnelCumulative.won)}
            </span>
          </footer>
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

        {sendPreview && (
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/15 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => !sendBusy && setSendPreview(null)}
          >
            <div
              className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-neutral-200 p-6 sm:p-7 max-h-[90vh] overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="send-preview-title"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 id="send-preview-title" className="text-lg font-bold text-neutral-900">콜드메일 미리보기</h3>
                  <p className="text-sm text-neutral-500 mt-1">{sendPreview.brand} · {sendPreview.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => !sendBusy && setSendPreview(null)}
                  disabled={sendBusy}
                  className="p-1 text-neutral-400 hover:text-neutral-800 rounded disabled:opacity-40"
                  title="닫기"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">From</div>
                  <div className="text-sm text-neutral-800">Felix Kim &lt;felix@madsq.net&gt;</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">To</div>
                  <div className="text-sm text-neutral-800">{sendPreview.email}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Subject</div>
                  <div className="text-sm font-semibold text-neutral-900">{sendPreview.subject}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Body</div>
                  <pre className="text-sm text-neutral-800 whitespace-pre-wrap font-sans bg-neutral-50 rounded-lg p-4 border border-neutral-200 max-h-80 overflow-y-auto">{sendPreview.body}</pre>
                </div>
              </div>

              {sendError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  발송 실패: {sendError}
                </div>
              )}

              <div className="mt-6 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => !sendBusy && setSendPreview(null)}
                  disabled={sendBusy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-50 border border-neutral-200 disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmSendEmail}
                  disabled={sendBusy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 shadow-sm disabled:opacity-50"
                >
                  {sendBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendBusy ? '발송 중...' : '발송'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
