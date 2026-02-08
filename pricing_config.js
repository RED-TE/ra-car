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
            features: [
                'AI 콘텐츠 작성 보조 (1500자 내외)',
                '6종 페르소나 (전환형/노출형)',
                '이미지 기본 업로드 및 배치',
                '타이틀/태그 입력 보조',
                '자동발행',
                '네이버 SEO 최적화 10개 이상 발행'
            ]
        },
        PRO: {
            id: 'PRO',
            name: 'PRO (메인 상품)',
            price: 249000,
            originalPrice: 399000,
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
        MASTER: {
            id: 'MASTER',
            name: 'MASTER (전문가용)',
            price: 0,
            comingSoon: true,
            features: ['PRO 기능 포함', '추가 기능 준비 중']
        }
    },
    defaultPlan: 'PRO'
};
