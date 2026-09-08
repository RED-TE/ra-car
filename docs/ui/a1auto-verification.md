# 공개 홈 UI 검증

작업일: 2026-09-08~09. 기준 커밋: `aa86b24fb0b4b929df3513298c0d9f337c81d56d` (작업 시작 시 fetch한 origin/main).
브랜치: `codex/recar-a1auto-ui`. 작업 디렉터리: `worktrees/recar-a1auto-ui`.
원래 `crew-knowledge-guide` 작업 트리와 사용자의 미커밋 변경은 수정하지 않았다.

## 구현 범위

| 파일 | 변경 |
| --- | --- |
| `index.html` | 공개 홈 구조, 탐색·상담 진입, 모바일 메뉴, 기존 상담 폼·사업자 고지 유지 |
| `home.css` | `.public-home` 한정 반응형 스타일. 기존 공통 CSS 파일은 수정하지 않음 |
| `home.js` | 기존 데이터 렌더링, 필터, 배너·레일·메뉴 조작, 이미지/로딩/오류 상태 |
| `script.js` | 홈 전용 렌더러 연결, 상담 중복 제출 차단 및 busy 상태만 추가 |
| `server.js` | 홈 CSS·JS·폰트 정적 파일 허용 및 WOFF2 MIME만 추가 |
| `assets/home-fonts/` | 기존 앱 폰트의 글리프·라이선스 메타데이터를 보존한 WOFF2 압축본과 OFL |
| `tests/e2e/home-ui.spec.js` | 홈 기능·예외·접근성·폭별 회귀 테스트 12개 |
| `package.json`, `eslint.config.js` | 새 홈 스크립트를 기존 검사 명령에 포함 |
| `tools/capture-home.cjs` | 6개 폭과 주요 섹션 스크린샷·레이아웃 지표 생성 |

가격 데이터, 가격 산출식, API 요청/응답, 인증·권한, 크루·관리자·Flutter 소스는 변경하지 않았다.
카탈로그 기준일은 실제 파일의 2026-05-18로 표시한다. 운영 최신 가격인 것처럼 현재 날짜로 바꾸지 않았다.
형식 압축 전 폰트 합계 4,726,568바이트, 압축 후 2,434,532바이트. 원본 폰트는 수정하지 않았고 새 런타임 의존성은 없다.
첫 배너 이미지는 우선 로드하고 하단 차량·콘텐츠는 lazy loading과 고정 비율을 사용한다. 실제 모바일 회선의 성능 점수는 측정하지 않았다.

## 테스트 결과

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| `npm run build` | PASS | ESLint, 기존 knowledge 타입 검사, JS 구문 검사, 서버 테스트 6개 |
| 홈 E2E 12개 | PASS | 실데이터 가격/기본조건, 검색·필터·정렬, 메뉴, 배너·레일, 가이드, 상담 상태, API 실패/재시도 |
| 기존 추천 흐름 6개 | PASS | 코드 유무/유효성, 저장·표시·복사, 접수 payload 귀속, 기존 다운로드·크루·friends 링크 |
| 전체 E2E 35개 | FAIL: 33 PASS / 2 FAIL | 아래의 기존 가이드 테스트 불일치 2개. 이번 홈 E2E 실패 없음 |
| 데스크톱·모바일 axe | PASS | WCAG 2A/AA·2.1AA 태그의 serious/critical 위반 0건. 전체 접근성 인증은 아님 |
| 360 / 390 / 768 / 1280 / 1440 / 1920px | PASS | 가로 넘침 0, 화면에 노출된 깨진 이미지 0, JS pageerror 0 |
| 320px 좁은 화면 재배치 | PASS | 제목·가격·상담 버튼 잘림 및 페이지 넘침 없음. 브라우저 실제 확대 조작과 동일한 테스트는 아님 |
| 실제 iOS/Android 키보드·Safari | BLOCKED / 미실행 | 데스크톱 Chromium 뷰포트 검사와 폼 포커스 검사만 수행 |
| 운영 상담 접수·관리자 수신 | BLOCKED / 의도적 미실행 | 운영 쓰기 금지. 로컬 브라우저에서 요청을 mock하고 Firestore 쓰기를 차단 |

기존 실패:

1. `tests/e2e/knowledge-interactions.spec.js:19`: 가이드의 현재 설명문과 예전 설명문 문자열 기대값이 다르다. 이번 작업은 가이드 소스와 테스트를 수정하지 않았다.
2. `tests/e2e/responsive-visual.spec.js:89`: `/crew/` 응답에 `recarplan.vercel.app/crew/login`이 포함되기를 기대하지만 현재 진입은 자체 도메인 화면이다. 이번 UI 작업에서 크루 라우트를 되돌리지 않았다.

수정 중 발견한 새 홈 문제는 별도로 해결했다: CSS/JS 정적 제공 누락, 웹폰트 미적용, 대비가 낮은 보조 글씨, 푸터 링크색, 스크롤 영역 키보드 접근, 필수값 aria-invalid 표시 시점, 재시도 로딩 표시.
상담 성공 검증은 실제 서버 성공 응답 형식을 기다린 뒤에만 표시되는지 확인했다. 누락 입력/동의, 대기 상태, 중복 이벤트, 실패 후 재시도를 별도로 테스트했다. 운영 DB에는 테스트 문의를 만들지 않았다.

## 실행·캡처

```powershell
npm ci
node server.js --port 5188
# 다른 터미널
npm run build
npx playwright test tests/e2e/home-ui.spec.js tests/e2e/referral-flow.spec.js
node tools/capture-home.cjs implementation
```

로컬 미리보기: http://127.0.0.1:5188/

최종 캡처: `artifacts/a1auto-ui/implementation/`.
`1440-first.png`, `1440-full.png`, `1440-special.png`, `1440-quote.png`, `1440-footer.png`;
`390-first.png`, `390-full.png`, `390-special.png`, `390-quote.png`, `390-footer.png`.
각 폭의 `*-first.png`, `*-full.png` 및 `layout-results.json`도 저장한다. 캡처는 로컬 검증 산출물로 git에서 제외된다.

## 배포 상태와 남은 차이

**로컬 UI 구현 완료와 운영 통합 검증 완료는 다르다.** 운영 배포·원격 push·main merge·DB 수정은 하지 않았다.
배포 워크플로의 main push 트리거를 확인하고 전용 로컬 브랜치에만 커밋한다. 실제 커밋 해시는 최종 응답과 `git log -1`로 확인할 수 있다.
특가·후기·수치·상담 모달·카탈로그 조건의 의도적인 차이는 `a1auto-reference.md`에 기록했다.
기존 전체 차량·크루·관리자 하위 화면은 개편 범위가 아니므로 기존 디자인을 유지한다.
