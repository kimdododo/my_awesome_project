// 콜드메일 템플릿 — 브랜드명은 본문의 (brand) 토큰이 자동 치환됩니다.
// 제목과 서명은 고정. 본문만 편집하세요.

export const COLD_EMAIL_SUBJECT = '동남아시아 시장 협업 제안';

// 본문 — (brand) 를 브랜드명으로 치환. 줄바꿈 그대로 유지됩니다.
const BODY_TEMPLATE = `안녕하세요, (brand) 해외사업 담당자님,
동남아 마케팅 전문 기업 카리스의 김도현입니다.

카리스는 2015년부터 '동남아 시장 매출 전환' 하나에만 집중해 왔습니다.
*'Alba: 동남아 진출 7개월 만에 매출 1,000% 상승 및 팬덤 형성
*ED:ALL: 인플루언서 캠페인으로 ROAS 900%, 재구매율 2배 달성
*iodance: 쇼피 오피셜 샵 팔로워 4배 증가 및 초기 매출 2,500% 성장

저희는 단순히 마케팅 대행에 그치지 않고 전략 수립 → 인플루언서 매칭 → 판매 전환 → 리포트까지 이어지는 원스톱 성장을 책임집니다.

카리스의 성공 사례를 담은 서비스 소개서를 첨부드립니다.

다음 주 중 15분 정도 짧은 화상 미팅이 가능하실까요?
확인해 주시면 핵심 내용 위주로 가볍게 공유드리겠습니다.

감사합니다.
김도현 드림.
`;

export function renderColdEmail(brand) {
  const safeBrand = String(brand ?? '').trim() || '브랜드';
  return {
    subject: COLD_EMAIL_SUBJECT,
    body: BODY_TEMPLATE.replace(/\(brand\)/g, safeBrand),
  };
}
