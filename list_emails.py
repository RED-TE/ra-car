import firebase_admin
from firebase_admin import credentials, firestore
import os

key_path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\RealCar_bot\serviceAccountKey.json'
cred = credentials.Certificate(key_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

print("LISTING ALL EMAILS IN 'users' COLLECTION:")
docs = db.collection('users').stream()
emails = []
for doc in docs:
    emails.append(doc.to_dict().get('email', 'N/A'))

for e in sorted(emails):
    print(f"- {e}")

print(f"Total: {len(emails)}")
