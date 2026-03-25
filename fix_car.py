import sys

path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\gudok_PG\car.html'

def fix():
    try:
        with open(path, 'rb') as f:
            content = f.read()
        
        # We want to keep everything before the first script tag including firebase 
        # but the corruption started around line 1194.
        # Let's find the first occurrence of "<!-- Scripts (Integrated) -->"
        marker = b"<!-- Scripts (Integrated) -->"
        idx = content.find(marker)
        if idx == -1:
            print("Marker not found")
            return

        # Keep everything before the marker + the script inclusions themselves
        # Actually, let's just keep everything up to the first "firebase_config.js"
        sub_marker = b"firebase_config.js"
        idx2 = content.find(sub_marker, idx)
        if idx2 == -1:
            print("Sub-marker not found")
            return
        
        # The line with firebase_config.js is: 1185:     <script src="firebase_config.js"></script>
        # Let's find the end of that line
        end_idx = content.find(b"\n", idx2)
        if end_idx == -1: end_idx = idx2 + 50
        
        clean_prefix = content[:end_idx+1]
        
        # Now append the clean script logic
        clean_script = b"""    <script>
        let currentBilling = 'single';
        let currentUser = null;

        // --- Auth State ---
        if (typeof auth !== 'undefined') {
            auth.onAuthStateChanged(user => {
                currentUser = user;
                const navAuthSection = document.getElementById('nav-auth-section');
                if (user) {
                    navAuthSection.innerHTML = `
                        <span class="hidden lg:block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[150px] mr-2">${user.email}</span>
                        <button onclick="auth.signOut().then(()=>location.reload())" class="text-sm font-semibold text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-white px-3 py-2 transition-all">로그아웃</button>
                        <button onclick="location.href='license.html'" class="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all">내 구독</button>
                    `;
                } else {
                    navAuthSection.innerHTML = `
                        <button onclick="location.href='login.html'" class="hidden sm:block px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all">로그인</button>
                        <button onclick="location.href='checkout.html?plan=PRO'" class="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-slate-800 rounded-lg shadow-sm transition-all">시작하기</button>
                    `;
                }
            });
        }

        function switchBilling(type) {
            currentBilling = type;
            const btnSingle = document.getElementById('btn-single');
            const btnSub = document.getElementById('btn-subscription');
            const btnYearly = document.getElementById('btn-yearly');

            [btnSingle, btnSub, btnYearly].forEach(btn => {
                btn.classList.remove('bg-white', 'bg-primary', 'text-white', 'shadow-md', 'shadow-sm');
                btn.classList.add('text-slate-600', 'dark:text-slate-400');
            });

            const selected = document.getElementById('btn-' + type);
            selected.classList.add('bg-primary', 'text-white', 'shadow-md');
            selected.classList.remove('text-slate-600', 'dark:text-slate-400');
            if (type === 'single') selected.classList.add('bg-primary');

            // Handle price values & periods
            const litePrice = document.getElementById('lite-price');
            const proPrice = document.getElementById('pro-price');
            const litePeriod = document.getElementById('lite-period');
            const proPeriod = document.getElementById('pro-period');

            if (type === 'yearly') {
                litePrice.innerText = '49';
                proPrice.innerText = '99';
                litePeriod.innerText = '만원 / 년';
                proPeriod.innerText = '만원 / 년';
            } else if (type === 'subscription') {
                litePrice.innerText = '4.9';
                proPrice.innerText = '9.9';
                litePeriod.innerText = '만원 / 월';
                proPeriod.innerText = '만원 / 월';
            } else {
                litePrice.innerText = '4.9';
                proPrice.innerText = '9.9';
                litePeriod.innerText = '만원 / 건';
                proPeriod.innerText = '만원 / 건';
            }
        }

        // Default UI to single on load
        window.addEventListener('DOMContentLoaded', () => {
            switchBilling('single');
        });

        function goToCheckout(planBase) {
            if (!currentUser) {
                if (confirm('결제를 진행하려면 로그인이 필요합니다. 로그인 페이지로 이동할까요?')) {
                    const currentUrl = encodeURIComponent(window.location.href);
                    location.href = `login.html?redirect=${currentUrl}`;
                }
                return;
            }
            let finalPlan = planBase;
            let recurringParam = currentBilling === 'subscription' ? 'true' : 'false';
            if (currentBilling === 'yearly') finalPlan = planBase + "_YEARLY";
            location.href = `checkout.html?plan=${finalPlan}&recurring=${recurringParam}&category=car`;
        }

        // --- Animations ---
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    </script>
</body>
</html>
"""
        with open(path, 'wb') as f:
            f.write(clean_prefix + clean_script)
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix()
