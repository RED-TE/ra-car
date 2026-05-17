# RE:CAR Homepage

RE:CAR 장기렌트/리스 홈페이지입니다.

## 실행

```bash
npm start
```

기본 포트는 `5173`입니다. 필요하면 `PORT` 환경변수로 변경할 수 있습니다.

## 운영 환경변수

관리자 최초 계정은 서버 첫 실행 시 생성됩니다.

```bash
SUPER_ADMIN_USERNAME=jhxox666
SUPER_ADMIN_PASSWORD=your-secure-password
FIREBASE_PROJECT_ID=recarauto-88950
FIREBASE_API_KEY=your-firebase-web-api-key
```

Firebase 문의 저장은 `server.js`의 Firestore REST 저장 경로를 사용합니다. 문의 데이터, 관리자 계정, 상담 메모 등 운영 데이터는 `data/` 아래에 생성되며 Git에 올리지 않습니다.

## 포함 파일

- `index.html`, `vehicles.html`, `privacy.html`, `terms.html`, `admin.html`
- `styles.css`, `script.js`, `server.js`
- `assets/` 차량/히어로 이미지
- `data/vehicle-pricing.json`
- Firebase Firestore rules
