# Payment Checkout Implementation Guide

This folder contains the checkout flow for "Ricar Auto Plan" with **페이앱(PayApp)** PG 연동.

## 📂 File Structure

- **`checkout.html`**: 결제 페이지. 플랜 선택, 구매자 정보, PayApp 결제 요청.
- **`payapp_config.js`**: **페이앱 연동 설정** (가맹점 ID, 상점명, returnurl, feedbackurl).
- **`checkout_success.html`**: 결제 완료 후 이동 페이지.
- **`checkout_fail.html`**: 결제 실패 시 이동 페이지.
- **`pricing_config.js`**: 플랜 ID, 이름, 가격, 기능 정의.

## ⚙️ 페이앱 연동 설정 (필수)

1. [페이앱 판매자관리사이트](https://payapp.kr) 로그인 → **설정** 탭 → **연동정보**에서 **판매자 회원아이디** 확인.
2. `payapp_config.js`를 열어 **`userid`**에 위에서 확인한 아이디를 입력합니다.
   ```javascript
   userid: '여기에_판매자_회원아이디',
   ```
3. (선택) `returnUrl`을 비워두면 `현재 도메인/checkout_success.html`로 이동합니다. 다른 URL을 쓰려면 입력.
4. (선택) 결제통보(웹노티)를 받으려면 서버 페이지 URL을 **`feedbackurl`**에 설정합니다. 해당 페이지는 POST 수신 후 `SUCCESS`를 응답해야 합니다. 정적 사이트만 있을 경우 비워두면 됩니다.

> **참고**: 결제 요청은 **HTTPS** 환경에서만 정상 동작합니다. (페이앱 오류코드 70001)

## 🌐 GitHub( GitHub Pages ) 배포 시

- **HTTPS**로 제공되므로 페이앱 결제 요청은 정상 동작합니다.
- **필수**: 배포 전 `payapp_config.js`에서 **`userid`**에 페이앱 판매자 회원아이디를 입력한 뒤 푸시해야 결제하기가 동작합니다. (비워두면 방문자가 결제 버튼을 눌렀을 때 설정 안내만 표시됩니다.)
- **returnurl**: GitHub Pages 프로젝트 사이트(예: `https://사용자명.github.io/저장소명/`)로 배포해도, 결제 완료 후 `checkout_success.html`로 자동 이동하도록 현재 경로 기준으로 설정되어 있습니다.
- **공개 저장소**에 `userid`를 넣으면 해당 값이 코드에 노출됩니다. 페이앱 JS API는 프론트에서 userid를 사용하므로 노출 자체는 불가피하며, 보안상 중요한 값은 서버용 **연동 Key/Value**(feedbackurl 처리 시 사용)이므로 이 값들은 저장소에 올리지 마세요.

## 🚀 사용 방법

1. **`payapp_config.js`**에 페이앱 가맹점 ID(`userid`)를 입력합니다.
2. **HTTPS**로 서비스 중인 도메인에서 `checkout.html`을 엽니다.
3. 로그인 후 플랜 선택 → 구매자 정보 입력 → 필수 약관 동의 → **결제하기** 클릭.
4. 페이앱 결제창에서 결제 완료 시 `returnurl`(기본: `checkout_success.html`)로 이동합니다.

`userid`가 비어 있으면 결제하기 클릭 시 "페이앱 가맹점 ID가 설정되지 않았습니다" 안내가 표시됩니다.

## 📱 Mobile Responsiveness
- Resize your browser window to mobile width (~375px).
- Verify that the layout stacks (Input on top, Summary on bottom).
- Ensure the Payment Button is easily accessible.

## 🔗 참고
- 결제 완료 후 `returnurl`로 이동할 때 페이앱에서 전달하는 파라미터는 페이앱 연동매뉴얼(결제통보/returnurl)을 참고하세요.
- **feedbackurl**을 사용하면 결제 요청·완료·취소 시 페이앱 서버가 해당 URL로 POST하며, 응답으로 `SUCCESS`를 반환해야 합니다. 서버 구축 후 설정하는 것을 권장합니다.
