# 웹 견적 근거·최근 본 차량 차고 — 로컬 릴리스 후보

운영 배포 증거가 아닌 개발·격리 검증 기록이다. 운영 API 호출, DB 변경, 고객 연락, 원격 push, PR/병합 및 배포는 이 작업에서 하지 않았다.

## 소스·보존 범위

- 웹 기능 브랜치: `codex/web-quote-amounts-20261020`, 이전 후보 `0672a101306ebcffa5c1c21cc94297275b4adbfa`, main 기준 `346dc5c132ff9e456dd3aa84c2b25bc8ca1b6626`.
- Flutter 원본 pin `4b0498df0e63aa2c8bbae66e59e1c9a31037e7b0`과 Pretendard 폰트 pin은 변경하지 않았다. 새 소스 전체로 교체하지 않고 기존 `runtime.patch` 뒤에 최소 소스/회귀 테스트 diff를 추가했다.
- 빌드 ID `web-price-garage-20261021`. 최종 patch SHA-256: `7ff6e52666d7e503b2b26ca67ea5d7fe0155ebaf848fa883d7c1347e468bf6ca`.
- 완전 새 prepare에서 `lib`/`test`의 Dart 파일 262개가 작업 소스와 바이트 단위로 일치했다. 기존 개발 체크아웃, DB, 키, 고객 자료, 기록 fixture, 발송/저장 견적은 수정하지 않았다.

## 변경

- 새 견적만 공통 `QuotePriceEvidence`로 실제 선택 ID, 요청 조건, 원본 조건, 상품, 가격 출처, 출처 식별자/버전/산출 경로와 양수 금액을 검증한다. `UNKNOWN`·불일치·미지원 보증금 효과를 우회하거나 별도 가격을 계산하지 않는다.
- 네이티브 `1d3884268abd2311aca0160ece4aed1bf33268c4`의 공통 검증 파일을 그대로 재사용했다. 파일 SHA-256 `e5b4c2494831eb9ba1677744490128d26317f75f486b56d20d87c48b3568ef64`.
- 정확한 근거가 있는 선납/옵션/색상은 Sales AI 초기 범위 표시만으로 차단하지 않는다. 허용된 범위 표시도 실제 선택과 일치해야 하며, 기타 미지원 사유는 계속 차단한다.
- 선택값 없는 기존 호출자는 서버가 명시한 사용 가능한 기본 트림/활성 leaf만 해석해 `selection_v1`으로 요청한다. 첫 트림을 추정하거나 클라이언트 차량가를 가격 근거로 사용하지 않는다. 저장 견적 파서는 변경하지 않았다.
- 차고는 공개 최근 방문 기록의 마지막 차량 사진·차량명을 보여주고, 기존 견적/상태/서류 기능을 그 아래 유지한다. 손님에게 신청 데이터/개인 가격을 노출하지 않으며, 이미지가 없으면 다른 차 사진 대신 중립 아이콘을 표시한다.
- 홈페이지 차고 사진은 네이티브 `310035ece9cbbda530928341b124b8aed63e2a41`의 원본 그대로다. SHA-256 `03efda0dc086e522ba96a04379172defef1807fe4435c797b0bf4f5fb1657247`. 웹의 기존 `garage_hero_bg.png`도 이미 같은 파란 사진이었으며 그대로 보존했다.
- 로그인, 추천인, 기존 신청, 신청 교체 확인, 서류 업로드, 카탈로그 자동 갱신/ETag·캐시 정책은 유지했다.

## 테스트의 정직한 경계

- 기존 기록 JSON의 `UNKNOWN`이나 누락 proof를 `EXACT`로 고치지 않았다. 과거 스포티지 기록은 미검증 가격/신청/고정 금액을 차단하는 22건으로 검증하며, 가독성은 별도 명시 합성 가격 123,400원의 반응형 12건으로 분리했다.
- 새 가격 계약은 기존 기록의 형태를 메모리에서 복제한 명시 합성 응답을 사용한다. 수집 시각/유효기간은 새로 갱신하지 않았다. 원본 기록 파일은 변경하지 않았다.
- Chrome에는 같은 기존 기록 한 건을 test-only Base64 define으로 전달한다. 이 임시 파일은 `build/web` 밖에 두며, 릴리스 빌드에는 해당 define을 전달하지 않는다. 배포 manifest/컴파일 JS/정적 파일에 테스트 fixture가 섞이지 않는지 별도 검사한다.
- Chrome의 사진 원본 바이트 로딩 테스트 1건은 브라우저 widget harness 제약으로 명시 skip한다. 사진 배치/색상 없음/최근 차량/오류 대체/저장 신청은 Chrome에서도 검사하고, 실제 사진 바이트 SHA는 VM과 stage 도구가 검사한다.
- 기존 폰트 경로, 카테고리 파라미터, 브라우저 전용 entry의 VM skip, scoped worker 이관 테스트의 오래된 전제만 수정했다. 테스트 통과를 위해 앱 기능이나 정확 가격 검증을 완화하지 않았다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| 전체 Flutter VM | 877 통과 / 40 skip / 실패 0 |
| Chrome 가격·차고·기존 문서·신청 | 67 통과 / 사진 바이트 검사 1 skip / 실패 0 |
| Chrome 문서 선택·업로드 | 13 통과 / 실패 0 (VM skip 10개 포함) |
| Chrome 미검증 견적 문의 | 1 통과 / 실패 0 |
| 변경 Dart 소스/테스트 9개 정적 분석 | No issues found |
| `npm run build` | lint·typecheck·check 및 Node 51/51 통과 |
| Flutter release / 실제 stage | 통과, 실제 파일과 release 해시 일치 |

서로 중복된 테스트를 합산한 총 통과 숫자는 제시하지 않는다. VM skip 40건 중 브라우저 전용 17건(신청 교체 6, 문서 선택/업로드 10, 가격 확인 문의 1)은 위 Chrome 실행으로 모두 대체 검증했다. 남은 23건은 선택적 PNG 캡처 산출 테스트로 이번에 실행하지 않았다. 해당 PNG 산출이나 전체 화면의 픽셀 정합까지 검증했다고 주장하지 않는다.

Chrome 사진 바이트 검사 skip 1건은 별도 VM 및 release stage의 원본 SHA 검증으로 대체했으며, 일반 화면/차량/중립 오류 대체 검증은 Chrome에서도 통과했다. 기존 문의 테스트가 놓친 catalog/version 요청도 합성 404로 명시 차단하여 실제 XHR과 정리되지 않은 타이머가 생기지 않게 했다.

실행 로그는 `/private/tmp/recar-web-final-full-20261021.log`, 마지막 mock 보완 후 재실행한 `/private/tmp/recar-web-final-full-after-mock-20261021.log`(동일 877/40/0), `/private/tmp/recar-web-final-chrome-20261021.log`, `/private/tmp/recar-web-final-browser-upload-20261021.log`, `/private/tmp/recar-web-final-browser-inquiry-20261021-v2.log`, `/private/tmp/recar-web-final-build-20261021.log`, `/private/tmp/recar-web-final-stage-20261021.json`, `/private/tmp/recar-web-final-npm-build-20261021.log`에 보관했다. 원본 사진·manifest/컴파일 JS의 test fixture 비포함 검사를 Node 테스트에 포함했다.

웹 릴리스 `main.dart.js` SHA-256은 `0422b74105c5e5daf984901d02164c611abb0b88be41cb6a7562fac5e24fae97`이다. 빌드/소스 pin/해시만 손으로 수정한 것이 아니라 fresh 소스에서 컴파일하고 기존 stage 도구로 갱신했다.

초기 전체 실행의 38개 실패는 차량 상세의 오래된 API mock 22개, 차고 카드가 새 hero 아래 화면 밖에 놓인 테스트 8개, 분석 기능을 끄는 실행 플래그로 인한 mock 검증 8개였다. 분석 테스트는 주입된 mock Dio를 사용하고 Firebase 초기화가 없어 외부 전송되지 않는 설정으로 분리 재검증했다. 이 초기 실패를 제품의 실제 운영 오류나 최종 통과로 혼동하지 않는다.

원격 CI·실제 배포·고객 기기 반영은 별도 릴리스 담당자의 확인 대상이다. 근거 없는 조건의 가격까지 표시된다고 보장하지 않는다.
