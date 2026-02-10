/**
 * Admin Dashboard Logic for Ricar Auto Plan (Obfuscated) - KOREAN VERSION
 */

const ADMIN_EMAIL = "jhxox666@gmail.com"; // 🛡️ 주 관리자 이메일
let allUsers = [];

// Firebase 인증 리스너 초기화
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(async (user) => {
        console.log("인증 상태 변경됨. 사용자:", user ? user.email : "로그인 안 됨");

        if (!user) {
            alert("관리자 로그인이 필요합니다.");
            const currentPath = window.location.pathname.split('/').pop() || 'ricar_mgr_7468_gate.html';
            const redirectPath = currentPath.endsWith('.html') ? currentPath : currentPath + '.html';
            window.location.href = `login.html?redirect=${redirectPath}`;
            return;
        }

        // 🛡️ 보안 관리자 권한 확인
        if (user.email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) {
            alert(`접근 권한이 없습니다.\n현재 계정: ${user.email}\n관리자 계정: ${ADMIN_EMAIL}`);
            window.location.href = 'index.html';
            return;
        }

        console.log("✅ 관리자 권한 승인됨!");
        document.getElementById('admin-email').textContent = user.email;
        loadAllUsers();
    });
}

/**
 * Firestore에서 모든 사용자 데이터 로드
 */
async function loadAllUsers() {
    console.log("모든 사용자 데이터를 불러오는 중...");
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-20 text-center text-slate-500">데이터를 불러오는 중...</td></tr>`;

    try {
        // 🛡️ 중요: .orderBy() 사용 시 해당 필드가 없는 문서는 누락됨 (무료 사용자 등)
        // 따라서 모든 사용자를 가져온 후 자바스크립트에서 정렬함
        const snapshot = await db.collection("users").get();
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 최신순으로 정렬 (updatedAt 또는 createdAt 기준)
        allUsers.sort((a, b) => {
            const dateA = a.updatedAt ? a.updatedAt.toDate() : (a.createdAt ? a.createdAt.toDate() : 0);
            const dateB = b.updatedAt ? b.updatedAt.toDate() : (b.createdAt ? b.createdAt.toDate() : 0);
            return dateB - dateA;
        });

        renderUsers(allUsers);
        updateStats(allUsers);
    } catch (error) {
        console.error("데이터 로드 오류:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-20 text-center text-red-500">데이터를 불러오지 못했습니다. <br>Firebase 규칙 또는 인덱스를 확인해 주세요.</td></tr>`;
    }
}

/**
 * 테이블에 사용자 목록 렌더링
 */
function renderUsers(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = "";

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-20 text-center text-slate-500">조건에 맞는 사용자가 없습니다.</td></tr>`;
        return;
    }

    const now = new Date();

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/20 transition-colors";

        // 만료 계산
        let expiryDate = null;
        let diffDays = "-";
        let statusClass = "status-free";
        let statusText = "무료 사용자";

        if (user.isBanned) {
            statusClass = "status-banned";
            statusText = "차단됨 (BANNED)";
        } else if (user.expiryDate) {
            expiryDate = user.expiryDate.toDate();
            const diffTime = expiryDate - now;
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (user.plan && user.plan !== 'free') {
                if (diffTime > 0) {
                    statusClass = "status-active";
                    statusText = `이용 중 (${user.plan.toUpperCase()})`;
                } else {
                    statusClass = "status-expired";
                    statusText = `만료됨 (${user.plan.toUpperCase()})`;
                }
            }
        }

        const formattedExpiry = expiryDate ? Utils.formatDate(expiryDate.toISOString()) : "없음";
        const usageCount = user.totalExecutions || 0;
        const freeCount = user.freeTrialCount || 0;
        const deviceCount = user.deviceIds ? user.deviceIds.length : 0;

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="text-white font-bold text-sm">${user.email || '알 수 없음'}</div>
                <div class="text-[10px] text-slate-500 font-mono mt-0.5">${user.hwid || user.id || 'HWID 없음'}</div>
                <div class="text-[9px] text-blue-500/70 mt-0.5">${user.platform || 'OS: -'} / ${user.language || 'LG: -'}</div>
            </td>
            <td class="px-6 py-4">
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="text-[10px] text-slate-500 mt-1">${user.lastOrderId || ''}</div>
            </td>
            <td class="px-6 py-4 text-center">
                <div class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20">
                    ${deviceCount}
                </div>
            </td>
            <td class="px-6 py-4 text-sm">
                <div class="text-slate-200">총 실행: <span class="font-bold text-blue-400">${usageCount}회</span></div>
                <div class="text-[10px] text-slate-500">무료 체험: <span class="text-green-500/80">${freeCount}회</span></div>
            </td>
            <td class="px-6 py-4 text-sm">
                <div class="${diffDays < 3 && diffDays >= 0 ? 'text-yellow-400 font-bold' : 'text-slate-300'}">${formattedExpiry}</div>
                <div class="text-[10px] text-slate-500">${diffDays > 0 ? diffDays + '일 남음' : (diffDays < 0 ? '만료됨' : '-')}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="openEditModal('${user.id}', '${user.email}')" 
                        class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-all">
                    관리하기
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * 상단 통계 업데이트
 */
function updateStats(users) {
    const now = new Date();
    const total = users.length;
    const active = users.filter(u => u.plan && u.plan !== 'free' && u.expiryDate && u.expiryDate.toDate() > now).length;
    const trial = users.filter(u => (u.freeTrialCount || 0) > 0).length;

    // 오늘 만료 예정/완료 계산 (24시간 내)
    const expiredToday = users.filter(u => {
        if (!u.expiryDate) return false;
        const d = u.expiryDate.toDate();
        return d < now && (now - d) < (24 * 60 * 60 * 1000);
    }).length;

    document.getElementById('stat-total-users').innerText = total;
    document.getElementById('stat-active-plans').innerText = active;
    document.getElementById('stat-free-trial').innerText = trial;
    document.getElementById('stat-expired-today').innerText = expiredToday;
}

/**
 * 검색 및 필터 핸들러
 */
function handleFilter() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const planFilter = document.getElementById('filterPlan').value;

    const filtered = allUsers.filter(user => {
        const matchesTerm = (user.email && user.email.toLowerCase().includes(term)) ||
            (user.hwid && user.hwid.toLowerCase().includes(term));
        const matchesPlan = planFilter === 'all' ||
            (planFilter === 'free' ? (!user.plan || user.plan === 'free') : user.plan === planFilter);
        return matchesTerm && matchesPlan;
    });

    renderUsers(filtered);
}

document.getElementById('searchInput').addEventListener('input', handleFilter);
document.getElementById('filterPlan').addEventListener('change', handleFilter);
document.getElementById('refreshBtn').addEventListener('click', loadAllUsers);
document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

/**
 * 모달 관리
 */
let currentTargetId = null;

window.openEditModal = function (id, email) {
    currentTargetId = id;
    const user = allUsers.find(u => u.id === id);
    document.getElementById('modalUserEmail').innerText = email;
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
    saveBtn.innerText = "저장 중...";

    try {
        const userRef = db.collection("users").doc(currentTargetId);
        const updateData = {
            plan: plan,
            isBanned: isBanned,
            updatedAt: firebase.firestore.Timestamp.now()
        };

        if (extendDays > 0) {
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + extendDays);
            updateData.expiryDate = firebase.firestore.Timestamp.fromDate(expDate);
            updateData.planName = plan.toUpperCase() + " PLAN";
        } else if (plan === 'free') {
            updateData.planName = "FREE";
        }

        await userRef.update(updateData);
        alert("성공적으로 반영되었습니다.");
        document.getElementById('editModal').classList.add('hidden');
        loadAllUsers(); // 데이터 새로고침
    } catch (error) {
        console.error("수정 실패:", error);
        alert("수정에 실패했습니다: " + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "설정 적용하기";
    }
});
