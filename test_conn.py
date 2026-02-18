import firebase_admin
from firebase_admin import credentials, firestore
import os
import sys

# Path to the service account key
key_path = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\RealCar_bot\serviceAccountKey.json'

try:
    if not os.path.exists(key_path):
        print(f"ERROR: Key not found at {key_path}")
        sys.exit(1)

    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("SUCCESS: Firebase initialized.")
    doc_count = 0
    docs = db.collection('users').limit(5).get()
    for doc in docs:
        doc_count += 1
        print(f"DOC: {doc.id} -> {doc.to_dict().get('email')}")
    
    print(f"Sample count: {doc_count}")

except Exception as e:
    print(f"EXCEPTION: {e}")
