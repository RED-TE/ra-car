/**
 * 페이앱(PayApp) 결제 연동 설정
 * - 판매자관리사이트(https://payapp.kr) 로그인 → [설정] 탭 → 연동정보에서
 *   판매자 회원아이디(userid) 확인 후 아래에 입력하세요.
 * - 연동 Key/Value는 서버 사이드 결제통보(feedbackurl) 처리 시에만 사용합니다.
 */
const PAYAPP_CONFIG = {
    /** 페이앱 판매자 회원아이디 (필수). 빈 문자열이면 결제 창 호출 전 안내 메시지가 표시됩니다. */
    userid: 'jhxox0707',
    /** 결제창에 표시할 상점명 */
    shopname: '리카오토플랜',
    /**
     * 결제 완료 후 이동할 URL (현재 창 기준).
     * 비워두면 자동으로 현재 오리진 + '/checkout_success.html' 사용.
     */
    returnUrl: '',
    /**
     * 결제통보(웹노티) URL. 페이앱 서버가 결제 상태 변경 시 POST로 호출합니다.
     * 서버 페이지에서 'SUCCESS'를 응답해야 결제가 진행됩니다.
     * 정적 사이트만 있는 경우 비워두고, 나중에 백엔드 구축 후 설정하세요.
     */
    feedbackurl: 'https://us-central1-recarauto-88950.cloudfunctions.net/payappFeedback'
};
