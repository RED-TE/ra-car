/**
 * Ricar Admin Dashboard - Apple Style
 * 완전 수정 버전 - hwid undefined 에러 해결
 */

const ADMIN_EMAIL = "jhxox666@gmail.com";
let allUsers = [];
let suspiciousUsers = [];

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

        if (user.email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) {
            alert(`접근 권한이 없습니다.\n현재: ${user.email}\n관리자: ${ADMIN_EMAIL}`);
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

        allUsers = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                email: data.email || '알 수 없음',
                hwid: data.hwid || data.id || `UNKNOWN_${doc.id.substring(0, 8)}`, // ✅ 안전한 기본값
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
                lastOrderId: data.lastOrderId || ''
            };
        });

        allUsers.sort((a, b) => {
            const dateA = a.updatedAt ? a.updatedAt.toDate() : (a.createdAt ? a.createdAt.toDate() : 0);
            const dateB = b.updatedAt ? b.updatedAt.toDate() : (b.createdAt ? b.createdAt.toDate() : 0);
            return dateB - dateA;
        });

        analyzeSuspiciousActivity();
        renderAllUsers();
        renderSuspiciousUsers();
        renderFreeUsers();
        updateStats();
        await loadReviews();

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
        const expiry = user.expiryDate.toDate();
        if (expiry < new Date() && user.totalExecutions > 0) {
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
    tbody.innerHTML = "";

    if (allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-20 text-center text-white/30">사용자가 없습니다.</td></tr>`;
        return;
    }

    const now = new Date();

    allUsers.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition-all";

        let statusClass = "badge-free";
        let statusText = "FREE";
        let expiryText = "-";
        let daysLeft = "-";

        if (user.isBanned) {
            statusClass = "badge-expired";
            statusText = "차단됨";
        } else if (user.expiryDate) {
            const expiry = user.expiryDate.toDate();
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

        const isSuspicious = suspiciousUsers.some(s => s.id === user.id);

        // ✅ 안전한 hwid 처리
        const displayHwid = user.hwid && user.hwid.length >= 16
            ? user.hwid.substring(0, 16)
            : (user.hwid || 'HWID없음');

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                        ${user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-medium text-white">${user.email}</div>
                        <div class="text-xs text-white/30 font-mono">${displayHwid}...</div>
                        <div class="text-[10px] text-white/20">${user.platform} • ${user.language}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusClass}">
                    ${statusText}
                </span>
                ${isSuspicious ? '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium badge-suspicious ml-2">의심</span>' : ''}
                ${user.lastOrderId ? `<div class="text-[10px] text-white/20 mt-1">${user.lastOrderId}</div>` : ''}
            </td>
            <td class="px-6 py-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-xl ${user.deviceIds.length >= 3 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'} font-semibold">
                    ${user.deviceIds.length}
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-white">총 ${user.totalExecutions}회</div>
                <div class="text-xs ${user.freeTrialCount >= 2 ? 'text-red-400 font-medium' : 'text-white/30'}">무료 ${user.freeTrialCount}회</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-white">${expiryText}</div>
                <div class="text-xs text-white/30">${daysLeft}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    ${user.executionLogs.length > 0 ? `
                        <button onclick="viewLogs('${user.id}')" 
                                class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/70 border border-white/10 transition-all">
                            로그
                        </button>
                    ` : ''}
                    <button onclick="openEditModal('${user.id}', '${user.email}')" 
                            class="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-xs text-blue-400 border border-blue-500/20 transition-all">
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
        card.className = "bg-white/5 rounded-2xl p-6 border border-orange-500/30";
        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-semibold">
                        ${user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-medium text-white">${user.email}</div>
                        <div class="text-sm text-white/30">${user.plan.toUpperCase()} • ${user.deviceIds.length}대 기기</div>
                    </div>
                </div>
                <span class="badge-suspicious px-3 py-1.5 rounded-full text-xs font-medium">의심</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                    <p class="text-xs text-white/30 mb-1">총 실행</p>
                    <p class="text-lg font-semibold text-white">${user.totalExecutions}회</p>
                </div>
                <div>
                    <p class="text-xs text-white/30 mb-1">무료 실행</p>
                    <p class="text-lg font-semibold text-orange-400">${user.freeTrialCount}회</p>
                </div>
                <div>
                    <p class="text-xs text-white/30 mb-1">기기 수</p>
                    <p class="text-lg font-semibold text-white">${user.deviceIds.length}대</p>
                </div>
                <div>
                    <p class="text-xs text-white/30 mb-1">마지막 실행</p>
                    <p class="text-sm font-medium text-white">${user.lastExecutionLog ? formatDate(user.lastExecutionLog.timestamp.toDate()) : '-'}</p>
                </div>
            </div>
            <div class="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                <p class="text-xs text-orange-400 font-medium mb-1">의심 사유</p>
                <p class="text-sm text-white">${reason}</p>
            </div>
            <div class="flex gap-2 mt-4">
                ${user.executionLogs.length > 0 ? `
                    <button onclick="viewLogs('${user.id}')" 
                            class="flex-1 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white transition-all">
                        실행 로그
                    </button>
                ` : ''}
                <button onclick="openEditModal('${user.id}', '${user.email}')" 
                        class="flex-1 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-sm text-red-400 transition-all">
                    차단 조치
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
            ? formatDate(user.lastExecutionLog.timestamp.toDate())
            : '-';

        // ✅ 안전한 hwid 처리
        const displayHwid = user.hwid && user.hwid.length >= 16
            ? user.hwid.substring(0, 16)
            : (user.hwid || 'HWID없음');

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-medium text-white">${user.email}</div>
                <div class="text-xs text-white/30 font-mono mt-0.5">${displayHwid}...</div>
            </td>
            <td class="px-6 py-4 text-center">
                <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl ${user.freeTrialCount >= 2 ? 'bg-red-500/15 text-red-400 border-2 border-red-500/30' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'} font-semibold text-lg">
                    ${user.freeTrialCount}
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-white">${user.platform}</div>
                <div class="text-xs text-white/30">${user.deviceIds.length}대 기기</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-white">${lastExec}</div>
                ${user.lastExecutionLog && user.lastExecutionLog.lastStep ?
                `<div class="text-xs text-white/30">마지막: ${user.lastExecutionLog.lastStep}</div>` :
                ''}
            </td>
            <td class="px-6 py-4 text-right">
                ${user.executionLogs.length > 0 ? `
                    <button onclick="viewLogs('${user.id}')" 
                            class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/70 border border-white/10 transition-all">
                        로그
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
    const active = allUsers.filter(u =>
        u.plan !== 'free' &&
        u.expiryDate &&
        u.expiryDate.toDate() > now
    ).length;
    const free = allUsers.filter(u => u.plan === 'free' || !u.plan).length;
    const expiredToday = allUsers.filter(u => {
        if (!u.expiryDate) return false;
        const d = u.expiryDate.toDate();
        return d < now && (now - d) < (24 * 60 * 60 * 1000);
    }).length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-free').textContent = free;
    document.getElementById('stat-expired').textContent = expiredToday;
    document.getElementById('stat-suspicious').textContent = suspiciousUsers.length;
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
        tr.className = "hover:bg-white/5 transition-all text-sm";

        const date = review.createdAt ? formatDate(review.createdAt.toDate()) : '-';
        const stars = '★'.repeat(review.rating || 5) + '☆'.repeat(5 - (review.rating || 5));

        // Find real user
        const realUser = allUsers.find(u => u.id === review.uid);
        const realEmail = realUser ? realUser.email : '(탈퇴/알수없음)';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-blue-400 mb-0.5">${realEmail}</div>
                <div class="font-medium text-white/70">${review.authorName || '익명'}</div>
                <div class="text-[10px] text-white/30 font-mono mt-0.5">${date}</div>
            </td>
            <td class="px-6 py-4 text-center">
                <span class="text-yellow-400 tracking-widest text-lg">${stars}</span>
                <div class="text-xs text-white/30 mt-1">${review.rating}점</div>
            </td>
            <td class="px-6 py-4">
                <div class="font-bold text-white mb-1">${escapeHtml(review.title)}</div>
                <div class="text-white/80 leading-relaxed whitespace-pre-wrap">${escapeHtml(review.content)}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="deleteReview('${review.id}')" 
                        class="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs text-red-400 border border-red-500/20 transition-all whitespace-nowrap">
                    삭제
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
        const timestamp = log.timestamp ? formatDate(log.timestamp.toDate()) : '-';
        const statusColor = log.status === 'success' ? 'text-green-400' : 'text-red-400';

        // ✅ 안전한 hwid 처리
        const logHwid = log.hwid && log.hwid.length >= 16
            ? log.hwid.substring(0, 16) + '...'
            : (log.hwid || 'N/A');

        html += `
            <div class="mb-4 pb-4 border-b border-white/10">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-blue-400">[${index + 1}] ${timestamp}</span>
                    <span class="${statusColor}">${log.status || 'Unknown'}</span>
                </div>
                <div class="text-white/70 ml-4 space-y-1">
                    <div>• 단계: ${log.lastStep || 'N/A'}</div>
                    <div>• 기기: ${logHwid}</div>
                    <div>• 소요시간: ${log.duration ? log.duration.toFixed(2) + '초' : 'N/A'}</div>
                    ${log.error ? `<div class="text-red-400">• 에러: ${log.error}</div>` : ''}
                </div>
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

    const tempAllUsers = allUsers;
    allUsers = filtered;
    renderAllUsers();
    allUsers = tempAllUsers;
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
        await loadAllData();
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
