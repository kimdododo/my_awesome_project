// node --test src/lib/leadScore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreLead } from './leadScore.js';

const NOW = new Date('2026-05-09T00:00:00Z');

test('priority D + 이메일 보유 + 다국가 → 높은 점수', () => {
  const { score, reasons } = scoreLead({
    lead: {
      brand: 'Torriden',
      priority: 'D',
      countries: ['Vietnam', 'Indonesia', 'Thailand'],
      platform: 'Shopee, Lazada',
      email: 'global@torriden.com',
    },
    currentStage: 'pending',
    events: [],
    now: NOW,
  });
  // base 25 + 이메일 +10 + 다국가 +5 + 다플랫폼 +3 = 43
  assert.equal(score, 43);
  assert.ok(reasons.find(r => r.label.includes('우선순위 D')));
  assert.ok(reasons.find(r => r.label === '이메일 보유'));
});

test('이메일 없는 A 등급 + 단일 국가 → 낮은 점수', () => {
  const { score } = scoreLead({
    lead: { brand: 'X', priority: 'A', countries: ['Korea'], platform: 'OliveYoung', email: '' },
    currentStage: 'pending',
    events: [],
    now: NOW,
  });
  // 15 - 10 (이메일無) = 5
  assert.equal(score, 5);
});

test('타겟 국가 비어있으면 추가 페널티', () => {
  const { score } = scoreLead({
    lead: { brand: 'X', priority: 'B', countries: [], platform: '', email: 'a@b.c' },
    currentStage: 'pending',
    events: [],
    now: NOW,
  });
  // 10 + 10 - 3 = 17
  assert.equal(score, 17);
});

test('단계가 replied + 최근 회신 이벤트 → 큰 boost', () => {
  const { score } = scoreLead({
    lead: { brand: 'X', priority: 'D', countries: ['Vietnam', 'Indonesia', 'Thailand'], platform: 'Shopee', email: 'a@b.c' },
    currentStage: 'replied',
    events: [
      { ts: '2026-05-05T00:00:00Z', type: 'send' },
      { ts: '2026-05-08T00:00:00Z', type: 'reply' },
    ],
    now: NOW,
  });
  // 25 + 10 + 5 + 25 (replied) + 10 (최근7일) + 5 (회신확인) = 80
  assert.equal(score, 80);
});

test('sent 단계에서 3통 이상 발송 + 회신 0 → 페널티', () => {
  const { score, reasons } = scoreLead({
    lead: { brand: 'X', priority: 'D', countries: ['Vietnam'], platform: 'Shopee', email: 'a@b.c' },
    currentStage: 'sent',
    events: [
      { ts: '2026-04-01T00:00:00Z', type: 'send' },
      { ts: '2026-04-15T00:00:00Z', type: 'send' },
      { ts: '2026-04-25T00:00:00Z', type: 'send' },
    ],
    now: NOW,
  });
  // 25 + 10 + 10(stage sent) - 10 (반복 발송) = 35
  // 마지막 이벤트가 14일 전이라 30일+ 페널티는 미적용
  assert.equal(score, 35);
  assert.ok(reasons.find(r => r.label.includes('발송만 반복')));
});

test('점수는 0-100 범위로 클램프', () => {
  const { score: hi } = scoreLead({
    lead: { brand: 'X', priority: 'D', countries: ['A','B','C','D'], platform: 'a, b, c', email: 'a@b.c' },
    currentStage: 'won',
    events: [{ ts: '2026-05-08T00:00:00Z', type: 'reply' }],
    now: NOW,
  });
  assert.ok(hi <= 100, `score ${hi} > 100`);

  const { score: lo } = scoreLead({
    lead: { brand: 'X', priority: 'C', countries: [], platform: '', email: '' },
    currentStage: 'pending',
    events: [],
    now: NOW,
  });
  assert.ok(lo >= 0, `score ${lo} < 0`);
});

test('잘못된 입력은 0 반환', () => {
  const { score } = scoreLead({});
  assert.equal(score, 0);
  const { score: s2 } = scoreLead({ lead: null });
  assert.equal(s2, 0);
});
