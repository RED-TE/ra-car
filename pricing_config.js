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
            desc: 'AI 블로그 자동화 입문자를 위한 실속형 플랜',
            features: [
                '계정 2개 운영',
                'AI 자동 글 작성 (1200자)',
                '이미지 자동 삽입',
                '자동 발행',
                'SEO최적화 10개 이상',
                '고급 글 템플릿 6종 지원',
                '다계정 미지원'
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
            desc: '1년 동안 끊김 없이 자동화, 최대 할인 혜택',
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
            desc: '전문적인 다계정 운영을 위한 강력한 기능',
            features: [
                'LITE 기능 전부 포함',
                '계정 8개 다계정 운영',
                '긴 글 (3200자까지)',
                '이미지에 워터마크 삽입 가능',
                '사진에 링크 삽입 가능',
                '발행 전 검색 분석',
                'SEO 최적화 발행 25개 이상',
                '고급 글 템플릿 20종 지원'
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
            desc: '비즈니스 확장을 위한 최고의 선택, 압도적 가성비',
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
            desc: '대행사 및 전문 마케터를 위한 엔터프라이즈 플랜',
            features: ['PRO 기능 포함', '추가 기능 준비 중']
        }
    },
    defaultPlan: 'PRO'
};
