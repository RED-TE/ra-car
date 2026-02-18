import firebase_admin
from firebase_admin import credentials, auth, firestore
import os

# Path to the service account key
key_path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\RealCar_bot\serviceAccountKey.json'

if not os.path.exists(key_path):
    print(f"❌ Key not found at {key_path}")
else:
    cred = credentials.Certificate(key_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("--- Firebase Authentication Check ---")
    auth_users = []
    try:
        page = auth.list_users()
        while page:
            for user in page.users:
                auth_users.append({
                    'uid': user.uid,
                    'email': user.email,
                    'provider': [p.provider_id for p in user.provider_data]
                })
            page = page.get_next_page()
        print(f"Total Auth Users: {len(auth_users)}")
    except Exception as e:
        print(f"Error listing auth users: {e}")

    print("\n--- Firestore 'users' Collection Check ---")
    firestore_uids = set()
    try:
        docs = db.collection('users').stream()
        count = 0
        for doc in docs:
            count += 1
            data = doc.to_dict()
            firestore_uids.add(doc.id)
            if count <= 23: # Print sample
                print(f"[{count}] {doc.id} | {data.get('email')} | Plan: {data.get('plan')}")
        print(f"Total Firestore Documents in 'users': {count}")
    except Exception as e:
        print(f"Error listing firestore users: {e}")

    print("\n--- Discrepancy Analysis ---")
    missing_in_firestore = []
    for au in auth_users:
        if au['uid'] not in firestore_uids:
            missing_in_firestore.append(au)

    print(f"Users in Auth but NOT in Firestore 'users' collection: {len(missing_in_firestore)}")
    for m in missing_in_firestore[:10]:
        print(f"  - {m['email']} (UID: {m['uid']}, Providers: {m['provider']})")

    if missing_in_firestore:
        print("...")

    print("\n--- Other Collections Check ---")
    try:
        collections = db.collections()
        for col in collections:
            print(f"Collection found: {col.id}")
    except Exception as e:
        print(f"Error listing collections: {e}")
