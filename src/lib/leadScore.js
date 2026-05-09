// leadScore.js — 휴리스틱 lead score (v1)
//
// 목적: ML 모델 학습 데이터가 쌓이기 전까지 사용할 룰 기반 baseline.
//       이게 baseline이고, 추후 XGBoost/회신확률 모델이 이걸 넘지 못하면 모델이 틀린 것.
//
// 입력:
//   lead         : { brand, priority, countries[], platform, email }
//   currentStage : 'pending'|'sent'|'replied'|'meeting'|'won'
//   events       : brand event 배열 (시간 오름차순/내림차순 무관, ts 사용)
//   now          : Date (테스트용 주입; 기본 new Date())
//
// 출력:
//   { score: 0~100, reasons: [{label, delta}] }
//
// 향후 ML 교체 시: 동일 시그니처로 predict() 함수를 만들어 swap만 하면 됨.

const PRIORITY_BASE = {
  D: 25, // 검증된 톱 브랜드
  A: 15,
  B: 10,
  C: 5,
  NEW: 15,
};

const STAGE_BOOST = {
  pending: 0,
  sent: 10,
  replied: 25,
  meeting: 40,
  won: 50,
};

function dayDiff(aIso, bDate) {
  const a = new Date(aIso).getTime();
  const b = bDate.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

export function scoreLead({ lead, currentStage = 'pending', events = [], now = new Date() } = {}) {
  if (!lead || typeof lead !== 'object') {
    return { score: 0, reasons: [{ label: '잘못된 입력', delta: 0 }] };
  }

  const reasons = [];
  let score = 0;

  // 1) 우선순위 base
  const pri = (lead.priority || '').toString().trim().toUpperCase();
  const base = PRIORITY_BASE[pri] ?? 5;
  score += base;
  reasons.push({ label: `우선순위 ${pri || '미지정'}`, delta: base });

  // 2) 이메일 보유 여부
  const hasEmail = typeof lead.email === 'string' && lead.email.trim().length > 0;
  if (hasEmail) {
    score += 10;
    reasons.push({ label: '이메일 보유', delta: 10 });
  } else {
    score -= 10;
    reasons.push({ label: '이메일 없음', delta: -10 });
  }

  // 3) 국가 다양성
  const countries = Array.isArray(lead.countries) ? lead.countries.filter(Boolean) : [];
  if (countries.length >= 3) {
    score += 5;
    reasons.push({ label: `다국가(${countries.length}개)`, delta: 5 });
  } else if (countries.length === 0) {
    score -= 3;
    reasons.push({ label: '타겟 국가 없음', delta: -3 });
  }

  // 4) 플랫폼 다양성 (콤마/슬래시 분리)
  const platforms = (lead.platform || '').split(/[,\/]/).map(s => s.trim()).filter(Boolean);
  if (platforms.length >= 2) {
    score += 3;
    reasons.push({ label: `다플랫폼(${platforms.length})`, delta: 3 });
  }

  // 5) 단계 boost
  const sb = STAGE_BOOST[currentStage] ?? 0;
  if (sb !== 0) {
    score += sb;
    reasons.push({ label: `단계: ${currentStage}`, delta: sb });
  }

  // 6) 이벤트 기반 신호
  const evts = Array.isArray(events) ? events.filter(e => e && e.ts) : [];
  const lastEvt = evts.reduce((acc, e) => (!acc || e.ts > acc.ts ? e : acc), null);
  const sendCount = evts.filter(e => e.type === 'send').length;
  const replyCount = evts.filter(e => e.type === 'reply').length;

  if (lastEvt) {
    const days = dayDiff(lastEvt.ts, now);
    if (days <= 7) {
      score += 10;
      reasons.push({ label: '최근 7일 활동', delta: 10 });
    } else if (days >= 30) {
      score -= 5;
      reasons.push({ label: '30일 이상 정체', delta: -5 });
    }
  } else if (currentStage !== 'pending') {
    // stage는 진척했는데 이벤트 로그가 없는 경우 → 데이터 부족 페널티 작게
    score -= 3;
    reasons.push({ label: '이벤트 로그 없음', delta: -3 });
  }

  // 7) sent only 정체: 3통 보냈는데 회신 0
  if (currentStage === 'sent' && sendCount >= 3 && replyCount === 0) {
    score -= 10;
    reasons.push({ label: '발송만 반복(회신無)', delta: -10 });
  }

  // 8) replied 직후 가속
  if (currentStage === 'replied' && replyCount >= 1) {
    score += 5;
    reasons.push({ label: '회신 들어옴', delta: 5 });
  }

  // 클램프
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return { score, reasons };
}

// 우선순위 정렬용
export function compareByScoreDesc(a, b) {
  return (b.score ?? 0) - (a.score ?? 0);
}
