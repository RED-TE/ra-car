import os
import random

testimonials = [
    ("솔직히 반신반의하고 시작했는데 2주 지나고 나서 블로그 유입이 눈에 띄게 늘었어요. 제가 직접 쓴 것보다 퀄리티가 더 좋은 것 같아서 좀 허탈하기도 했습니다 ㅋㅋ 계속 쓸 것 같아요.", "k***3@gmail.com", "PRO 플랜", 5),
    ("처음에 LITE로 시작해봤는데 효과가 있어서 PRO로 업그레이드했어요. 확실히 PRO가 글이 다양하고 자연스럽습니다. 지역 키워드 노출이 잘 되는 편이에요. 매달 갱신하고 있습니다.", "s***2@naver.com", "PRO 플랜", 5),
    ("이런거 써본 적 없어서 처음엔 엄청 겁먹었는데 막상 써보니 어렵지 않더라고요. 블로그가 꾸준히 올라가는게 보이니까 신기하네요.", "d***9@daum.net", "LITE 플랜", 5),
    ("저품질 걱정 많이 했는데 지금까지 한 번도 안 걸렸습니다. 이미 3개월째 쓰고 있고 지금은 계정을 4개로 늘렸어요. 문의도 전보다 확실히 많이 옵니다.", "p***7@gmail.com", "PRO 플랜", 5),
    ("처음 세팅할 때 조금 헷갈리는 부분이 있었지만 문의하니 당일 답변해주셨어요. 막상 돌아가니까 신경 쓸 게 없어서 편합니다. 예전에 하루에 한 시간씩 블로그 썼던 게 기억나는데 이제 그 시간을 다른 데 쓰고 있어요.", "j***5@naver.com", "LITE 플랜", 4),
    ("포스팅 퀄리티가 웬만한 대행사보다 낫습니다. 제일 마음에 드는 건 알아서 사진 변환까지 다 해준다는 점이에요.", "m***x@gmail.com", "PRO 플랜", 5),
    ("효과는 확실히 있는데, 아무래도 세팅 초기에 가이드를 좀 꼼꼼히 읽어봐야 하네요. 그래도 적응되니까 진짜 편합니다.", "t***3@daum.net", "PRO 플랜", 4),
    ("다계정 운영하기에 정말 최적화되어 있습니다. 기존에 쓰던 방식보다 훨씬 시간 절약이 많이 돼요.", "a***1@naver.com", "PRO 플랜", 5),
    ("입문용으로 라이트 써보고 있는데, 2계정만으로도 쏠쏠하게 콜 들어옵니다. 다음 달엔 꼭 프로로 넘어갈 예정입니다.", "r***c@gmail.com", "LITE 플랜", 5),
    ("원고 생성 속도가 빠르고 키워드 캐치가 예술입니다. 다만 가끔 말투가 너무 똑같아질 때가 있어서 중간중간 제가 조금씩 손봐주고 있어요.", "h***9@naver.com", "PRO 플랜", 4),
    ("영업하느라 바빠서 블로그는 아예 포기상태였는데 리카봇 덕분에 다시 살아났네요. 알아서 예약발행까지 다 해주니 든든합니다.", "b***a@daum.net", "PRO 플랜", 5),
    ("가격이 조금 부담스러울까 싶었는데, 전환율 생각하면 오히려 남는 장사입니다. 투자대비 효율 짱!", "y***u@gmail.com", "PRO 플랜", 5),
    ("완전 자동화라는게 처음엔 안 믿겼어요. 직접 써보니까 왜 다들 극찬하는지 알겠네요. 지인들에게도 추천 중입니다.", "c***d@naver.com", "LITE 플랜", 5),
    ("문의량이 전보다 1.5배 이상 늘었어요. AI가 트렌디한 차종이나 옵션 설명까지 기가 막히게 잡아줍니다.", "g***3@nate.com", "PRO 플랜", 5),
    ("5년 넘게 블로그 해봤는데 이렇게 꾸준히 유지된 적은 없었어요. 스스로 하면 어느 순간 게을러지는데 자동이니까 그런 게 없잖아요.", "w***6@gmail.com", "PRO 플랜", 5),
    ("부산 쪽에서 운영 중인데 지역 키워드로 유입이 생기기 시작했어요. 서울처럼 경쟁이 심하지 않아서인지 효과가 빨리 나타나는 것 같아요.", "i***2@naver.com", "PRO 플랜", 5),
    ("가성비 훌륭합니다! 라이트 플랜으로도 충분히 효과 보고 있어요. 나중에 여력 되면 계정 늘려보려고요.", "z***8@gmail.com", "LITE 플랜", 5),
    ("개인 딜러라 마케팅 예산이 넉넉하지 않아요. 그런데 이 가격에 이 정도 효과면 솔직히 생각보다 훨씬 가성비 좋습니다.", "q***3@daum.net", "PRO 플랜", 5),
    ("가끔 사진 첨부 순서가 꼬이거나 할 때가 아주 가끔 있지만 문의하면 금방 고쳐주시네요 ㅎㅎ 만족합니다", "v***n@naver.com", "PRO 플랜", 4),
    ("초반 한 달은 변화가 별로 없었는데 2달째부터 포스팅 쌓이면서 상단에 많이 꽂히네요. 인내심 갖고 꾸준히 하길 잘했어요.", "o***s@gmail.com", "PRO 플랜", 5),
    ("솔직히 저만 알고 싶은 프로그램입니다 ㅋㅋㅋㅋ 경쟁자 늘어나는 건 싫지만 그래도 개발자님 번창하시라고 리뷰 남겨요", "e***t@naver.com", "LITE 플랜", 5)
]

html_reviews = []
for text, email, plan, stars in testimonials:
    star_html = ""
    for _ in range(stars):
        star_html += `<span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">star</span>`
    for _ in range(5 - stars):
        star_html += `<span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 0">star</span>`
    
    review_block = f"""
                                <div class="break-inside-avoid bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                                    <div class="flex items-center gap-1 text-yellow-400 mb-3">
                                        {star_html}
                                    </div>
                                    <p class="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-4">{text}</p>
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-xs font-bold text-slate-900 dark:text-white">{email}</p>
                                            <p class="text-[10px] text-slate-400 mt-0.5">{plan}</p>
                                        </div>
                                    </div>
                                </div>
"""
    html_reviews.append(review_block)

reviews_str = "".join(html_reviews)

section_html = f"""
        <!-- Testimonials -->
        <section class="py-24 overflow-hidden reveal bg-background-light dark:bg-background-dark" id="testimonials">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight">파트너 후기</h2>
                    <p class="mt-3 text-slate-500 dark:text-slate-400 text-sm">실제 사용자들의 생생한 리뷰입니다.</p>
                    <div class="mt-4 flex items-center justify-center gap-2">
                        <div class="flex text-yellow-400">
                            <span class="material-symbols-outlined text-2xl" style="font-variation-settings:'FILL' 1">star</span><span class="material-symbols-outlined text-2xl" style="font-variation-settings:'FILL' 1">star</span><span class="material-symbols-outlined text-2xl" style="font-variation-settings:'FILL' 1">star</span><span class="material-symbols-outlined text-2xl" style="font-variation-settings:'FILL' 1">star</span><span class="material-symbols-outlined text-2xl" style="font-variation-settings:'FILL' 1">star</span>
                        </div>
                        <span class="font-black text-2xl text-slate-900 dark:text-white">4.9</span>
                        <span class="text-slate-500 dark:text-slate-400 text-sm">/ 5.0 &nbsp;(21개 리뷰)</span>
                    </div>
                </div>
                <!-- Testimonials preview container with fade -->
                <div class="relative" id="testimonials-preview">
                    <div style="max-height: 460px; overflow: hidden;
                    -webkit-mask-image: linear-gradient(to bottom, black 40%, rgba(0,0,0,0.3) 75%, transparent 100%);
                    mask-image: linear-gradient(to bottom, black 40%, rgba(0,0,0,0.3) 75%, transparent 100%);"
                        id="testimonials-grid-wrap">
                        <div class="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
{reviews_str}
                        </div>
                    </div>
                    <!-- 더보기 버튼 -->
                    <div class="text-center mt-4">
                        <a href="reviews.html" id="all-reviews-btn"
                            class="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-primary/20 text-sm">
                            후기 전체 보기 (21개)
                            <span class="material-symbols-outlined text-base">arrow_forward</span>
                        </a>
                    </div>
                </div>
            </div>
        </section>
"""

# Now find where to insert it in index.html
import re
with open(r"c:\Users\jhxox\Desktop\sales_progerm\inphoto\gudok_PG\index.html", "r", encoding="utf-8") as f:
    html_content = f.read()

# Insert before <!-- Pricing Section -->
target_str = "<!-- Pricing Section -->"
if target_str in html_content:
    new_html = html_content.replace(target_str, section_html + "\n\n        " + target_str)
    with open(r"c:\Users\jhxox\Desktop\sales_progerm\inphoto\gudok_PG\index.html", "w", encoding="utf-8") as f:
        f.write(new_html)
    print("Success")
else:
    print("Target string not found in index.html")
