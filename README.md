# K-Beauty SEA Weekly Dashboard

Caris 콜드 아웃바운드 & 광고 성과를 주간 단위로 추적하는 내부 대시보드.

## 특징

- **5개 탭**: 이번 주 · 콜드 리스트 · 자사 광고 · 오가닉 매체
- **주간 리포트 포맷**: 전주 대비 WoW 변화, 자동 헤드라인 생성
- **단계 관리**: 102개 K-뷰티 브랜드에 대해 `미발송 → 발송 → 회신 → 미팅 → 성사` 단계 변경
- **오가닉 매체 입력**: 네이버 블로그 / LinkedIn 일별 조회수 기록
- **영구 저장**: Vercel KV(Redis)로 팀이 공유하는 상태

---

## 🚀 배포 가이드 (처음 한 번만)

### 0. 사전 준비
- [GitHub 계정](https://github.com)
- [Vercel 계정](https://vercel.com) (GitHub로 로그인 가능)
- 이 폴더 (로컬 PC에 다운로드되어 있어야 함)

### 1. 로컬에서 확인 (선택)
```bash
cd kbeauty-dashboard
npm install
npm run dev
# → http://localhost:3000 에서 확인
```

로컬에서는 KV가 없으므로 **메모리 저장소**를 사용합니다. 서버를 껐다 켜면 입력이 초기화되지만 기능 테스트는 가능합니다.

### 2. GitHub에 업로드
```bash
git init
git add .
git commit -m "initial commit"
# GitHub에 새 레포 만들고:
git remote add origin https://github.com/YOUR_USERNAME/kbeauty-dashboard.git
git branch -M main
git push -u origin main
```

### 3. Vercel에 연결
1. [vercel.com/new](https://vercel.com/new) 접속
2. **"Import Git Repository"** → 방금 푸시한 레포 선택
3. **Root Directory**는 **비워 두기**(또는 `.`) — Next 앱이 레포 **최상위**에 있습니다. 예전에 `deploy`로 지정했다면 반드시 지우고 저장한 뒤 다시 배포하세요.
4. 설정은 나머지 **기본값** 그대로 두고 `Deploy` 클릭
5. 1~2분 후 `https://kbeauty-dashboard-xxxx.vercel.app` URL 발급

### 4. Vercel KV 붙이기 (데이터 영구 저장)
이 단계를 안 하면 데이터가 서버 재시작 시 사라집니다. **꼭 하세요.**

1. Vercel 프로젝트 페이지 → 상단 탭 **"Storage"**
2. **"Create Database"** → **"KV"** 선택
3. 이름 입력 (예: `kbeauty-dashboard-kv`) → `Create`
4. 생성된 KV의 `Connect Project` → 이 프로젝트 선택 → 환경변수 자동 주입
5. 프로젝트 상단 **"Deployments"** → 최신 배포에서 `...` → **"Redeploy"**

재배포 후 사이트 열어서 헤더의 저장 상태가 **☁️ 저장됨**(초록)이 되면 OK.

### 5. 팀원에게 공유
Vercel이 발급한 URL을 팀 Slack/이메일로 공유하세요.

> 이 URL을 아는 사람은 누구나 **열람 및 수정** 가능합니다 (Link-Only 접근). 진짜 인증이 필요하면 `app/page.jsx`에 간단한 비밀번호 게이트를 추가할 수 있습니다.

---

## 🔒 보안 업그레이드 옵션 (필요 시)

### A. 간단한 비밀번호 보호
`app/page.jsx`에서 prompt로 비밀번호 체크 추가 (5분 작업)

### B. Vercel 팀 SSO / 비밀번호
Vercel Pro 플랜($20/월)의 **Password Protection** 기능 활성화 (설정만)

### C. 본격적 로그인
`next-auth` 추가해서 이메일/구글 로그인 — 반나절 작업

---

## 📝 데이터 업데이트

현재 광고 데이터 (Naver/Google/Meta)와 초기 블로그 90일치는 `src/data/seed.js`에 하드코딩되어 있습니다. 매주 업데이트하려면:

**지금 방식 (수동)**
1. 각 매체 리포트 다운로드 → 엑셀
2. `seed.js`의 `a` 배열에 새 행 추가
3. GitHub push → Vercel 자동 재배포

**나중 방식 (자동)**
1. 엑셀 업로드 UI 추가 (별도 작업 필요)
2. 또는 Naver/Google/Meta Ads API 연동 (각각 API 키 필요)

---

## 🛠 기술 스택

- **Next.js 14** (App Router) — React 18
- **Tailwind CSS** — 스타일링
- **Recharts** — 차트
- **Lucide React** — 아이콘
- **@vercel/kv** — Redis 기반 KV 저장소

---

## 📂 프로젝트 구조

```
src/
├── app/
│   ├── layout.jsx           - 루트 레이아웃
│   ├── page.jsx             - 진입점
│   ├── Dashboard.jsx        - 메인 컴포넌트 (모든 탭 로직)
│   ├── globals.css          - Tailwind + 폰트
│   └── api/
│       └── state/
│           └── route.js     - GET/POST/DELETE /api/state
└── data/
    └── seed.js              - 102 brands + 90일 blog + 180일 ads
```

---

## 🆘 문제가 생겼을 때

**헤더에 "저장 실패" 표시가 뜸**
- Vercel KV가 연결 안 됐거나 환경변수가 빠짐
- Vercel 대시보드 → Settings → Environment Variables 확인
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`이 있어야 함

**데이터가 사라짐**
- 로컬 개발 중이면 정상 (메모리 폴백)
- 배포 환경에서 사라지면 KV 연결 확인

**빌드 에러**
```bash
rm -rf node_modules .next
npm install
npm run build
```

---

Made with 🌿 for Caris
