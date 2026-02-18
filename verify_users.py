import firebase_admin
from firebase_admin import credentials, firestore
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

    print("📊 Fetching users from collection 'users'...")
    users_ref = db.collection('users')
    docs = users_ref.stream()
    
    count = 0
    google_count = 0
    email_pass_count = 0
    
    for doc in docs:
        count += 1
        data = doc.to_dict()
        email = data.get('email', 'N/A')
        # Check platform or other indicators
        platform = data.get('platform', 'Web')
        auth_provider = data.get('authProvider', 'N/A')
        
        if auth_provider == 'google':
            google_count += 1
        elif platform == 'Launcher':
            email_pass_count += 1
            
        if count <= 5: # Print first 5 for sample
            print(f"[{count}] {email} | Platform: {platform} | Auth: {auth_provider}")

    print("-" * 30)
    print(f"Total Users: {count}")
    print(f"Google Users (Web): {google_count}")
    print(f"Launcher Users: {email_pass_count}")
