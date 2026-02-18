/**
 * Pricing Config
 * Updated: 2026.02.07
 * - LITE: 99,000원 (할인가, 원가 197,000원)
 * - PRO: 249,000원 (할인가, 원가 399,000원)
 * - MASTER: 준비중
 */
const PRICING_CONFIG = {
    plans: {
        LITE: {
            id: 'LITE',
            name: 'LITE (입문용)',
            price: 99000,
            originalPrice: 197000,
            duration: 30, // 30일
            allowSubscription: true,
            features: [
                'AI 콘텐츠 작성 보조 (1500자 내외)',
                '최대 2개 계정 운영 지원',
                '6종 페르소나 (전환형/노출형)',
                '이미지 기본 업로드 및 배치',
                '타이틀/태그 입력 보조',
                '자동발행',
                '네이버 SEO 최적화 10개 이상 발행'
            ]
        },
        LITE_YEARLY: {
            id: 'LITE_YEARLY',
            name: 'LITE 1년권 (연간 할인)',
            price: 990000,
            originalPrice: 1188000,
            duration: 365, // 365일
            allowSubscription: false, // 1년권은 보통 단건
            badge: '역대급 할인',
            features: [
                'LITE 모든 기능 1년 제공',
                '월 82,500원 꼴 (약 17% 할인)',
                '연 198,000원 추가 절약'
            ]
        },
        PRO: {
            id: 'PRO',
            name: 'PRO (메인 상품)',
            price: 249000,
            originalPrice: 399000,
            duration: 30,
            allowSubscription: true,
            badge: 'BEST',
            features: [
                '계정 5개 이상 사용자 대상',
                'LITE 기능 전부 포함',
                '20종 페르소나 (전환형/노출형)',
                '다계정 운영 (최대 8개)',
                '긴 콘텐츠 (1300자/2200자/3200자 선택)',
                '네이버 SEO 최적화 25개 이상 자동 발행',
                '발행 전 검색 분석',
                '이미지 텍스트 삽입',
                '이미지 링크 삽입'
            ]
        },
        PRO_YEARLY: {
            id: 'PRO_YEARLY',
            name: 'PRO 1년권 (연간 할인)',
            price: 2688000,
            originalPrice: 2988000,
            duration: 365,
            allowSubscription: false,
            badge: '전문가 추천',
            features: [
                'PRO 모든 기능 1년 제공',
                '월 224,000원 꼴',
                '연 300,000원 추가 절약'
            ]
        },
        MASTER: {
            id: 'MASTER',
            name: 'MASTER (전문가용)',
            price: 0,
            duration: 30,
            comingSoon: true,
            allowSubscription: false,
            features: ['PRO 기능 포함', '추가 기능 준비 중']
        }
    },
    defaultPlan: 'PRO'
};
