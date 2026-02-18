import firebase_admin
from firebase_admin import credentials, firestore
import os

key_path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\RealCar_bot\serviceAccountKey.json'
cred = credentials.Certificate(key_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

print("Checking 'users' collection in batches...")
docs = db.collection('users').stream()
total = 0
for doc in docs:
    total += 1
    if total % 10 == 0:
        print(f"Counted {total} users so far...")
    if total <= 5:
        print(f"Sample: {doc.to_dict().get('email')}")

print(f"Total users found: {total}")
