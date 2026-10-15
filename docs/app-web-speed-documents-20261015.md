# 웹 속도 개선 및 서류 신청

## 범위와 기준

- 저장소: `RED-TE/ra-car`, 브랜치 `codex/app-web-loading-20261015`.
- 웹 main 기준: `6d15fe032ebfef9e744e59a12a67eb44d635e416`.
- 웹 전용 Flutter 소스: `RECAREA/recar_app`의 실제 게시본 `4b0498df0e63aa2c8bbae66e59e1c9a31037e7b0`에 `web_app/patches/runtime.patch` 적용.
- 네이티브 최신 main `84433b09c32aa95f04a1c21332e1e518738992f7`은 게시 웹과 서로 다르므로 그대로 웹에 덮어쓰지 않음.
- 네이티브 체크아웃, 운영 DB, 고객 서류, 기존 견적, 크루·가이드 화면은 변경하지 않음.
- 운영 배포/푸시/병합/스토어 업로드 없음. 아래 수치는 로컬 검증이며 운영 성능 보장이 아님.

## 변경 내용

1. 기존 Pretendard 다섯 정적 글꼴을 동일 공식 버전 v1.3.9 가변 글꼴 하나로 전환. 글자 부분 추출 없음. 각 기존 글꼴의 Unicode 14,336개가 모두 포함됨. OFL 라이선스 동봉. 원래 정적 파일은 삭제하지 않음.
2. 웹 화면 시작 전 필수 세션·추천인 복원만 수행하고 선택적 SDK 초기화는 첫 프레임 뒤로 이동. 브라우저에서는 모바일 스토어 업데이트 게이트와 강제 1.2초 스플래시를 거치지 않음. 네이티브 게이트는 유지.
3. 견적 화면에 `서류 제출까지 직접 신청하기` 추가. 기존 이름/연락처 상담 버튼은 유지. 로그인 → 신청 유형 → 동의 → 서류 → 제출 경로 재사용.
4. 웹 파일 선택기로 JPG/JPEG/PNG/HEIC/HEIF/PDF 선택. 파일 경로 대신 메모리 바이트를 기존 서명 업로드/인증 서버 업로드에 전달. 20MB 및 빈 파일 검증. 서버 전송명은 `document.ext`로 제한하여 고객 원본 파일명 노출을 피함.
5. 클라이언트가 파일 교체 전에 기존 서류를 삭제하지 않음. 취소·오류·재시도·401 시 성공으로 표시하지 않음. 새로고침 시에도 PENDING_UPLOAD를 완료로 세지 않고, 미완료 교체가 이전 UPLOADED 파일을 가리지 않음. 재제출 요청 문서는 필수 서류 완료에서 제외. 브라우저의 파일 변경 메뉴에서 네이티브 카메라 문구를 제외.
6. 기존 신청 교체 시 웹의 `1 << 32`가 0이 되어 발생하던 RangeError 수정. 중복 방지 키는 정확한 정수 상수 사용. 신규·교체 신청 모두 추천인 코드 전달. 오류 후 재시도도 서류 신청 경로 유지.
7. 홈페이지에 `직접 견적·서류 신청`과 `상담받기`를 함께 배치. 같은 도메인 `/app/`으로 이동하며 추천인/허용된 광고 파라미터를 유지. token/next 등은 전달하지 않음. 광고를 별도 사이트 두 개로 나눌 필요 없음.

## 검증

- Flutter release web build: 성공 (SDK 3.41.1, 운영 API URL, `/app/` base path).
- `npm run build`: lint/type/syntax 및 Node 테스트 28개 통과.
- 전체 Playwright: 115개 통과. 이 검사는 합성 API 응답을 포함하며 운영 가입/승인 증명이 아님.
- Flutter 공통 신청·완료·서류/실제 가변 글꼴 모바일 배치: 89개 통과. 320/360/390/430px, 글자 크기 1.0/1.3/2.0 포함.
- Chrome Flutter 웹 신청/파일 업로드/기존 상담/추천인 테스트: 27개 통과. 파일 선택기는 테스트 대역이며 운영에 실서류를 보내지 않음.
- 변경 Dart 정적 검사: 오류·warning 없음. 기존 main.dart의 const 권고 info 2건은 그대로 유지.
- 운영 OpenAPI에서 신청·서류 업로드·확인·관리자 조회 경로 존재 확인. 인증 헤더를 포함한 `recarplan.com` 업로드 CORS 사전 요청 HTTP 200 확인.
- 실제 Chrome에서 홈 차량·목록·차량 상세·견적의 두 버튼 표시와 비회원 로그인 유도 확인. 390px에서 가로 넘침 없음.
- 아직 미검증: 운영 계정 실서류 제출 → 관리자 파일 열람, 모바일 Safari의 실제 파일 선택/HEIC 처리, 실제 광고 전환 이벤트 수집. 경로/파라미터 유지가 광고 전환 분석 전체의 검증을 의미하지 않음.

## 성능

동일 브라우저, 로컬 gzip 서버, cold HTTP cache, 5Mbps/150ms, 실제 공개 API로 변경 전후 각 3회 교차 측정.
최종 빌드 중앙값: 첫 프레임 17,387 → 11,770ms (32.3% 단축), 홈 데이터 요청 완료 20,724 → 12,850ms (38.0% 단축), 글꼴 전송 6,576,815 → 3,000,370bytes (54.4% 감소). 최종 원시 측정값과 산출물 해시는 `docs/app-web-speed-measurements-20261015.json` 참고.
이전 반복 비교에서는 첫 프레임 17,687 → 11,024ms, 이후 확인에서는 17,449 → 11,788ms로 관찰됐다. 단일 가장 빠른 수치를 성능 보장으로 사용하지 않는다.
요청 완료 시각은 화면 상호작용 가능 시각이 아님. Cross-origin timing의 응답 상태/바이트 0은 오류가 아니라 측정 제한일 수 있음.
느린 회선에서는 Flutter 엔진·코드·전체 한글 글꼴 다운로드 비용이 남음. 1~2초 로딩을 보장하지 않음.

## 재현

웹 레포에서 아래 순서로 실행한다. RECAREA 로컬 복제본은 읽기 전용 소스이며 기존 작업 내용은 사용하지 않는다.

```sh
node tools/prepare-app-web.cjs /path/to/recar_app /new/empty/build-root
cd /new/empty/build-root/app
flutter pub get --enforce-lockfile
flutter test --platform chrome test/web_application_entry_test.dart test/web_document_upload_test.dart test/web_quote_inquiry_sheet_test.dart test/web_referral_service_test.dart
flutter test test/application_documents_loading_test.dart test/application_replacement_flow_test.dart test/application_submission_success_test.dart test/application_flow_layout_test.dart
flutter build web --release --no-pub --base-href=/app/ --no-wasm-dry-run --dart-define=API_BASE_URL=https://api.recarplan.com
cd /path/to/ra-car
node tools/stage-app-web.cjs /new/empty/build-root/app
npm run build
npx playwright test
```

`prepare`는 기존 폴더 덮어쓰기를 거부한다. `stage`는 소스 커밋/패치 해시/가변 글꼴/신청 버튼을 확인하고 생성 파일만 복사하며 기존 자산을 삭제하지 않는다. `release.json`에 실제 산출물 해시가 기록된다. Pages 공개 묶음에서 `web_app/` 소스·테스트를 제외한다.

## 운영 방식 권장

광고 주소는 기존 홈페이지 하나로 유지하고, 고객이 상담과 직접 신청 중 선택하게 한다. `앱에서 보기`라는 이름은 설치가 필요한 것으로 오해하기 쉬우므로 사용하지 않는다.
화면이 두 종류라 프론트 유지보수는 남는다. 일반 상담 문의와 인증된 심사 신청은 기존 관리자 메뉴가 서로 다르며, 두 목록까지 완전히 합치는 관리자 개편은 이 패치에 포함하지 않는다.

배포 전에는 운영 전용 테스트 계정/합성 서류로 제출·관리자 열람까지 검증해야 한다. 비밀번호·토큰·실제 신분증을 저장소나 보고서에 기록하지 않는다. 운영 배포는 별도 승인 후 진행한다.
