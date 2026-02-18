const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Path to the service account key (using the one found in RealCar_bot which we know matches the project)
const keyPath = 'c:/Users/jhxox/Desktop/sales_progerm/inphoto/RealCar_bot/serviceAccountKey.json';

if (!fs.existsSync(keyPath)) {
    console.error('❌ serviceAccountKey.json not found at:', keyPath);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUsers() {
    console.log('📊 Checking users in recarauto-88950...');
    try {
        const snapshot = await db.collection('users').get();
        console.log(`Total users found: ${snapshot.size}`);

        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`- ID: ${doc.id}, Email: ${data.email}, Plan: ${data.plan}, Provider: ${data.authProvider || 'Email/Pass?'}`);
        });

        console.log('\n📊 Checking licenses collection (fallback)...');
        const licenseSnap = await db.collection('licenses').get();
        console.log(`Total licenses found: ${licenseSnap.size}`);
        licenseSnap.forEach(doc => {
            console.log(`- License ID: ${doc.id}, Email: ${doc.data().email}`);
        });

    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

checkUsers();
