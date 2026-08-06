# RE:CAR Crew Knowledge Guide

## Purpose

`/crew/knowledge/` is a public visual knowledge guide for RE:CAR creators. It explains RE:CAR, long-term rental, automobile lease, customer starting points, contract conditions, and safe advertising language. It does not provide CRM, referral tracking, scripts, AI generation, settlement, or personalized recommendations.

The development-only route is `/crew/knowledge/preview/`. The server returns 404 for this route when `NODE_ENV=production`.

## Content hierarchy

1. Applicable law and official government guidance
2. Industry standard terms and official association disclosures
3. Provider product terms and official FAQ pages
4. RE:CAR repository behavior and operating policy
5. General explanatory copy

The guide shows general structures only. Product terms, estimates, screening results, product explanations, and signed contracts take priority.

## RE:CAR pricing language

The existing server applies a stable display lift of KRW 20,000-25,000 to vehicle monthly display figures (`monthlyDisplayLiftMin` and `monthlyDisplayLiftMax`). Therefore the public guide must not claim:

- every fee is zero
- RE:CAR has no margin
- guaranteed lowest price
- every competitor is more expensive

Approved direction:

> 영업사원별 임의 추가 수수료 없이 동일한 RE:CAR 기준으로 여러 금융사의 조건을 비교합니다.

The public page does not expose personalized referral codes or consultation links.

## Source review

- Last content review: 2026-08-06
- Laws: National Law Information Center
- Rental standard terms: Korea Fair Trade Commission
- Lease disclosures and glossary: Credit Finance Association
- Business vehicle tax guidance: National Tax Service
- Financial advertising guidance: Financial Services Commission
- Product examples: official KB Capital and Lotte Rental pages

Source URLs are maintained in `crew/knowledge/knowledge-data.js`.

## Maintenance

Review legal, tax, insurance, and provider-specific content before changing the displayed review date. Add or revise facts in the structured arrays rather than inserting long text directly into the page. Keep the default screen to three repeated items; place full libraries in the detail drawer.
