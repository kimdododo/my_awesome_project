// 콜드메일 템플릿 — 브랜드명은 본문의 (brand) 토큰이 자동 치환됩니다.
// 제목과 서명은 고정. 본문만 편집하세요.

export const COLD_EMAIL_SUBJECT = '동남아시아 시장 협업 제안';

// 본문 — (brand) 를 브랜드명으로 치환. 줄바꿈 그대로 유지됩니다.
// TODO: 아래 본문을 실제 콜드메일 원본으로 교체하세요.
const BODY_TEMPLATE = `안녕하세요, (brand) 담당자님.

저희는 동남아시아 시장(인도네시아·베트남·태국·말레이시아·필리핀)에서
K-뷰티 브랜드의 현지 진출·판매·퍼포먼스 마케팅을 집행하는 Caris 입니다.

(brand)의 제품군이 현재 SEA 주요 이커머스(Shopee·Lazada·TikTok Shop)에서
빠르게 성장하는 카테고리와 잘 맞아, 협업을 제안드리고자 연락드렸습니다.

제안드릴 수 있는 범위:
- 현지 판매 채널 입점 / 운영
- SEA 퍼포먼스 광고 (Meta·TikTok·구글) 집행
- 현지 KOL / 틱톡 커머스 연계 캠페인

회사 소개서(PDF): https://kbeauty-dashboard.vercel.app/caris-intro.pdf

15~20분 정도 간단히 소개 미팅 가능하실지요?
편하신 시간대 알려주시면 줌 링크 전달드리겠습니다.

감사합니다.

김도현 드림
Caris
`;

export function renderColdEmail(brand) {
  const safeBrand = String(brand ?? '').trim() || '브랜드';
  return {
    subject: COLD_EMAIL_SUBJECT,
    body: BODY_TEMPLATE.replace(/\(brand\)/g, safeBrand),
  };
}
