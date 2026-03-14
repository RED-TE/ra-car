const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 🚀 PayApp Webhook (Feedback URL) Handler
exports.payappFeedback = functions.https.onRequest(async (req, res) => {
    // PayApp sends data in POST body (form-encoded)
    const data = req.body || {};
    console.log("PayApp Signal Received (Raw Data):", JSON.stringify(data));
    console.log("Headers:", JSON.stringify(req.headers));

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

            // 🚀 Price Manipulation Verification
            const paidAmount = parseInt(amount.replace(/[^0-9]/g, "")) || 0;
            let expectedPrice = 0;
            if (planId === "lite") {
                expectedPrice = isYearly ? 990000 : 99000;
            } else {
                expectedPrice = isYearly ? 2688000 : 249000;
            }
            if (paidAmount < expectedPrice) {
                console.error(`❌ Security Alert: Price manipulation detected! UID=${uid}, Plan=${planName}, Expected=${expectedPrice}, Paid=${paidAmount}`);
                return res.send("SUCCESS"); // Acknowledge webhook, but DO NOT grant license
            }

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
                memo: data.memo || ""       // 🚀 사업자 증빙 정보 등 저장
            };

            // 만약 빌키(rebill_key)가 넘어왔다면 저장 (정기결제 등록)
            if (data.rebill_key) {
                console.log(`💳 Billkey Received for UID=${uid}: ${data.rebill_key}`);
                updateData.billKey = data.rebill_key;
                updateData.isSubscriptionActive = true;
                updateData.subscriptionStartDate = now;
            }

            // 기존에 구독 중이거나 방금 등록했다면 다음 결제일 갱신
            // (var2='subscription'은 결제 창에서 보낸 구분값)
            if (data.rebill_key || data.var2 === 'subscription') {
                updateData.nextBillingDate = admin.firestore.Timestamp.fromDate(expiryDate);
            }

            // 3. Update User Activation Status
            await db.collection("users").doc(uid).set(updateData, { merge: true });

            // 🚀 4. Update Scarcity Count (Price Limited Offer)
            try {
                const pricingRef = db.collection("settings").doc("pricing");
                await db.runTransaction(async (transaction) => {
                    const pricingDoc = await transaction.get(pricingRef);
                    const countField = planId === 'lite' ? 'liteCount' : 'proCount';
                    const defaultCount = planId === 'lite' ? 53 : 38;

                    if (!pricingDoc.exists) {
                        const initData = { proCount: 38, liteCount: 53 };
                        initData[countField] = defaultCount - 1;
                        transaction.set(pricingRef, initData);
                    } else {
                        const data = pricingDoc.data();
                        const currentCount = data[countField] !== undefined ? data[countField] : defaultCount;
                        if (currentCount > 0) {
                            transaction.update(pricingRef, { [countField]: currentCount - 1 });
                        }
                    }
                });
                console.log(`📉 Successfully decremented ${planId} count`);
            } catch (scarcityErr) {
                console.error("❌ Scarcity Count Update Failed:", scarcityErr);
            }

            console.log(`✅ Successfully upgraded user ${uid} to ${planId}${data.rebill_key ? ' (Subscription Active)' : ''}`);

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
        await db.collection("users").doc(uid).update({
            isSubscriptionActive: false,
            subscriptionCanceled: true,
            updatedAt: admin.firestore.Timestamp.now()
        });
        return { success: true, message: "구독이 정상적으로 취소되었습니다. 정기 결제가 중단됩니다." };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

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
