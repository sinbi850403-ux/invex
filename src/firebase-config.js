/**
 * firebase-config.js - Firebase 초기화 설정
 * 역할: Firebase 프로젝트 연결, Auth/Firestore 인스턴스 생성
 * 
 * ⚠️ 설정 방법:
 * 1. Firebase Console (https://console.firebase.google.com) 에서 프로젝트 생성
 * 2. '웹 앱 추가' → config 값 복사
 * 3. 아래 firebaseConfig 객체에 붙여넣기
 * 4. Authentication → Google 로그인 활성화
 * 5. Firestore Database → 데이터베이스 만들기
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// === Firebase 설정 ===
// TODO: Firebase Console에서 발급받은 값으로 교체해주세요
const firebaseConfig = {
  apiKey: "AIzaSyDuMCWvrJbGCdvovNvY-fQ6hR4kSyoc9dk",
  authDomain: "erp-lite-9e83a.firebaseapp.com",
  projectId: "erp-lite-9e83a",
  storageBucket: "erp-lite-9e83a.firebasestorage.app",
  messagingSenderId: "141493032",
  appId: "1:141493032:web:a006b2312da6ecf9c7c61d",
  measurementId: "G-2SNZ9SEEZM"
};

// Firebase 초기화
let app = null;
let auth = null;
let db = null;
let googleProvider = null;

// Firebase 설정이 아직 안 된 경우를 대비한 가드
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    // 한국어 UI
    auth.languageCode = 'ko';
  } catch (error) {
    console.warn('Firebase 초기화 실패:', error.message);
  }
}

export { app, auth, db, googleProvider, isConfigured };
