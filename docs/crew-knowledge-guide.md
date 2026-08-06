# RE:CAR Crew Knowledge Guide

## Purpose

`/crew/knowledge/` is a public visual knowledge guide for RE:CAR creators. It explains RE:CAR, long-term rental, automobile lease, customer starting points, contract conditions, vehicle-use economics, crew side-work structure, and safe advertising language. It does not provide CRM, personal referral tracking, scripts, AI generation, settlement requests, or personalized recommendations.

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

## Economy and crew-income language

The economy scene frames vehicle choice as cash-flow and total-use-cost planning. It must not describe rent or lease as an investment product, guarantee returns, or assume that using the same money elsewhere will always produce profit.

The crew side-work scene may explain the repository-backed flow:

1. The crew publishes accurate content and connects an official inquiry.
2. The RE:CAR operations team handles consultation, screening, contract, and delivery.
3. A valid delivered result is reviewed under the latest operating and settlement policy.

Public content must not promise a fixed wage, a minimum monthly income, or immediate payment for a click or inquiry. Per-case or average income figures require a verified reference date, population, period, calculation conditions, cancellation treatment, and tax basis before publication. The public guide deliberately does not display a personal code or a guaranteed income amount.

Crew content that can generate compensation should disclose the economic relationship clearly. Income classification and tax filing depend on the actual activity, so the guide directs users to National Tax Service guidance or a tax professional.

## Source review

- Last content review: 2026-08-06
- Laws: National Law Information Center
- Rental standard terms: Korea Fair Trade Commission
- Lease disclosures and glossary: Credit Finance Association
- Business vehicle tax guidance: National Tax Service
- Economic terminology: Bank of Korea
- Creator income and tax guidance: National Tax Service
- Financial advertising guidance: Financial Services Commission
- Endorsement and economic-relationship disclosure: Korea Fair Trade Commission
- High-income side-job advertising caution: Korea Consumer Agency
- Product examples: official KB Capital and Lotte Rental pages

Source URLs are maintained in `crew/knowledge/knowledge-data.js`.

## Maintenance

Review legal, tax, insurance, and provider-specific content before changing the displayed review date. Add or revise facts in the structured arrays rather than inserting long text directly into the page. Keep the default screen to three repeated items; place full libraries in the detail drawer.
