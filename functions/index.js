const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 🚀 PayApp Webhook (Feedback URL) Handler
exports.payappFeedback = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    // PayApp sends data in POST body (form-encoded)
    const data = req.body;
    console.log("PayApp Signal Received:", JSON.stringify(data));

    const PAYAPP_LINK_KEY = "u0VjDSiQHsUamv/vBQMVS+1DPJnCCRVaOgT+oqg6zaM=";
    const PAYAPP_LINK_VAL = "u0VjDSiQHsUamv/vBQMVS1bQIoBpTecR5Ye3Ew9bJaU=";

    // 1. Security Verification
    if (data.linkkey !== PAYAPP_LINK_KEY || data.linkval !== PAYAPP_LINK_VAL) {
        console.error("Security mismatch! Denying request.");
        return res.status(403).send("Forbidden");
    }

    // 2. Identify Event (4 = Payment Success)
    if (data.pay_state === "4") {
        const uid = data.var1; // We passed user UID here in checkout.html
        const planName = data.goodname || "LITE PLAN";
        const amount = data.price;
        const orderId = data.mul_no;

        if (!uid) {
            console.error("Missing UID in var1. Cannot update user.");
            return res.send("SUCCESS"); // Still return SUCCESS to PayApp but log error
        }

        try {
            const now = admin.firestore.Timestamp.now();
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30); // 30 days subscription

            // Determine Internal Plan ID
            const planId = planName.toLowerCase().includes("lite") ? "lite" : "pro";

            // Generate a new license key on the fly if needed
            const generateKey = () => {
                return "RA" + Math.random().toString(36).substring(2, 10).toUpperCase();
            };

            // 3. Update User Activation Status
            await db.collection("users").doc(uid).set({
                plan: planId,
                planName: planName,
                paymentDate: now,
                expiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
                licenseKey: generateKey(),
                lastOrderId: orderId,
                lastPaymentAmount: parseInt(amount),
                updatedAt: now
            }, { merge: true });

            console.log(`Successfully upgraded user ${uid} to ${planId}`);

        } catch (error) {
            console.error("Firestore Update Failed:", error);
            // We don't want to tell PayApp it failed if it's our DB issue (they might retry but it's risky)
        }
    }

    // Always return 'SUCCESS' to PayApp to stop them from retrying
    res.send("SUCCESS");
});
