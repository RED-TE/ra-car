import requests
import json
import base64

def _d(s): return base64.b64decode(s).decode('utf-8')

API_KEY = _d("QUl6YVN5RHdCcjVmdGdKSUQ0Y0d0NDVOMjNlVkNUaUxXdDVNMlBF")
PROJECT_ID = "recarauto-88950"

def count_users():
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/users?pageSize=100&mask.fieldPaths=email&key={API_KEY}"
    
    print(f"Fetching from: {url}")
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            documents = data.get('documents', [])
            print(f"Total documents returned (page 1): {len(documents)}")
            for doc in documents[:5]:
                fields = doc.get('fields', {})
                email = fields.get('email', {}).get('stringValue', 'N/A')
                print(f"- {email}")
        else:
            print(f"Error {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    count_users()
