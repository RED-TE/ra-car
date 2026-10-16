# 차량 상세 표시 정리

## 적용 내용

- 차량 상세 로딩 화면의 자동차 아이콘과 아이콘 전용 간격 제거.
- 월 납입료 아래 주황색 옵션 추가 금액 배지 제거.
- 홈페이지의 `금융사 N곳 견적 비교하기` 링크 제거. 앱 최신 main에는 이 링크가 이미 없음.
- 옵션 선택, 검증된 월 납입료, 견적 조건 및 신청 흐름 유지.

## 소스

- 홈페이지: RED-TE/ra-car, 기준 main `205a39c76c01851e3273530c1160c0ca27602172`.
- 홈페이지 브랜치: `codex/web-detail-cleanup-20261016`.
- 웹 빌드: `web-detail-cleanup-20261016`.
- 운영 중인 앱 소스 pin과 기존 웹 전용 패치를 보존한 뒤 UI 변경을 추가함.
- 웹 재현 패치: `web_app/patches/runtime.patch`.
- 앱: RECAREA/recar_app, 기준 main `7e3701bc3051c541135fa8d5fe64f7903da9f1c7`.
- 앱 브랜치: `codex/detail-price-cleanup-20261016`.
- 앱 커밋: `66b872418cf9722cebb011d96ca7b69f396eae6d`.
- 앱 변경 파일: `app/lib/screens/vehicle_detail_screen.dart`, `app/lib/widgets/recar_loading_state.dart`.

## 검증

- 앱 `quote_trim_selection_test.dart`: 29/29 통과.
- 웹 `web_new3_catalog_test.dart`: 38/38 통과.
- 웹 release build: 성공.
- 홈페이지 `npm run build`: lint, typecheck, syntax check 및 34/34 테스트 통과.
- 웹/앱 `git diff --check`: 통과.
- 실제 공개 API로 차량 상세 진입 후 옵션 1개 선택, 월 납입료 갱신 및 삭제 문구 비노출 확인.
- 데스크톱 1200px 및 모바일 390px 브라우저 화면 확인. 모바일 문서 폭 390px로 가로 넘침 없음.
- 네이티브 실기기 실행 및 스토어 배포는 이번 검증에 포함하지 않음.

## 기존 테스트 차이

웹에 함께 추출되는 앱 테스트 `quote_trim_selection_test.dart`는 웹 전용 견적 응답 검증 계약과 맞지 않아 13개 통과, 16개 실패함. 이번 UI 변경 이전의 main 웹 소스에서도 동일하게 13개 통과, 16개 실패를 재현함. 테스트와 가격 검증 조건은 이번 작업에서 변경하지 않았음.

## 공개 상태

로컬 커밋과 배포 파일 준비까지 수행함. 원격 푸시, PR 검사, 병합, 운영 웹 배포, TestFlight 및 스토어 업로드는 아직 수행하지 않음.
