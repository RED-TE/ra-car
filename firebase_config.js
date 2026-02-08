// Firebase Configuration (Compat Mode for file:// access)
const firebaseConfig = {
  apiKey: "AIzaSyDwBr5ftgJID4cGt45N23eVCTiLWt5M2PE",
  authDomain: "recarauto-88950.firebaseapp.com",
  projectId: "recarauto-88950",
  storageBucket: "recarauto-88950.firebasestorage.app",
  messagingSenderId: "851749593786",
  appId: "1:851749593786:web:f114ba96d32dafcf261883",
  measurementId: "G-CT2RF1RFNQ"
};

// Initialize Firebase if the SDK is loaded
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);

  // Expose globals for easier access
  // Only initialize Firestore if the library is loaded
  if (firebase.firestore) {
    window.db = firebase.firestore();
  }

  if (firebase.auth) {
    window.auth = firebase.auth();
    window.googleProvider = new firebase.auth.GoogleAuthProvider();
  }

  console.log("Firebase Initialized (Compat Mode)");
} else {
  console.error("Firebase SDK not loaded. Make sure to include the script tags in your HTML.");
}
