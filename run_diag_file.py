import firebase_admin
from firebase_admin import credentials, firestore
import os

key_path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\RealCar_bot\serviceAccountKey.json'
cred = credentials.Certificate(key_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

with open('firestore_status.txt', 'w', encoding='utf-8') as f:
    f.write("Firestore Status Check\n")
    f.write("-" * 30 + "\n")
    
    docs = db.collection('users').get()
    f.write(f"Total documents in 'users': {len(docs)}\n")
    
    for doc in docs:
        data = doc.to_dict()
        email = data.get('email', 'N/A')
        platform = data.get('platform', 'N/A')
        f.write(f"- {doc.id} | {email} | {platform}\n")

print("Diagnostic info written to firestore_status.txt")
