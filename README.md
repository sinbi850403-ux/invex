# INVEX

중소기업을 위한 스마트 재고·원가·입출고 관리 플랫폼입니다.  
엑셀 업로드, 바코드 스캔, 원가 분석, 자동발주 등 핵심 기능을 빠르게 시작할 수 있도록 설계되었습니다.

## 빠른 시작

```bash
npm install
npm run dev
```

기본 개발 서버는 `http://localhost:5173`에서 실행됩니다.

## 스크립트

```bash
npm run dev          # Vite 개발 서버
npm run dev:local    # 127.0.0.1:4173 고정
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 미리보기
npm run preview:local
```

## Firebase 설정

Firebase 설정은 `src/firebase-config.js`에서 관리됩니다.

1. Firebase Console에서 프로젝트를 생성합니다.
2. 웹 앱을 추가하고 config 값을 확인합니다.
3. `src/firebase-config.js`의 `firebaseConfig` 값을 자신의 프로젝트 값으로 교체합니다.
4. Authentication(Google)과 Firestore를 활성화합니다.

## 멀티 페이지 빌드

Vite 설정(`vite.config.js`)에서 아래 두 페이지를 빌드 대상으로 포함합니다.

- `index.html` (앱)
- `landing.html` (랜딩 페이지)

## 기타

- 샘플 데이터: `sample-inventory.xlsx`
- 배포 설정: `vercel.json`
