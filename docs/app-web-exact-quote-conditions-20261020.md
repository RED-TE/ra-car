# 조건별 견적 금액 보완 — 로컬 릴리스 후보

운영 배포 증거가 아닌 개발·격리 테스트 기록이다. 기존 웹 디자인·로그인·추천인·차고·카탈로그 갱신 흐름은 유지한다.

## 변경

- 서버는 기존 DB에서 차량/상품/기간/선납률/거리 모두 정확히 일치하는 가격을 우선 선택한다. 서버 기능 커밋: `c49bfb5e2a43b6c2de063345129649bad5724ace` (`RECAREA/recar_app`, `codex/quote-condition-matrix-20261020`). 기본 선납 0%·연 1만km의 가격 우선순위와 계산식은 유지한다.
- 웹은 기존 `selection_v1`·요청 조건·실제 가격 근거 검증을 우회하지 않는다. 선납 20%는 원래 지원 범위이므로, 정확한 DB 근거가 있으면 Sales AI 초기 범위 밖이어도 금액 그대로 표시할 수 있다.
- 미지원 비영 보증금의 월납 효과는 검증되지 않았다. 요청/응답에 비영 보증금이 있거나 `NONZERO_GUARANTEE_UNVERIFIED`가 있으면 가격 표시를 승인하지 않는다. 데이터가 없는 조건에 임의 금액을 만들지 않는다.
- 런타임 변경은 `web_app/patches/runtime.patch`에 10줄 추가했으며, 신규 합성 계약 테스트는 `web_app/test/exact_lookup_condition_contract_test.dart`다. 기존 녹화 응답의 `UNKNOWN`을 `EXACT`로 조작하지 않았다.

## 빌드

- 웹 기능 기준: `RED-TE/ra-car` main `346dc5c132ff9e456dd3aa84c2b25bc8ca1b6626`.
- 고정 Flutter 소스 `4b0498df0e63aa2c8bbae66e59e1c9a31037e7b0` 및 폰트 pin은 유지했다.
- build ID: `web-quote-conditions-20261020`.
- 새 추출 경로에서 patch 적용·소스 동일성 비교·release 빌드를 실행하고 기존 stage 도구로 산출물을 갱신했다. release 해시만 손으로 고쳐 테스트를 통과시키지 않았다.
- 생성 파일: `app/.last_build_id`, `app/flutter_bootstrap.js`, `app/index.html`, `app/main.dart.js`, `app/release.json`, 루트/`inquiry` 진입점. 산출물·폰트 해시는 실제 파일과 대조했다.

## 검증 결과

- 가격·선택 계약 Flutter: **110 passed / 1 skipped**.
- 변경 Dart 코드 정적 검사: **No issues found**.
- `npm run check`: 통과. 포트 허용 환경 `npm test`: **50/50 통과**.
- 고정 소스·patch·빌드 ID·해시·loader·캐시 이관·추천인·폰트 preload 검사 통과.
- 서버 확장 회귀: **364 passed / 기존 관리자 CRUD 1개 제외**. 해당 테스트는 수정 전 main에서도 403으로 실패했다.
- 기존 DB 백업 읽기 전용 리허설: 60개월/연 1만km/선납 20% 렌트 88/88, 리스 111/115가 실제 원본 조건 검증을 통과했다. 기본 조건 406개의 전체 응답·가격·지문은 그대로였다. 운영 API 호출은 0회, 백업 SHA-256은 전후 동일했다.

전체 Flutter 회귀를 모두 통과했다고 주장하지 않는다.

| 비교 | 통과 | skip | 실패 |
| --- | ---: | ---: | ---: |
| 변경 전 같은 main 기준 | 522 | 34 | 24 |
| 변경 후 | 553 | 34 | 24 |

실패 이름 24개는 완전히 동일하며 신규 실패는 0개다. 13개는 기존 삭제된 `.otf` 폰트 파일 참조, 나머지는 기존 UI/웹/캐시 계약 테스트다. 추가 31개는 이번 합성 계약 테스트다.

## 미수행과 릴리스 경계

원격 push·PR·병합·운영 배포·TestFlight 업로드·운영 DB 변경·새 수집 가격 임포트는 하지 않았다. 로컬 릴리스 후보가 실서비스 반영을 뜻하지 않는다.

기존 운영 서버의 `friends.py`, `price_provenance.py`, `chazm-lookup.json` 변경과 원본 개발 체크아웃의 dirty 파일은 별도 작업이다. 릴리스 승인 후에도 이를 무조건 checkout/reset하거나 덮어쓰면 안 된다. 정확한 저장 가격이 없는 조건은 계속 확인이 필요하며, 모든 임의 조건의 금액을 보장하지 않는다.
