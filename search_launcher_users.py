import firebase_admin
from firebase_admin import credentials, firestore
import os

key_path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\RealCar_bot\serviceAccountKey.json'
cred = credentials.Certificate(key_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

print("Searching for users with 'Launcher' platform or missing 'authProvider'...")
docs = db.collection('users').stream()
count = 0
found_launcher = 0
for doc in docs:
    count += 1
    data = doc.to_dict()
    platform = data.get('platform', '-')
    auth_provider = data.get('authProvider', '-')
    email = data.get('email', '-')
    
    if platform == 'Launcher' or auth_provider != 'google':
        found_launcher += 1
        print(f"FOUND: {email} | Platform: {platform} | Auth: {auth_provider} | UID: {doc.id}")

print("-" * 30)
print(f"Scan complete. Scanned {count} documents.")
print(f"Total Launcher-like users found: {found_launcher}")
