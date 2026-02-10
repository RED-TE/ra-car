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
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);

            // Determine Internal Plan ID
            const planId = planName.toLowerCase().includes("lite") ? "lite" : "pro";

            // 3. Update User Activation Status
            await db.collection("users").doc(uid).set({
                plan: planId,
                planName: planName,
                paymentDate: now,
                expiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
                lastOrderId: orderId,
                lastPaymentAmount: parseInt(amount.replace(/[^0-9]/g, "")),
                updatedAt: now,
                licenseKey: "RA" + Math.random().toString(36).substring(2, 10).toUpperCase()
            }, { merge: true });

            console.log(`✅ Successfully upgraded user ${uid} to ${planId}`);

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
