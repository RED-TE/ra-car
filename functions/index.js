const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 🚀 PayApp Webhook (Feedback URL) Handler
exports.payappFeedback = functions.https.onRequest(async (req, res) => {
    // PayApp sends data in POST body (form-encoded), but sometimes it might be in query or rawBody
    const data = { ...req.query, ...req.body };
    console.log("PayApp Signal Received (Data):", JSON.stringify(data));

    if (Object.keys(data).length === 0 && req.rawBody) {
        try {
            const querystring = require('querystring');
            const parsed = querystring.parse(req.rawBody.toString());
            Object.assign(data, parsed);
            console.log("Parsed from rawBody:", JSON.stringify(parsed));
        } catch (e) {
            console.error("Failed to parse rawBody:", e.message);
        }
    }

    const PAYAPP_LINK_KEY = "u0VjDSiQHsUamv/vBQMVS+1DPJnCCRVaOgT+oqg6zaM=";
    const PAYAPP_LINK_VAL = "u0VjDSiQHsUamv/vBQMVS1bQIoBpTecR5Ye3Ew9bJaU=";

    // Support both linkkey (official) and link_key (variations)
    const receivedKey = data.linkkey || data.link_key;
    const receivedVal = data.linkval || data.link_val;

    // 1. Security Verification
    if (receivedKey !== PAYAPP_LINK_KEY || receivedVal !== PAYAPP_LINK_VAL) {
        console.error(`Security mismatch! 
            Expected Key: ${PAYAPP_LINK_KEY}, Received: ${receivedKey}
            Expected Val: ${PAYAPP_LINK_VAL}, Received: ${receivedVal}`);
        return res.status(403).send("Forbidden");
    }

    // 2. Identify Event (4 = Payment Success) 
    // pay_state might be a number or a string
    if (String(data.pay_state) === "4") {
        const uid = data.var1;
        const planName = data.goodname || "LITE PLAN";
        const amount = String(data.price || "0");
        const orderId = data.mul_no;

        console.log(`Processing Success Signal: UID=${uid}, Plan=${planName}, Order=${orderId}`);

        if (!uid) {
            console.error("Missing UID in var1. Cannot update user status.");
            return res.send("SUCCESS");
        }

        try {
            const now = admin.firestore.Timestamp.now();

            // Determine Plan Info from Name (Pricing Config matching)
            const planId = planName.toLowerCase().includes("lite") ? "lite" : "pro";
            const isYearly = planName.toLowerCase().includes("1년") || planName.toLowerCase().includes("yearly");
            const durationDays = isYearly ? 365 : 30;

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + durationDays);

            // 🚀 Recurring Payment Logic
            const updateData = {
                plan: planId,
                planName: planName,
                paymentDate: now,
                expiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
                lastOrderId: orderId,
                lastPaymentAmount: parseInt(amount.replace(/[^0-9]/g, "")),
                updatedAt: now,
                licenseKey: "RA" + Math.random().toString(36).substring(2, 10).toUpperCase(),
                phone: data.recvphone || "", // 🚀 자동결제를 위해 번호 저장
                memo: data.memo || "",       // 🚀 사업자 증빙 정보 등 저장
                rebillNo: data.rebill_no || null // 🚀 PayApp 구독 번호
            };

            // 만약 빌키(rebill_key)가 넘어왔다면 저장 (정기결제 등록 - 수동/자동 공용)
            if (data.rebill_key) {
                console.log(`💳 Billkey Received for UID=${uid}: ${data.rebill_key}`);
                updateData.billKey = data.rebill_key;
                updateData.isSubscriptionActive = true;
                updateData.subscriptionStartDate = now;
            }

            // PayApp 구독 번호가 있다면 정기결제로 간주
            if (data.rebill_no) {
                console.log(`📅 Rebill No Received for UID=${uid}: ${data.rebill_no}`);
                updateData.isSubscriptionActive = true;
            }

            // 기존에 구독 중이거나 방금 등록했다면 다음 결제일 갱신 (var2='subscription' 또는 rebill_no 존재)
            if (data.rebill_key || data.rebill_no || data.var2 === 'subscription' || (data.var2 && data.var2.includes('subscription'))) {
                updateData.nextBillingDate = admin.firestore.Timestamp.fromDate(expiryDate);
            }

            // 3. Update User Activation Status
            await db.collection("users").doc(uid).set(updateData, { merge: true });

            console.log(`✅ Successfully upgraded user ${uid} to ${planId}`);

            // 🚀 4. Automated Cash Receipt (현금영수증 발행)
            if (data.var2) {
                try {
                    const evidenceData = JSON.parse(data.var2);
                    if (evidenceData && evidenceData.type !== 'none') {
                        console.log(`🧾 Queuing Cash Receipt for UID=${uid}, Type=${evidenceData.type}`);
                        // 🚀 'await' 하지 않고 비동기로 실행하여 PayApp 피드백 응답(SUCCESS) 지연 방지
                        issueCashReceipt({
                            mul_no: orderId,
                            amount: parseInt(amount),
                            type: evidenceData.type,
                            id_info: evidenceData.id_info
                        }).catch(err => console.error("❌ Delayed Cash Receipt Issuance Failed:", err));
                    }
                } catch (pe) {
                    console.log("var2 is not JSON or other format, skipping receipt checking.");
                }
            }

            // 🚀 4. Decrement Limited Offer Counter
            const settingsRef = db.collection("settings").doc("pricing");
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(settingsRef);
                if (!sfDoc.exists) {
                    transaction.set(settingsRef, { limited_offer_count: 36 }); // Start from 37 - 1 = 36
                } else {
                    const newCount = Math.max(0, (sfDoc.data().limited_offer_count || 37) - 1);
                    transaction.update(settingsRef, { limited_offer_count: newCount });
                }
            });
            console.log("📉 Limited offer counter decremented.");

        } catch (error) {
            console.error("❌ Firestore Update Failed:", error);
        }
    } else if (String(data.pay_state) === "8") {
        // Handle Cancellation/Refund
        const uid = data.var1;
        console.log(`Processing Cancellation Signal: UID=${uid}`);

        if (uid) {
            try {
                await db.collection("users").doc(uid).update({
                    plan: "free",
                    updatedAt: admin.firestore.Timestamp.now(),
                    cancelDate: admin.firestore.Timestamp.now()
                });
                console.log(`✅ Successfully revoked license for user ${uid} due to cancellation (UID provided).`);
            } catch (error) {
                console.error("❌ Firestore Update Failed (Cancel by UID):", error);
            }
        } else {
            // Fallback: Try to find user by Order ID (mul_no)
            const orderId = data.mul_no;
            console.log(`⚠️ UID missing in cancellation. Trying to find user by Order ID: ${orderId}`);

            if (orderId) {
                try {
                    const snapshot = await db.collection("users").where("lastOrderId", "==", orderId).limit(1).get();
                    if (!snapshot.empty) {
                        const userDoc = snapshot.docs[0];
                        await userDoc.ref.update({
                            plan: "free",
                            updatedAt: admin.firestore.Timestamp.now(),
                            cancelDate: admin.firestore.Timestamp.now()
                        });
                        console.log(`✅ Successfully revoked license for user ${userDoc.id} found by Order ID ${orderId}.`);
                    } else {
                        console.error(`❌ No user found with lastOrderId: ${orderId}. Cancellation failed.`);
                    }
                } catch (error) {
                    console.error("❌ Firestore Query Failed (Cancel by OrderID):", error);
                }
            } else {
                console.error("❌ Both UID and mul_no are missing. Cannot process cancellation.");
            }
        }
    } else {
        console.log(`Signal received but pay_state is ${data.pay_state} (not 4 or 8). Skipping update.`);
    }

    // Always return 'SUCCESS' to PayApp
    res.send("SUCCESS");
});

// 🚀 Scheduled Rebill Function (Runs daily at Midnight)
exports.payappRebillScheduled = functions.pubsub.schedule('0 0 * * *').timeZone('Asia/Seoul').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    console.log("⏰ Starting Scheduled Rebill Check...");

    try {
        // Find active subscriptions due for billing
        const snapshot = await db.collection("users")
            .where("isSubscriptionActive", "==", true)
            .where("nextBillingDate", "<=", now)
            .get();

        if (snapshot.empty) {
            console.log("No subscriptions due for billing today.");
            return null;
        }

        console.log(`Found ${snapshot.size} subscriptions to process.`);

        for (const doc of snapshot.docs) {
            const user = doc.data();
            const uid = doc.id;

            if (!user.billKey) {
                console.error(`Missing billKey for UID=${uid}. Skipping.`);
                continue;
            }

            try {
                await processRebill(uid, user);
            } catch (err) {
                console.error(`Rebill failed for UID=${uid}:`, err);
            }
        }
    } catch (error) {
        console.error("Scheduled Rebill Error:", error);
    }
    return null;
});

/**
 * 💳 PayApp 리빌(정기결제) API 호출 핵심 로직
 */
async function processRebill(uid, user) {
    const https = require('https');
    const querystring = require('querystring');

    const PAYAPP_USERID = "jhxox0707";
    const PAYAPP_LINK_KEY = "u0VjDSiQHsUamv/vBQMVS+1DPJnCCRVaOgT+oqg6zaM=";

    const postData = querystring.stringify({
        cmd: 'rebill',
        userid: PAYAPP_USERID,
        linkkey: PAYAPP_LINK_KEY,
        rebill_key: user.billKey,
        goodname: user.planName || (user.plan === 'lite' ? 'LITE (입문용)' : 'PRO (메인 상품)'),
        price: user.lastPaymentAmount || (user.plan === 'lite' ? 99000 : 249000),
        recvphone: user.phone || '01000000000', // 핸드폰 번호 저장 필드가 필요함
        var1: uid
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.payapp.kr',
            path: '/oapi/api.html',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', async () => {
                const response = querystring.parse(body);
                console.log(`PayApp Rebill Response (UID=${uid}):`, JSON.stringify(response));

                if (response.state === '1') {
                    console.log(`✅ Rebill Request Success for UID=${uid}`);

                    // 🚀 피드백을 기다리지 않고 즉시 다음 만료일 갱신 (보험용)
                    try {
                        const now = admin.firestore.Timestamp.now();
                        const isYearly = (user.planName || "").toLowerCase().includes("1년") || (user.planName || "").toLowerCase().includes("yearly");
                        const durationDays = isYearly ? 365 : 30;

                        let currentExpiry = user.expiryDate;
                        let newExpiry;
                        if (currentExpiry && typeof currentExpiry.toDate === 'function') {
                            newExpiry = currentExpiry.toDate();
                        } else {
                            newExpiry = new Date();
                        }

                        // 만약 만료일이 이미 지났다면 오늘 기준, 아니면 기존 만료일 기준 연장
                        if (newExpiry < new Date()) newExpiry = new Date();
                        newExpiry.setDate(newExpiry.getDate() + durationDays);

                        await db.collection("users").doc(uid).update({
                            expiryDate: admin.firestore.Timestamp.fromDate(newExpiry),
                            nextBillingDate: admin.firestore.Timestamp.fromDate(newExpiry),
                            updatedAt: now,
                            lastPaymentAmount: user.lastPaymentAmount, // 금액 유지
                            plan: user.plan
                        });
                        console.log(`📅 Successfully extended subscription for ${uid} until ${newExpiry.toISOString()}`);
                    } catch (dbErr) {
                        console.error("❌ Rebill post-process DB update failed:", dbErr);
                    }

                    resolve(response);
                } else {
                    console.error(`❌ Rebill Request Failed: ${response.errorMessage || 'Unknown Error'}`);
                    // 만약 실패 사유가 한도초과나 카드오류면 구독 중단 처리 검토
                    reject(new Error(response.errorMessage));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 🚫 구독 취소 핸들러
exports.cancelSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    const uid = context.auth.uid;

    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();

        // 1. PayApp 구독 해지 (rebill_no가 있는 경우)
        if (userData && userData.rebillNo) {
            console.log(`🚫 Calling PayApp rebillCancel for UID=${uid}, rebillNo=${userData.rebillNo}`);
            try {
                await payappApiCall({
                    cmd: 'rebillCancel',
                    rebill_no: userData.rebillNo,
                    userid: "jhxox0707",
                    linkkey: "u0VjDSiQHsUamv/vBQMVS+1DPJnCCRVaOgT+oqg6zaM="
                });
            } catch (apiErr) {
                console.error("PayApp rebillCancel API Error:", apiErr);
                // API 실패해도 로컬 상태는 해지 처리 시도
            }
        }

        // 2. Local State Update
        await db.collection("users").doc(uid).update({
            isSubscriptionActive: false,
            subscriptionCanceled: true,
            updatedAt: admin.firestore.Timestamp.now()
        });
        return { success: true, message: "구독이 정상적으로 취소되었습니다. 정기 결제가 중단되었습니다." };
    } catch (error) {
        console.error("Cancel Subscription Error:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * 🧾 현금영수증 발행 API 호출
 */
async function issueCashReceipt({ mul_no, amount, type, id_info }) {
    const amt_tot = amount;
    const amt_sup = Math.round(amt_tot / 1.1);
    const amt_tax = amt_tot - amt_sup;
    const trad_time = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

    const postData = {
        cmd: 'cashStRegist',
        userid: 'jhxox0707',
        linkkey: 'u0VjDSiQHsUamv/vBQMVS+1DPJnCCRVaOgT+oqg6zaM=',
        mul_no: mul_no,
        id_info: id_info,
        trad_time: trad_time,
        tr_code: type === 'business' ? '1' : '0',
        amt_tot: amt_tot,
        amt_sup: amt_sup,
        amt_tax: amt_tax,
        corp_tax_type: '0' // 과세
    };

    return payappApiCall(postData);
}

/**
 * 🌐 PayApp REST API 공용 호출 함수
 */
async function payappApiCall(params) {
    const https = require('https');
    const querystring = require('querystring');
    const postData = querystring.stringify(params);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.payapp.kr',
            path: '/oapi/apiLoad.html',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                const response = querystring.parse(body);
                console.log(`PayApp API Response (${params.cmd}):`, JSON.stringify(response));
                if (response.state === '1') resolve(response);
                else reject(new Error(response.errorMessage || 'API Error'));
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 🎁 Review Reward Handler (+7 Days Extension)
exports.onReviewCreate = functions.firestore.document('reviews/{reviewId}').onCreate(async (snap, context) => {
    const reviewData = snap.data();
    const uid = reviewData.uid;

    if (!uid) {
        console.error("Review created without UID. Cannot give reward.");
        return;
    }

    const userRef = db.collection("users").doc(uid);

    try {
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) {
                throw new Error("User does not exist!");
            }

            const userData = userDoc.data();

            // 1. Check if reward already given
            if (userData.reviewRewardGiven) {
                console.log(`User ${uid} already received review reward. Skipping.`);
                return;
            }

            // 2. Calculate New Expiry Date
            let currentExpiry = userData.expiryDate;
            let newExpiry;

            // Handle Firestore Timestamp or Date object
            if (currentExpiry && typeof currentExpiry.toDate === 'function') {
                newExpiry = currentExpiry.toDate();
            } else if (currentExpiry) {
                newExpiry = new Date(currentExpiry); // String or other format
            } else {
                newExpiry = new Date(); // If no expiry, start from now
            }

            // Add 7 Days
            newExpiry.setDate(newExpiry.getDate() + 7);

            // 3. Update User Doc
            t.update(userRef, {
                expiryDate: admin.firestore.Timestamp.fromDate(newExpiry),
                reviewRewardGiven: true,
                updatedAt: admin.firestore.Timestamp.now()
            });

            console.log(`🎁 Reward Given! User ${uid} extended by 7 days. New Expiry: ${newExpiry.toISOString()}`);
        });

    } catch (error) {
        console.error("❌ Review Reward Transaction Failed:", error);
    }
});
