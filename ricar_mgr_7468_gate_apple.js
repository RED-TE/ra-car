/**
 * Ricar Admin Dashboard - Apple Style
 * 완전 수정 버전 - hwid undefined 에러 해결
 */

const ADMIN_EMAIL = "jhxox666@gmail.com";
const TEST_ADMIN_EMAILS = ["jhxox666@test.com", "sungho4768@gmail.com"];

let allUsers = [];
let suspiciousUsers = [];
let freeUsers = [];
let allInquiries = [];
let stats = {
    total: 0,
    active: 0,
    trial: 0,
    expiredToday: 0
};

// ... [rest of the variables if any]

/**
 * 안전한 날짜 변환 헬퍼
 */
function safeToDate(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/**
 * 날짜 포맷팅 (YYYY.MM.DD)
 */
function formatDate(date) {
    if (!date) return '-';
    const d = safeToDate(date);
    if (!d) return '-';
    return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\. /g, '.').replace(/\.$/, '');
}

// 인증 체크
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(async (user) => {
        console.log("인증 상태 변경:", user ? user.email : "로그인 안 됨");

        if (!user) {
            alert("관리자 로그인이 필요합니다.");
            const currentPath = window.location.pathname.split('/').pop() || 'ricar_mgr_7468_gate_apple.html';
            window.location.href = `login.html?redirect=${currentPath}`;
            return;
        }

        const userEmail = user.email.toLowerCase().trim();
        const isAuthorized = userEmail === ADMIN_EMAIL.toLowerCase().trim() ||
            TEST_ADMIN_EMAILS.some(e => e.toLowerCase().trim() === userEmail);

        if (!isAuthorized) {
            console.error("❌ 권한 없는 사용자 접근:", userEmail);
            alert(`접근 권한이 없습니다.\n현재 계정: ${user.email}\n허용된 관리자 목록을 확인해주세요.`);
            window.location.href = 'index.html';
            return;
        }

        console.log("✅ 관리자 권한 승인");
        document.getElementById('admin-email').textContent = user.email;
        await loadAllData();
    });
}


/**
 * 모든 데이터 로드
 */
async function loadAllData() {
    console.log("📊 모든 사용자 데이터 로드 시작");
    try {
        const snapshot = await db.collection("users").get();
        if (snapshot.empty) {
            console.warn("⚠️ 'users' 컬렉션이 비어있습니다.");
        }

        allUsers = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                email: data.email || '알 수 없음',
                hwid: data.hwid || data.id || `UNKNOWN_${doc.id.substring(0, 8)}`,
                plan: data.plan || 'free',
                planName: data.planName || 'FREE',
                expiryDate: data.expiryDate,
                isBanned: data.isBanned || false,
                totalExecutions: data.totalExecutions || 0,
                freeTrialCount: data.freeTrialCount || 0,
                deviceIds: data.deviceIds || [],
                platform: data.platform || '-',
                language: data.language || '-',
                executionLogs: data.executionLogs || [],
                lastExecutionLog: data.lastExecutionLog || null,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                lastOrderId: data.lastOrderId || '',
                isSubscriptionActive: data.isSubscriptionActive || false,
                memo: data.memo || ''
            };
        });

        allUsers.sort((a, b) => {
            const dateA = safeToDate(a.updatedAt) || safeToDate(a.createdAt) || 0;
            const dateB = safeToDate(b.updatedAt) || safeToDate(b.createdAt) || 0;
            return dateB - dateA;
        });

        try { analyzeSuspiciousActivity(); } catch (e) { console.error(e); }
        renderAllUsers();
        try { renderSuspiciousUsers(); } catch (e) { console.error(e); }
        try { renderFreeUsers(); } catch (e) { console.error(e); }
        try { updateStats(); } catch (e) { console.error(e); }
        try { await loadReviews(); } catch (e) { console.error(e); }
        try { await loadInquiries(); } catch (e) { console.error(e); }

        console.log(`✅ 총 ${allUsers.length}명 로드 완료`);
    } catch (error) {
        console.error("❌ 데이터 로드 실패:", error);
        alert("데이터를 불러오지 못했습니다: " + error.message);
    }
}

/**
 * 이상 사용 의심 분석
 */
function analyzeSuspiciousActivity() {
    suspiciousUsers = allUsers.filter(user => {
        if ((user.plan === 'free' || !user.plan) && user.freeTrialCount >= 2) {
            return true;
        }
        if (user.deviceIds.length >= 3) {
            return true;
        }
        if (user.totalExecutions >= 10) {
            return true;
        }
        if (user.plan !== 'free' && user.expiryDate) {
            const expiry = user.expiryDate.toDate();
            if (expiry < new Date() && user.totalExecutions > 0) {
                return true;
            }
        }
        return false;
    });

    suspiciousUsers.forEach(async (user) => {
        try {
            await db.collection("users").doc(user.id).update({
                suspiciousActivity: true,
                suspiciousReason: getSuspiciousReason(user)
            });
        } catch (error) {
            console.error("의심 플래그 업데이트 실패:", user.id, error);
        }
    });

    console.log(`🚨 이상 사용 의심: ${suspiciousUsers.length}명`);
}

function getSuspiciousReason(user) {
    const reasons = [];
    if ((user.plan === 'free' || !user.plan) && user.freeTrialCount >= 2) {
        reasons.push(`무료 ${user.freeTrialCount}회 실행`);
    }
    if (user.deviceIds.length >= 3) {
        reasons.push(`${user.deviceIds.length}대 기기`);
    }
    if (user.totalExecutions >= 10) {
        reasons.push(`총 ${user.totalExecutions}회 실행`);
    }
    if (user.plan !== 'free' && user.expiryDate) {
        const expiry = safeToDate(user.expiryDate);
        if (expiry && expiry < new Date() && user.totalExecutions > 0) {
            reasons.push("만료 후 실행");
        }
    }
    return reasons.join(', ');
}

/**
 * 전체 사용자 렌더링
 */
function renderAllUsers() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-20 text-center text-white/30">사용자가 없습니다.</td></tr>`;
        return;
    }

    const now = new Date();

    allUsers.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition-all outline-none border-b border-slate-100 dark:border-white/5";

        let statusClass = "badge-free";
        let statusText = "FREE";
        let expiryText = "-";
        let daysLeft = "-";

        if (user.isBanned) {
            statusClass = "badge-expired";
            statusText = "차단됨";
        } else if (user.expiryDate) {
            const expiry = safeToDate(user.expiryDate);
            if (expiry) {
                const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

                if (user.plan !== 'free') {
                    if (diff > 0) {
                        statusClass = "badge-active";
                        statusText = user.plan.toUpperCase();
                        daysLeft = `${diff}일 남음`;
                    } else {
                        statusClass = "badge-expired";
                        statusText = "만료됨";
                        daysLeft = "만료됨";
                    }
                }
                expiryText = formatDate(expiry);
            }
        }

        const isSuspicious = suspiciousUsers.some(s => s.id === user.id);

        // ✅ 안전한 hwid 처리
        const displayHwid = user.hwid && user.hwid.length >= 16
            ? user.hwid.substring(0, 16) + "..."
            : (user.hwid || 'HWID없음');

        tr.innerHTML = `
            <td class="px-6 py-5">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-500 text-sm">
                        ${user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-black text-slate-800 dark:text-white text-sm">${user.email}</div>
                        <div class="text-[10px] font-bold text-slate-400 font-mono tracking-tighter mt-1">${displayHwid} • ${user.platform}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="flex items-center gap-2">
                    <span class="badge ${statusClass} px-3 py-1 text-[10px] uppercase font-black tracking-widest">${statusText}</span>
                    ${user.isSubscriptionActive ? '<span class="badge badge-recurring px-2 py-1 text-[9px] font-black">정기구독</span>' : '<span class="badge bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-1 text-[9px] font-black">단건결제</span>'}
                    ${isSuspicious ? '<span class="badge badge-suspicious px-2 py-1 text-[9px] font-black">의심</span>' : ''}
                </div>
                ${user.memo ? `
                    <div class="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-lg">
                        <div class="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-[10px] font-black mb-0.5">
                            <span class="material-symbols-outlined text-xs">receipt_long</span>
                            사업자 증빙 정보
                        </div>
                        <div class="text-[10px] text-blue-800 dark:text-blue-300 font-bold leading-tight break-all">${user.memo}</div>
                    </div>
                ` : ''}
            </td>
            <td class="px-6 py-5 text-center">
                <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-black text-xs border border-slate-100 dark:border-slate-700">
                    ${user.deviceIds ? user.deviceIds.length : 0}
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="flex flex-col">
                    <div class="text-xs font-black text-slate-800 dark:text-white">총 ${user.totalExecutions}회</div>
                    <div class="text-[10px] font-bold ${user.freeTrialCount >= 2 ? 'text-red-500' : 'text-slate-400'} opacity-80 mt-1 uppercase">무료 ${user.freeTrialCount}회</div>
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="text-xs font-black text-slate-800 dark:text-white">${expiryText}</div>
                <div class="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">${daysLeft}</div>
            </td>
            <td class="px-6 py-5 text-right">
                <div class="flex items-center justify-end gap-2">
                    ${user.executionLogs && user.executionLogs.length > 0 ? `
                        <button onclick="viewLogs('${user.id}')"
                                class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all">
                            <span class="material-symbols-outlined text-lg">terminal</span>
                        </button>
                    ` : ''}
                    <button onclick="openEditModal('${user.id}', '${user.email}')"
                            class="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-[11px] hover:opacity-90 transition-all shadow-sm">
                        관리
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * 이상 사용 의심 렌더링
 */
function renderSuspiciousUsers() {
    const container = document.getElementById('suspiciousTableBody');
    container.innerHTML = "";

    if (suspiciousUsers.length === 0) {
        container.innerHTML = `<p class="text-center text-white/30 py-12">이상 사용 의심 사용자가 없습니다.</p>`;
        return;
    }

    suspiciousUsers.forEach(user => {
        const reason = getSuspiciousReason(user);

        const card = document.createElement('div');
        card.className = "glass rounded-2xl p-6 border-2 border-orange-500/20 bg-orange-500/5 reveal active";
        card.innerHTML = `
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-orange-500/20">
                        ${user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="text-lg font-black text-slate-800 dark:text-white leading-tight">${user.email}</div>
                        <div class="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mt-1">${user.plan.toUpperCase()} • ${user.deviceIds.length}대 기기 사용 중</div>
                    </div>
                </div>
                <span class="badge badge-suspicious px-4 py-2 text-[10px]">의심스러운 활동 감지</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                <div class="bg-white/40 dark:bg-black/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 실행 횟수</p>
                    <p class="text-xl font-black text-slate-900 dark:text-white">${user.totalExecutions}회</p>
                </div>
                <div class="bg-white/40 dark:bg-black/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">무료 실행권</p>
                    <p class="text-xl font-black text-orange-600 dark:text-orange-400">${user.freeTrialCount}회 사용</p>
                </div>
                <div class="bg-white/40 dark:bg-black/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">연동 기기수</p>
                    <p class="text-xl font-black text-slate-900 dark:text-white">${user.deviceIds.length}대</p>
                </div>
                <div class="bg-white/40 dark:bg-black/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">최근 실행일</p>
                    <p class="text-sm font-black text-slate-800 dark:text-white mt-1">${user.lastExecutionLog ? formatDate(safeToDate(user.lastExecutionLog.timestamp)) : '-'}</p>
                </div>
            </div>
            <div class="bg-white/60 dark:bg-black/40 rounded-2xl p-5 border border-orange-500/20 mb-6">
                <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-orange-500 text-sm font-variation-settings-'FILL' 1">report_problem</span>
                    <p class="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">탐지된 사유</p>
                </div>
                <p class="text-sm font-black text-slate-800 dark:text-slate-200">${reason}</p>
            </div>
            <div class="flex gap-3">
                ${user.executionLogs.length > 0 ? `
                    <button onclick="viewLogs('${user.id}')"
                            class="flex-1 px-4 py-4 rounded-2xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-sm hover:bg-slate-50 transition-all border border-slate-200 dark:border-slate-700">
                        자세한 실행 로그 보기
                    </button>
                ` : ''}
                <button onclick="openEditModal('${user.id}', '${user.email}')"
                        class="flex-1 px-4 py-4 rounded-2xl bg-red-600 text-white font-black text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-500/20">
                    즉시 차단 및 조치하기
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

/**
 * 무료 이용자 렌더링
 */
function renderFreeUsers() {
    const tbody = document.getElementById('freeTableBody');
    tbody.innerHTML = "";

    const freeUsers = allUsers.filter(u => u.plan === 'free' || !u.plan);

    if (freeUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-20 text-center text-white/30">무료 이용자가 없습니다.</td></tr>`;
        return;
    }

    freeUsers.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition-all";

        const lastExec = user.lastExecutionLog
            ? formatDate(safeToDate(user.lastExecutionLog.timestamp))
            : '-';

        // ✅ 안전한 hwid 처리
        const displayHwid = user.hwid && user.hwid.length >= 16
            ? user.hwid.substring(0, 16)
            : (user.hwid || 'HWID없음');

        tr.innerHTML = `
            <td class="px-6 py-5">
                <div class="font-black text-slate-800 dark:text-white text-sm">${user.email}</div>
                <div class="text-[10px] font-bold text-slate-400 font-mono tracking-tighter mt-1">${displayHwid}</div>
            </td>
            <td class="px-6 py-5 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-xl ${user.freeTrialCount >= 2 ? 'bg-red-500/10 text-red-500 border-2 border-red-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'} font-black text-lg">
                    ${user.freeTrialCount}
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="text-xs font-black text-slate-800 dark:text-white">${user.platform}</div>
                <div class="text-[10px] font-bold text-slate-400 mt-0.5">${user.deviceIds.length}대 기기 사용</div>
            </td>
            <td class="px-6 py-5">
                <div class="text-xs font-black text-slate-800 dark:text-white">${lastExec}</div>
                ${user.lastExecutionLog && user.lastExecutionLog.lastStep ?
                `<div class="text-[10px] font-bold text-primary opacity-70 mt-0.5">${user.lastExecutionLog.lastStep}</div>` :
                ''}
            </td>
            <td class="px-6 py-5 text-right">
                ${user.executionLogs.length > 0 ? `
                    <button onclick="viewLogs('${user.id}')"
                            class="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all">
                        <span class="material-symbols-outlined">terminal</span>
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * 통계 업데이트
 */
function updateStats() {
    const now = new Date();

    const total = allUsers.length;
    const active = allUsers.filter(u => {
        const exp = safeToDate(u.expiryDate);
        return u.plan !== 'free' && exp && exp > now;
    }).length;
    const free = allUsers.filter(u => u.plan === 'free' || !u.plan).length;
    const expiredToday = allUsers.filter(u => {
        const d = safeToDate(u.expiryDate);
        if (!d) return false;
        const nowTime = now.getTime();
        const dTime = d.getTime();
        return dTime < nowTime && (nowTime - dTime) < (24 * 60 * 60 * 1000);
    }).length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-free').textContent = free;
    document.getElementById('stat-expired').textContent = expiredToday;
    document.getElementById('stat-suspicious').textContent = suspiciousUsers.length;
}

// Inquiries Logic
async function loadInquiries() {
    console.log("📝 문의 데이터 로드 시작");
    try {
        const snapshot = await db.collection("inquiries").orderBy("timestamp", "desc").get();
        allInquiries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInquiries();
        console.log(`✅ 문의 ${allInquiries.length}개 로드 완료`);
    } catch (error) {
        console.error("❌ 문의 로드 실패:", error);
    }
}

function renderInquiries() {
    const tbody = document.getElementById('inquiriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (allInquiries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-20 text-center text-white/30">접수된 문의가 없습니다.</td></tr>`;
        return;
    }

    allInquiries.forEach(inquiry => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-sm group";

        const date = inquiry.timestamp ? formatDate(safeToDate(inquiry.timestamp)) : '-';

        // Set up formatted phone
        let phoneStr = inquiry.phone || '-';
        if (phoneStr.length === 11) {
            phoneStr = phoneStr.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        }

        tr.innerHTML = `
            <td class="px-6 py-4">
                <span class="text-[10px] font-bold text-slate-400 font-mono tracking-tighter">${date}</span>
            </td>
            <td class="px-6 py-4 text-center">
                <div class="font-black text-slate-800 dark:text-white">${inquiry.name || '알 수 없음'}</div>
                <div class="text-[11px] text-blue-500 font-mono font-bold mt-1">${phoneStr}</div>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2 mb-1">
                    <span class="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-black">${inquiry.brand || '-'}</span>
                    <span class="font-black text-slate-800 dark:text-white">${inquiry.carModel || '-'}</span>
                </div>
                <div class="text-[10px] font-bold text-slate-400 truncate max-w-[200px]">
                    ${inquiry.serviceType ? ('유형: ' + inquiry.serviceType) : '유형: 미상'}
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-bold">
                    <div class="text-slate-500 text-right pr-1">기간:</div>
                    <div class="text-slate-900 dark:text-white">${inquiry.period || '-'}</div>
                    
                    <div class="text-slate-500 text-right pr-1">주행:</div>
                    <div class="text-slate-900 dark:text-white">${inquiry.mileage || '-'}</div>
                    
                    <div class="text-slate-500 text-right pr-1">초기:</div>
                    <div class="text-slate-900 dark:text-white">${inquiry.deposit || '-'}</div>
                    
                    <div class="text-slate-500 text-right pr-1">예산:</div>
                    <div class="text-slate-900 dark:text-white">${inquiry.budget || '-'}</div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Reviews Logic
let allReviews = [];

async function loadReviews() {
    console.log("📝 후기 데이터 로드 시작");
    try {
        const snapshot = await db.collection("reviews").orderBy("createdAt", "desc").get();
        allReviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderReviews();
        console.log(`✅ 후기 ${allReviews.length}개 로드 완료`);
    } catch (error) {
        console.error("❌ 후기 로드 실패:", error);
    }
}

function renderReviews() {
    const tbody = document.getElementById('reviewsTableBody');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (allReviews.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-20 text-center text-white/30">작성된 후기가 없습니다.</td></tr>`;
        return;
    }

    allReviews.forEach(review => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-sm group";

        const date = review.createdAt ? formatDate(safeToDate(review.createdAt)) : '-';
        const stars = '★'.repeat(review.rating || 5) + '☆'.repeat(5 - (review.rating || 5));

        // Find real user
        const realUser = allUsers.find(u => u.id === review.uid);
        const realEmail = realUser ? realUser.email : '(탈퇴/알수없음)';

        tr.innerHTML = `
            <td class="px-6 py-6">
                <div class="font-black text-primary dark:text-white mb-1 group-hover:text-blue-600 transition-colors">${realEmail}</div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-500 tracking-tight">${review.authorName || '익명'}</span>
                    <span class="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span class="text-[10px] font-bold text-slate-400 font-mono tracking-tighter">${date}</span>
                </div>
            </td>
            <td class="px-6 py-6 text-center">
                <div class="flex flex-col items-center">
                    <span class="text-yellow-400 font-black tracking-widest text-lg leading-none mb-2">${stars}</span>
                    <span class="badge bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-500">${review.rating}점</span>
                </div>
            </td>
            <td class="px-6 py-6">
                <div class="font-black text-slate-800 dark:text-white mb-2 text-base tracking-tight">${escapeHtml(review.title)}</div>
                <div class="text-slate-600 dark:text-slate-400 leading-relaxed text-sm font-medium line-clamp-2 hover:line-clamp-none transition-all cursor-pointer">${escapeHtml(review.content)}</div>
            </td>
            <td class="px-6 py-6 text-right">
                <button onclick="deleteReview('${review.id}')"
                        class="px-4 py-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-500 text-xs font-black hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100">
                    리뷰 삭제
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteReview = async function (id) {
    if (!confirm("정말로 이 후기를 삭제하시겠습니까? (복구 불가)")) return;

    try {
        await db.collection("reviews").doc(id).delete();
        alert("후기가 삭제되었습니다.");
        loadReviews(); // Reload
    } catch (e) {
        console.error(e);
        alert("삭제 실패: " + e.message);
    }
};

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 로그 뷰어
 */
window.viewLogs = async function (userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('logModal').classList.remove('hidden');

    const logContent = document.getElementById('logContent');

    if (!user.executionLogs || user.executionLogs.length === 0) {
        logContent.innerHTML = '<p class="text-white/30">실행 로그가 없습니다.</p>';
        return;
    }

    let html = '';
    user.executionLogs.slice(-20).reverse().forEach((log, index) => {
        const timestamp = log.timestamp ? formatDate(safeToDate(log.timestamp)) : '-';
        const statusColor = log.status === 'success' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400';
        const statusBg = log.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10';

        // ✅ 안전한 hwid 처리
        const logHwid = log.hwid && log.hwid.length >= 16
            ? log.hwid.substring(0, 16) + '...'
            : (log.hwid || 'N/A');

        html += `
            <div class="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-400">${index + 1}</span>
                        <span class="text-xs font-black text-slate-800 dark:text-white">${timestamp}</span>
                    </div>
                    <span class="badge ${statusBg} ${statusColor}">${log.status ? log.status.toUpperCase() : 'UNKNOWN'}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">진행 단계</p>
                        <p class="text-xs font-black text-primary dark:text-white">${log.lastStep || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">기기 ID</p>
                        <p class="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono">${logHwid}</p>
                    </div>
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">소요 시간</p>
                        <p class="text-xs font-black text-slate-800 dark:text-white">${log.duration ? log.duration.toFixed(2) + '초' : 'N/A'}</p>
                    </div>
                </div>
                ${log.error ? `
                <div class="mt-3 p-3 bg-red-50 dark:bg-red-500/5 rounded-lg border border-red-100 dark:border-red-500/10">
                    <p class="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">에러 발생</p>
                    <p class="text-xs font-bold text-red-600 dark:text-red-400">${log.error}</p>
                </div>` : ''}
            </div>
        `;
    });

    logContent.innerHTML = html;
};

document.getElementById('logModalClose').addEventListener('click', () => {
    document.getElementById('logModal').classList.add('hidden');
});

/**
 * 탭 전환
 */
document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));

        const tabName = btn.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    });
});

/**
 * 검색 및 필터
 */
function handleFilter() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const planFilter = document.getElementById('filterPlan').value;

    const filtered = allUsers.filter(user => {
        const matchesTerm = user.email.toLowerCase().includes(term) ||
            (user.hwid && user.hwid.toLowerCase().includes(term));
        const matchesPlan = planFilter === 'all' ||
            (planFilter === 'free' ? (!user.plan || user.plan === 'free') : user.plan === planFilter);
        return matchesTerm && matchesPlan;
    });

    renderFilteredUsers(filtered);
}

function renderFilteredUsers(users) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-20 text-center text-white/30">조건에 맞는 사용자가 없습니다.</td></tr>`;
        return;
    }

    const now = new Date();

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition-all outline-none border-b border-slate-100 dark:border-white/5";

        let statusClass = "badge-free";
        let statusText = "FREE";
        let expiryText = "-";
        let daysLeft = "-";

        if (user.isBanned) {
            statusClass = "badge-expired";
            statusText = "차단됨";
        } else if (user.expiryDate) {
            const expiry = safeToDate(user.expiryDate);
            if (expiry) {
                const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

                if (user.plan !== 'free') {
                    if (diff > 0) {
                        statusClass = "badge-active";
                        statusText = user.plan.toUpperCase();
                        daysLeft = `${diff}일 남음`;
                    } else {
                        statusClass = "badge-expired";
                        statusText = "만료됨";
                        daysLeft = "만료됨";
                    }
                }
                expiryText = formatDate(expiry);
            }
        }

        const isSuspicious = suspiciousUsers.some(s => s.id === user.id);

        const displayHwid = user.hwid && user.hwid.length >= 16
            ? user.hwid.substring(0, 16) + "..."
            : (user.hwid || 'HWID없음');

        tr.innerHTML = `
            <td class="px-6 py-5">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-500 text-sm">
                        ${user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-black text-slate-800 dark:text-white text-sm">${user.email}</div>
                        <div class="text-[10px] font-bold text-slate-400 font-mono tracking-tighter mt-1">${displayHwid} • ${user.platform}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="flex items-center gap-2">
                    <span class="badge ${statusClass} px-3 py-1 text-[10px] uppercase font-black tracking-widest">${statusText}</span>
                    ${user.isSubscriptionActive ? '<span class="badge badge-recurring px-2 py-1 text-[9px] font-black">정기구독</span>' : '<span class="badge bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-1 text-[9px] font-black">단건결제</span>'}
                    ${isSuspicious ? '<span class="badge badge-suspicious px-2 py-1 text-[9px] font-black">의심</span>' : ''}
                </div>
            </td>
            <td class="px-6 py-5 text-center">
                <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-black text-xs border border-slate-100 dark:border-slate-700">
                    ${user.deviceIds ? user.deviceIds.length : 0}
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="flex flex-col">
                    <div class="text-xs font-black text-slate-800 dark:text-white">총 ${user.totalExecutions}회</div>
                    <div class="text-[10px] font-bold ${user.freeTrialCount >= 2 ? 'text-red-500' : 'text-slate-400'} opacity-80 mt-1 uppercase">무료 ${user.freeTrialCount}회</div>
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="text-xs font-black text-slate-800 dark:text-white">${expiryText}</div>
                <div class="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">${daysLeft}</div>
            </td>
            <td class="px-6 py-5 text-right">
                <div class="flex items-center justify-end gap-2">
                    ${user.executionLogs && user.executionLogs.length > 0 ? `
                        <button onclick="viewLogs('${user.id}')"
                                class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all">
                            <span class="material-symbols-outlined text-lg">terminal</span>
                        </button>
                    ` : ''}
                    <button onclick="openEditModal('${user.id}', '${user.email}')"
                            class="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-[11px] hover:opacity-90 transition-all shadow-sm">
                        관리
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('searchInput').addEventListener('input', handleFilter);
document.getElementById('filterPlan').addEventListener('change', handleFilter);
document.getElementById('refreshBtn').addEventListener('click', loadAllData);
document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

/**
 * 편집 모달
 */
let currentTargetId = null;

window.openEditModal = function (id, email) {
    currentTargetId = id;
    const user = allUsers.find(u => u.id === id);
    document.getElementById('modalUserEmail').textContent = email;
    document.getElementById('modalPlanSelect').value = user.plan || 'free';
    document.getElementById('modalBanCheck').checked = user.isBanned || false;

    // 🚀 구독 상태 표시
    const subStatus = document.getElementById('modalSubscriptionStatus');
    if (user.isSubscriptionActive) {
        subStatus.innerHTML = `<span class="badge badge-recurring px-3 py-1 text-xs">정기구독 활성</span>`;
        subStatus.classList.remove('hidden');
    } else if (user.plan !== 'free') {
        subStatus.innerHTML = `<span class="badge bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-3 py-1 text-xs">단건결제 (${user.planName})</span>`;
    } else {
        subStatus.innerHTML = `<span class="badge badge-free px-3 py-1 text-xs">무료 이용</span>`;
    }

    document.getElementById('editModal').classList.remove('hidden');
};

document.getElementById('modalCloseBtn').addEventListener('click', () => {
    document.getElementById('editModal').classList.add('hidden');
});

document.getElementById('modalSaveBtn').addEventListener('click', async () => {
    if (!currentTargetId) return;

    const plan = document.getElementById('modalPlanSelect').value;
    const extendDays = parseInt(document.getElementById('modalExtendSelect').value);
    const isBanned = document.getElementById('modalBanCheck').checked;

    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";

    try {
        const updateData = {
            plan: plan,
            isBanned: isBanned,
            updatedAt: firebase.firestore.Timestamp.now()
        };

        // Plan Name Mapping
        if (plan === 'free') {
            updateData.planName = "FREE";
        } else {
            updateData.planName = plan.toUpperCase() + " PLAN";
        }

        // Expiry Date Logic
        if (extendDays > 0) {
            // If explicit extension is selected
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + extendDays);
            updateData.expiryDate = firebase.firestore.Timestamp.fromDate(expDate);
        } else if (plan !== 'free') {
            // If it's a paid plan but no extension was selected
            const user = allUsers.find(u => u.id === currentTargetId);
            const now = new Date();
            let currentExpiry = user.expiryDate ? user.expiryDate.toDate() : null;

            // If no current expiry OR already expired, default to +30 days
            if (!currentExpiry || currentExpiry < now) {
                const defaultExp = new Date();
                defaultExp.setDate(defaultExp.getDate() + 30);
                updateData.expiryDate = firebase.firestore.Timestamp.fromDate(defaultExp);
                console.log("Setting default 30-day expiry for new/expired paid plan.");
            }
        }

        await db.collection("users").doc(currentTargetId).update(updateData);
        alert("✅ 성공적으로 저장되었습니다.");
        document.getElementById('editModal').classList.add('hidden');
        try {
            await analyzeSuspiciousActivity();
            renderAllUsers();
            renderSuspiciousUsers();
            renderFreeUsers();
            updateStats();
            await loadReviews();
            await loadInquiries();
        } catch (e) {
            console.error("Rendering flow error:", e);
        }
    } catch (error) {
        console.error("수정 실패:", error);
        alert("❌ 저장 실패: " + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "저장";
    }
});

/**
 * 날짜 포맷
 */
function formatDate(date) {
    if (!date) return '-';
    if (typeof date === 'string') date = new Date(date);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}
