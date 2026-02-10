# 🍎 Ricar Admin - 애플 스타일 업그레이드 가이드

## ✨ 새로운 기능

### 1. 애플 디자인
- SF Pro Display 폰트 스타일
- 부드러운 블러 효과 (backdrop-filter)
- 미니멀한 색상 (회색 + 파란색)
- 둥근 모서리 + 넓은 여백

### 2. 완전한 사용자 추적
- ✅ **가입만 한 사용자도 모두 표시**
- ✅ **프로그램 실행 로그 수집 및 표시**
- ✅ **무료 이용자 상세 추적**
- ✅ **이상 사용 의심 자동 감지**

### 3. 이상 사용 의심 로직
자동으로 감지:
1. 무료 사용자가 2회 이상 실행 🚨
2. 3대 이상 기기에서 실행
3. 총 10회 이상 실행
4. 만료 후 계속 실행 시도

---

## 🚀 빠른 적용 (5분)

### 1단계: 파일 교체
```
기존 파일:
- ricar_mgr_7468_gate.html
- ricar_mgr_7468_gate.js

새 파일:
- ricar_mgr_7468_gate_apple.html  ← 업로드
- ricar_mgr_7468_gate_apple.js     ← 업로드
```

### 2단계: 접속
```
https://your-domain.com/ricar_mgr_7468_gate_apple.html
```

### 3단계: 로그인
관리자 이메일: `jhxox666@gmail.com`로 로그인

---

## 📊 대시보드 구성

### 상단 통계 (5개 카드)
```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ 전체 가입자 │ 활성 플랜   │ 무료 이용자 │ 오늘 만료   │ 이상 사용   │
│    125      │     48      │     77      │      3      │      8      │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

### 탭 구성
1. **전체 사용자** - 모든 사용자 목록
2. **이상 사용 의심** - 의심 사용자만 필터링
3. **무료 이용자** - 무료 플랜 상세

---

## 🔧 Python 클라이언트 로그 수집

### 1. 필요한 패키지
```bash
pip install firebase-admin --break-system-packages
```

### 2. 코드 추가 (main.py)

```python
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import platform
import uuid

# Firebase 초기화 (한 번만)
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

class RicarLogger:
    def __init__(self, user_id, hwid):
        self.user_id = user_id
        self.hwid = hwid
        self.start_time = datetime.now()
        self.current_step = "시작"
        
    def log_step(self, step_name):
        """각 단계마다 호출"""
        self.current_step = step_name
        print(f"[LOG] {step_name}")
        
    def log_success(self):
        """성공 시 호출"""
        self._save_log("success", None)
        
    def log_error(self, error_message):
        """에러 시 호출"""
        self._save_log("error", error_message)
        
    def _save_log(self, status, error=None):
        try:
            user_ref = db.collection('users').document(self.user_id)
            
            log_entry = {
                'timestamp': datetime.now(),
                'hwid': self.hwid,
                'lastStep': self.current_step,
                'status': status,
                'duration': (datetime.now() - self.start_time).total_seconds(),
                'platform': platform.system(),
            }
            
            if error:
                log_entry['error'] = error
            
            user_ref.update({
                'executionLogs': firestore.ArrayUnion([log_entry]),
                'lastExecutionLog': log_entry,
                'totalExecutions': firestore.Increment(1),
                'updatedAt': datetime.now()
            })
            
            print(f"✅ 로그 저장: {status}")
        except Exception as e:
            print(f"❌ 로그 저장 실패: {e}")

# 사용 예시
def main():
    user_id = "user_hwid_or_uid"
    hwid = str(uuid.UUID(int=uuid.getnode()))
    
    logger = RicarLogger(user_id, hwid)
    
    try:
        logger.log_step("로그인 중")
        # 로그인 로직...
        
        logger.log_step("블로그 작성 중")
        # 블로그 작성...
        
        logger.log_step("발행 완료")
        logger.log_success()
        
    except Exception as e:
        logger.log_error(str(e))

if __name__ == "__main__":
    main()
```

### 3. 무료 체험 제한 체크

```python
def check_free_trial(user_id):
    """무료 체험 제한 확인"""
    try:
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            data = user_doc.to_dict()
            plan = data.get('plan', 'free')
            free_count = data.get('freeTrialCount', 0)
            
            # 무료 플랜이고 2회 이상이면 차단
            if plan == 'free' and free_count >= 2:
                print(f"⚠️ 무료 체험 제한 초과: {free_count}회")
                return False
            
            # 카운트 증가
            if plan == 'free':
                user_ref.update({
                    'freeTrialCount': firestore.Increment(1)
                })
                
        return True
        
    except Exception as e:
        print(f"❌ 체험 체크 실패: {e}")
        return True  # 에러 시 실행 허용
```

---

## 📁 Firestore 데이터 구조

### users 컬렉션
```javascript
{
  // 기본
  email: "user@example.com",
  hwid: "ABC123...",
  plan: "lite" | "pro" | "free",
  
  // 날짜
  expiryDate: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  
  // 추적 (새로 추가)
  totalExecutions: 15,        // 총 실행
  freeTrialCount: 2,          // 무료 실행
  deviceIds: ["hwid1", ...],  // 기기 목록
  
  // 로그 (새로 추가)
  executionLogs: [
    {
      timestamp: Timestamp,
      hwid: "ABC...",
      lastStep: "블로그 작성 중",
      status: "success" | "error",
      duration: 123.45,
      platform: "Windows",
      error: "에러 메시지"
    }
  ],
  lastExecutionLog: { ... },
  
  // 의심 (자동 설정)
  suspiciousActivity: true,
  suspiciousReason: "무료 3회 실행, 5대 기기"
}
```

---

## 🎨 UI 커스터마이징

### 색상 변경
`ricar_mgr_7468_gate_apple.html`:

```css
.apple-button {
    background: #3b82f6;  /* 파란색 */
}

.badge-active {
    color: #22c55e;  /* 초록색 */
}
```

### 이상 사용 조건 변경
`ricar_mgr_7468_gate_apple.js`:

```javascript
function analyzeSuspiciousActivity() {
    suspiciousUsers = allUsers.filter(user => {
        // 조건 변경
        if (user.freeTrialCount >= 3) {  // 2→3으로 변경
            return true;
        }
        // ...
    });
}
```

---

## ❓ 문제 해결

### Q1. "사용자가 표시되지 않아요"
**A:** Firestore 규칙 확인
```javascript
allow read: if request.auth != null;
```

### Q2. "로그가 저장되지 않아요"
**A:** 
1. `serviceAccountKey.json` 파일 확인
2. Firebase SDK 버전 확인
3. 네트워크 연결 확인

### Q3. "이상 사용 감지 안 돼요"
**A:**
1. `analyzeSuspiciousActivity()` 함수 확인
2. 브라우저 콘솔 에러 확인
3. 데이터 구조 확인

---

## 💡 팁

### 1. 자동 새로고침
```javascript
// ricar_mgr_7468_gate_apple.js 마지막 추가
setInterval(loadAllData, 60000); // 1분마다
```

### 2. CSV 내보내기
```javascript
function exportCSV() {
    const csv = allUsers.map(u => 
        `${u.email},${u.plan},${u.totalExecutions}`
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'users.csv';
    a.click();
}
```

---

## 📞 지원

문제 발생 시:
1. 브라우저 개발자 도구 (F12) 확인
2. Firebase 콘솔 확인
3. Python 콘솔 출력 확인

**완성!** 🎉
