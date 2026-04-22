# K-Beauty SEA Weekly Dashboard

Caris 콜드 아웃바운드 & 광고 성과를 주간 단위로 추적하는 내부 대시보드.

## 특징

- **5개 탭**: 이번 주 · 콜드 리스트 · 자사 광고 · 오가닉 매체
- **주간 리포트 포맷**: 전주 대비 WoW 변화, 자동 헤드라인 생성
- **단계 관리**: 102개 K-뷰티 브랜드에 대해 `미발송 → 발송 → 회신 → 미팅 → 성사` 단계 변경
- **오가닉 매체 입력**: 네이버 블로그 / LinkedIn 일별 조회수 기록
- **영구 저장**: Vercel KV(Redis)로 팀이 공유하는 상태

---

## ✅ 설치 방법 (로컬 개발)

### 요구 사항

- **Node.js**: LTS 권장 (예: 18 이상)
- **npm**: Node와 함께 설치됨

### 설치 & 실행

```bash
npm install
npm run dev
# http://localhost:3000
```

로컬에서는 저장소 환경변수가 없으면 **메모리 저장소**로 동작합니다. 서버를 껐다 켜면 입력이 초기화되지만 기능 테스트는 가능합니다.

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
# → http://localhost:3000
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
3. **Root Directory**는 **비우기**(레포 루트 `.`) — Next 앱이 **최상위**에 있습니다. 예전에 `kbeauty-dashboard-v2`나 `deploy`로 지정해 두었다면 **지우고 저장**한 뒤 다시 배포하세요. (Git 푸시 시 자동 배포가 이 경로를 사용합니다.)
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

> 이 URL을 아는 사람은 누구나 **열람 및 수정** 가능합니다 (Link-Only 접근). 진짜 인증이 필요하면 `src/app/page.jsx`에 간단한 비밀번호 게이트를 추가할 수 있습니다.

---

## 🔒 보안 업그레이드 옵션 (필요 시)

### A. 간단한 비밀번호 보호
`src/app/page.jsx`에서 prompt로 비밀번호 체크 추가 (5분 작업)

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

## 🔧 환경 변수 설정

이 프로젝트는 저장소(대시보드 상태)를 다음 **우선순위**로 선택합니다.

1. **Vercel KV (REST)**: `KV_REST_API_URL`이 설정되어 있으면 사용
2. **Redis (TCP)**: `REDIS_URL`(또는 `STORAGE_URL`, `REDIS_TLS_URL`, `STORAGE_TLS_URL`)이 있으면 사용
3. **Upstash Redis (REST)**: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`이 있으면 사용
4. **In-memory**: 위가 모두 없으면 메모리(Map) 폴백 (재시작 시 초기화)

### 필수/선택 환경 변수

#### (배포에서 권장) Vercel KV

- **KV_REST_API_URL**: Vercel KV REST URL
- **KV_REST_API_TOKEN**: Vercel KV REST Token
- **KV_REST_API_READ_ONLY_TOKEN**: (선택) 읽기 전용 토큰

> Vercel에서 KV를 “Connect Project”로 연결하면 위 값은 **자동으로 주입**됩니다.

#### (대안) Redis (TCP)

- **REDIS_URL**: 예) `redis://...` 또는 `rediss://...`

Vercel/서드파티 연동에 따라 아래 이름으로 들어올 수도 있어 함께 지원합니다.

- **STORAGE_URL**, **REDIS_TLS_URL**, **STORAGE_TLS_URL**

#### (대안) Upstash Redis (REST)

- **UPSTASH_REDIS_REST_URL**
- **UPSTASH_REDIS_REST_TOKEN**

연동에 따라 아래 이름으로 들어올 수도 있어 함께 지원합니다.

- **STORAGE_REDIS_REST_URL**, **STORAGE_REDIS_REST_TOKEN**

#### (스크립트) Anthropic API

브랜드 스크래핑/정제 스크립트(`npm run import`)에서 사용합니다.

- **ANTHROPIC_API_KEY**

### 로컬에서 환경변수 준비

- **Next.js 실행용**: 프로젝트 루트에 `.env.local`을 만들고 필요한 값을 넣습니다.
- **Vercel KV 값을 로컬로 가져오기(권장)**: Vercel CLI를 쓴다면 아래로 로컬에 내려받을 수 있습니다.

```bash
vercel env pull .env.development.local
```

> 로컬에서는 환경변수가 없어도 앱은 실행되지만, 저장은 메모리 폴백이라 재시작 시 초기화됩니다.

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
package.json
vercel.json                  - 레포 루트 (Vercel Root Directory = .)
```

---

## 🔌 API 사용법

대시보드 상태는 `src/app/api/state/route.js`의 **단일 키**(`state:v1`)에 저장됩니다. (링크를 아는 모든 사용자가 같은 상태를 공유)

### `GET /api/state`

- **설명**: 저장된 상태를 가져옵니다.
- **응답**
  - 저장된 값이 없으면: `{ "empty": true, "storage": "<backend>" }`
  - 저장된 값이 있으면: `{ "data": <state>, "storage": "<backend>" }`

```bash
curl -s http://localhost:3000/api/state
```

### `POST /api/state`

- **설명**: 요청 바디(JSON)를 그대로 저장합니다.
- **요청 헤더**: `Content-Type: application/json`
- **응답**: `{ ok: true, storage: "<backend>", savedAt: "<iso8601>" }`

```bash
curl -s -X POST "http://localhost:3000/api/state" -H "Content-Type: application/json" -d "{\"hello\":\"world\"}"
```

### `DELETE /api/state`

- **설명**: 저장된 상태를 삭제합니다.
- **응답**: `{ ok: true }`

```bash
curl -s -X DELETE http://localhost:3000/api/state
```

### `storage` 값

응답에 포함되는 `storage`는 실제로 어떤 저장소를 사용했는지 나타냅니다.

- `kv`: Vercel KV(@vercel/kv)
- `redis`: Redis TCP(node-redis)
- `upstash-rest`: Upstash Redis REST(@upstash/redis)
- `memory`: 메모리 폴백

---

## 🧰 스크립트 사용법 (브랜드 디렉토리 import)

`scripts/` 아래 스크립트는 외부 소스에서 **브랜드 후보를 스크래핑**하고, Claude로 **중복/비브랜드 항목을 정제**한 뒤 `scripts/outputs/`에 JSON을 생성합니다.

### 실행 전 준비

- `npm install`로 의존성 설치
- `.env.local` 또는 `.env`에 `ANTHROPIC_API_KEY` 설정

### 실행

```bash
# 기본: 모든 소스 실행
npm run import

# 특정 소스만
npm run import -- oliveyoung
npm run import -- intercharm

# 디버그(HTML 덤프 저장)
npm run import -- oliveyoung --debug
```

### 출력물

- `scripts/outputs/new-brands-YYYY-MM-DDTHH-MM-SS.json`
  - `brands`: 신규 브랜드 후보 배열(대시보드 `seed.js` 포맷과 호환)
  - `summary`: 소스별 처리 결과 요약
- `--debug` 사용 시 HTML 덤프도 생성될 수 있습니다.

### 다음 단계(수동 반영)

1. 생성된 JSON에서 `brands`를 검토
2. 마음에 드는 항목만 골라 `src/data/seed.js`의 `SEED.l` 배열에 추가

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

- Vercel에서 `No Output Directory named "public"` 이면, 프로젝트가 **Next가 아니라 정적 사이트**로 잡힌 경우입니다. **Settings → Build & Deployment**에서 **Framework Preset**을 **Next.js**로 두고, **Output Directory**는 **비우기**(Override 해제)하세요. **Root Directory**는 **레포 루트(비움)** 이어야 하며, 루트의 `vercel.json`이 Next 빌드를 가리킵니다.
```bash
rm -rf node_modules .next
npm install
npm run build
```

---

Made with 🌿 for Caris
