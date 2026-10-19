# 카탈로그 자동 갱신 — 2026-10-19

- 기존 웹 전용 source pin과 runtime.patch를 유지하고 카탈로그 변경 감지만 추가했다. 웹 신청·서류 업로드·추천 링크·로그인 흐름을 새 main 앱으로 대체하지 않았다.
- 빌드 ID: `web-catalog-auto-20261019`. API: `https://api.recarplan.com`.
- 차량 목록 진입·앱 복귀·사용 중 5분 간격에 작은 `catalog/version` 응답을 확인한다. 버전이 달라지면 차량 목록/상세/404 캐시만 무효화한다. 견적 금액·이력·선택 조건은 변경하지 않는다.
- 서버 가격·마진·수수료 계산식 및 DB 스키마는 변경하지 않는다. 목록 가격은 최종 견적을 대신하지 않는다.
- 로컬 검증: 변경 Dart 분석 통과; Chrome 26 tests; 사이트 lint/typecheck/check 및 Node 50 tests; 전체 Playwright 154 tests 통과. 외부 API는 UI 회귀 테스트에서 mock 처리했다.
- 이 문서 작성 시 배포 전이다. 병합 후 Pages 작업 성공과 운영 `app/release.json` 및 산출물 해시 일치를 별도로 확인해야 배포 완료로 판단한다.
