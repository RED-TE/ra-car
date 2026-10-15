# RE:CAR 앱 웹 신규 3종 카탈로그 적용

## 범위와 상태

- 웹 저장소: RED-TE/ra-car, 작업 경로 `/private/tmp/recar-app-web-loading-20261015`.
- 브랜치: `codex/app-web-new3-catalog-20261015`.
- 최신 웹 origin/main `6d15fe032ebfef9e744e59a12a67eb44d635e416`을 포함한 기존 웹 전용 패치 `a06d459ee3c13fa776a416a223adace19fcdf810`에서 분기.
- 운영 API 기준 SHA(사용자 제공 및 서버 origin/main 대조): `59338676c6704ab8b6f3ba11ad683a0b08547bb8`.
- 앱 웹 소스는 기존 게시 소스 `4b0498df0e63aa2c8bbae66e59e1c9a31037e7b0` + 웹 전용 패치로 재현. 최신 네이티브 화면으로 갈아끼우지 않음.
- 새 빌드 ID: `web-catalog-new3-20261015`. 로컬 산출물이며 운영 게시 증거가 아님.
- 네이티브 앱, 서버 코드/DB, 고객 발송, 저장 견적/대화/snapshot, 인증 키, 결제/모델 한도는 수정하지 않음.
- 원본 앱 저장소의 기존 tracked 변경 7개와 untracked 자료를 보존.

## 운영 조회 결과

2026-10-15 공개 API를 순차 조회. 목록 `size=100&sort=display_order`의 2페이지에서 148대, 중복 ID 0개를 확인. 신규 3종은 146~148번째이며 display_order=5001. 기본 정렬은 `monthly_price_asc` 유지.

| 차량 | 상품 | vehicle_id | 기본 trim_id | 트림 수 |
|---|---|---|---|---|
| GV80 Hybrid | RENTAL | 7fdb7a64-9387-4a4d-9454-0dacf34e63b5 | 617049a2-29ec-4ff9-9a52-c52c31b9e561 | 6 |
| GV80 Hybrid 블랙 | RENTAL | a2d21c66-302a-4120-9e19-bfde197b22f9 | fd2cd6c7-434e-4163-b8db-bae1c7483301 | 3 |
| 스타리아 라운지 리무진 Hybrid | LEASE | 2f7b30e7-64f8-445f-8e04-346ca341d306 | ab8e40c2-1a30-40c6-9d37-aedb79aff90e | 2 |

상품 판정 근거는 목록의 `available_product_types`. 전체 실제 trim_id 및 응답 근거는 `app-web-new3-audit-20261015.json`과 `web_app/test/fixtures/new3_catalog_20261015.json`에 보관. 이 공개 응답 기록은 테스트용이며 고객 화면에서 하드코딩 가격표로 사용하지 않음.

블랙의 트림 3개는 모두 색상/옵션 0개가 정상. 빈 항목을 조회 실패나 미완성 트림으로 분류하지 않음.

## 견적 검증

- 운영 계산 요청 11건: 실제 트림 ID, 60개월/연 10,000km/보증금 0/선납금 0/옵션·색상·재고 선택 없음.
- 11/11 응답에서 `selection_v1`, 요청 차량/트림/조건 일치, `price_provenance_v1`, `EXACT`, `request_conditions_verified=true`, `sales_ai_eligible=true`, unknown/unsupported 사유 없음 확인.
- 웹 기본 외장색 선택을 포함한 GV80/스타리아 추가 계산 2건도 요청 조건 검증과 EXACT 통과. 단 `sales_ai_eligible=false`, 사유 `COLOR_OR_INVENTORY_OUT_OF_INITIAL_SCOPE`. 정상 웹 견적과 최초 Sales AI 사용 가능 여부는 서로 다른 판단임.
- 서버의 `quote_kind=ESTIMATE`, 공급사 발행시각/유효기간 null. 금융사 확정 계약가나 실시간 수집 가격이라고 주장하지 않음.
- 신규 3종의 2026-10-14 스냅샷 날짜는 승인된 인계 정보. 다른 145대의 수집일로 확대하지 않음.
- 견적 API 경로/산식/계약은 유지. 클라이언트 가격 계산을 새로 만들지 않고 검증된 응답의 월납만 수신.
- 차량/트림/선택/상품/기간/주행거리/보증금/선납금 또는 provenance가 맞지 않으면 선택 견적은 실패 처리. 목록 대표 월납으로 대체하지 않음.

## 웹 변경

1. 홈 첫 100대 제한과 추천 첫 2페이지 제한 제거. 서버가 알려준 모든 페이지를 순차 조회하되 페이지·total 변화, 중복 ID, 빈 페이지/누락 합계는 실패 처리.
2. 페이지당 기존 상한 100 유지. 100페이지 초과는 무제한 호출 대신 실패 처리하며 부분 목록을 완료로 반환하지 않음.
3. public 차량 캐시만 갱신. 강제 상세 갱신은 이전 404 negative cache를 우회. 사용자 저장 데이터에는 접근하지 않음.
4. 국산/수입 브랜드로 RENTAL/LEASE를 강제하던 필터 제거. 상세 진입·상품 선택은 실제 available_product_types로 제한.
5. 목록 메타데이터가 없는 상세 진입은 실제 모델명으로 전체 검색 후 동일 vehicle_id를 확인. 상품 정보 미확인 상태에서 브랜드로 추정하지 않음.
6. 국산/수입 탭은 category assignment 대신 공식 `origin=domestic/imported`를 사용.
7. 기존 웹 속도 개선, 전체 한글 가변 폰트, 상담/서류 업로드, 추천 코드와 기존 신청 보존 흐름 유지.
8. 상세의 일반 placeholder asset이 실제 API 차량 사진보다 우선하던 문제 수정. 실제 URL이 있으면 그 사진을 사용하며, 상대 hosted thumbnail도 기존 공용 URL 정규화로 해석. 다른 차 사진으로 대체하지 않음.

## 남은 연결 항목

- **운영 API 데이터: 신규 3종 categories가 모두 빈 배열.** category=DOMESTIC + 스타리아 LEASE는 total=0, origin=domestic + 같은 차량 LEASE는 total=1. 웹 국산/수입 탭은 우회했지만 세부 차체 카테고리 assignment 기반 필터는 서버의 공식 배정이 필요함. 모델명이나 브랜드로 세부 카테고리를 임의 생성하거나 운영 DB를 수정하지 않음.
- 독립 Sales AI 프로젝트의 ingestion/cache/전달 연결은 이번 앱 웹 범위 밖. 공개 API 11건의 최초 범위 사용 가능성만 검증한 것이며 모델에 전달하거나 고객에게 발송하지 않음.
- 운영 배포/CI/네이티브 재빌드/TestFlight는 이번 요청에서 승인되지 않아 실행하지 않음.

## 검증 근거

- 최종 재현 추출 소스의 Flutter 카탈로그/모델/캐시/이미지/신청 레이아웃 테스트: 117 passed.
- Chrome 런타임의 웹 신청 진입/서류 업로드/상담 모달 테스트: 24 passed.
- 변경 서비스/화면 정적 분석: 오류/경고 없이 종료, 기존 스타일 info 78건 기록.
- 테스트 응답에는 실제 공개 API UUID만 사용. 잘못된 ID를 넣는 음성 테스트는 로컬이며 운영 요청에 사용하지 않음.
- 고정 소스 + canonical patch의 새 디렉터리 재구성, Flutter release build 통과. `app/release.json`의 소스/패치/산출물 SHA-256 일치 확인.
- 웹 저장소 lint/typecheck/syntax 및 Node 테스트 28 passed, 전체 Playwright 브라우저 테스트 115 passed.
- 실제 운영 API를 연결한 로컬 앱 웹에서 홈 page=1,2 조회 확인. GV80 Hybrid/블랙 검색 결과와 실제 블랙 상세의 60개월 예상 월납 1,389,600원, 선택 가능한 옵션 없음 표시, 차량 이미지 렌더링 확인. 이 금액은 해당 요청 조건의 ESTIMATE 응답이며 확정 계약가가 아님.
- 스타리아는 실제 국산차 필터에서 리스로 검색되고, 기본 색상/60개월/연 1만km/선납 0 조건의 811,200원 응답과 '리스 상담 신청하기' 진입 확인. API 사진 URL은 HTTP 200이며 운영 및 로컬 Origin에 대한 CORS 허용 헤더 확인.
- 최종 재빌드의 스타리아 상세에서 실제 API 차량 사진이 placeholder 대신 렌더링됨을 시각 확인(`/private/tmp/recar-new3-final-staria-photo.png`).
- 접근성용 보조 입력 요소를 자동 조작했을 때는 Flutter 캔버스에 검색이 전달되지 않아 일반 캔버스 입력으로 재검증함. 일반 입력의 검색은 정상 동작. 이를 실제 일반 입력 장애로 잘못 보고하지 않음.
