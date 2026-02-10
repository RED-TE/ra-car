/**
 * Admin Dashboard Logic for Ricar Auto Plan (Obfuscated)
 */

const ADMIN_EMAIL = "jhxox666@naver.com"; // 🛡️ Primary Admin Email
let allUsers = [];

// Initialize Firebase Auth Listener
if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            alert("로그인이 필요합니다.");
            const currentPath = window.location.pathname.split('/').pop();
            window.location.href = `/login?redirect=${currentPath}`;
            return;
        }

        // 🛡️ Security Check: Verify Admin Status
        if (user.email !== ADMIN_EMAIL) {
            alert("접근 권한이 없습니다. (관리자 전용)");
            window.location.href = '/';
            return;
        }

        document.getElementById('admin-email').textContent = user.email;
        loadAllUsers();
    });
}

/**
 * Load all users from Firestore
 */
async function loadAllUsers() {
    console.log("Fetching all users...");
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-20 text-center text-slate-500">데이터를 불러오는 중...</td></tr>`;

    try {
        const snapshot = await db.collection("users").orderBy("updatedAt", "desc").get();
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUsers(allUsers);
        updateStats(allUsers);
    } catch (error) {
        console.error("Error loading users:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-20 text-center text-red-500">데이터를 불러오지 못했습니다. <br>Firestore 규칙(Index/Permission)을 확인해 주세요.</td></tr>`;
    }
}

/**
 * Render user rows in table
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

        // Expiry Calculation
        let expiryDate = null;
        let diffDays = "-";
        let statusClass = "status-free";
        let statusText = "FREE USER";

        if (user.isBanned) {
            statusClass = "status-banned";
            statusText = "BANNED (차단됨)";
        } else if (user.expiryDate) {
            expiryDate = user.expiryDate.toDate();
            const diffTime = expiryDate - now;
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (user.plan && user.plan !== 'free') {
                if (diffTime > 0) {
                    statusClass = "status-active";
                    statusText = "ACTIVE (" + user.plan.toUpperCase() + ")";
                } else {
                    statusClass = "status-expired";
                    statusText = "EXPIRED (" + user.plan.toUpperCase() + ")";
                }
            }
        }

        const formattedExpiry = expiryDate ? Utils.formatDate(expiryDate.toISOString()) : "N/A";
        const usageCount = user.totalExecutions || 0;
        const freeCount = user.freeTrialCount || 0;

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="text-white font-bold text-sm">${user.email || 'Unknown'}</div>
                <div class="text-[10px] text-slate-500 font-mono mt-0.5">${user.hwid || user.id || 'No HWID'}</div>
                <div class="text-[9px] text-blue-500/70 mt-0.5">${user.platform || 'OS: -'} / ${user.language || 'LG: -'}</div>
            </td>
            <td class="px-6 py-4">
                <span class="status-badge ${statusClass}">${statusText}</span>
                <div class="text-[10px] text-slate-500 mt-1">${user.lastOrderId || ''}</div>
            </td>
            <td class="px-6 py-4 text-sm">
                <div class="text-slate-200">Total: <span class="font-bold text-blue-400">${usageCount}회</span></div>
                <div class="text-[10px] text-slate-500">Free Trial: <span class="text-green-500/80">${freeCount}회</span></div>
            </td>
            <td class="px-6 py-4 text-sm">
                <div class="${diffDays < 3 && diffDays >= 0 ? 'text-yellow-400 font-bold' : 'text-slate-300'}">${formattedExpiry}</div>
                <div class="text-[10px] text-slate-500">${diffDays > 0 ? diffDays + '일 남음' : (diffDays < 0 ? '만료됨' : '-')}</div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="openEditModal('${user.id}', '${user.email}')" 
                        class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-all">
                    Manage
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Update Header Stats
 */
function updateStats(users) {
    const now = new Date();
    const total = users.length;
    const active = users.filter(u => u.plan && u.plan !== 'free' && u.expiryDate && u.expiryDate.toDate() > now).length;
    const trial = users.filter(u => (u.freeTrialCount || 0) > 0).length;

    // Simple mock for "Expired today" calculation
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
 * Search and Filter Event
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
 * Modal Management
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
    saveBtn.innerText = "Saving...";

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
            // Reset to free usually means no expiry or expired date
            updateData.planName = "FREE";
        }

        await userRef.update(updateData);
        alert("성공적으로 반영되었습니다.");
        document.getElementById('editModal').classList.add('hidden');
        loadAllUsers(); // Reload table
    } catch (error) {
        console.error("Update failed:", error);
        alert("수정에 실패했습니다: " + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "Apply Changes";
    }
});
