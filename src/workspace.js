/**
 * workspace.js - 팀 워크스페이스 관리
 * 
 * 핵심 개념:
 *   - 워크스페이스 = 하나의 회사/팀 (데이터 공유 단위)
 *   - 팀장(owner)이 워크스페이스를 생성하고 멤버를 초대
 *   - 같은 워크스페이스에 속한 멤버는 동일한 데이터를 실시간 공유
 * 
 * Firestore 구조:
 *   workspaces/{workspaceId} → 공유 데이터 (재고, 거래, 거래처 등)
 *   workspaces/{workspaceId}/meta → {name, ownerId, createdAt, members[]}
 *   users/{uid} → {workspaceId, role, ...}
 */

import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot, deleteField } from './firebase-compat-firestore.js';
import { db, isConfigured } from './firebase-config.js';
import { getCurrentUser, getUserProfileData } from './firebase-auth.js';
import { getState, setState } from './store.js';
import { showToast } from './toast.js';

// 실시간 동기화 리스너
let unsubWorkspace = null;
let isSyncing = false;
let lastSyncTime = null;
let currentWorkspaceId = null;

/**
 * 워크스페이스 ID 조회
 * 왜? → 사용자가 속한 워크스페이스를 찾아야 데이터를 공유할 수 있음
 */
export async function getWorkspaceId(userId) {
  if (!isConfigured || !userId) return userId; // 미설정 시 개인 ID 사용

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists() && userDoc.data().workspaceId) {
      return userDoc.data().workspaceId;
    }
  } catch (e) {
    console.warn('[Workspace] 워크스페이스 ID 조회 실패:', e.message);
  }

  // 워크스페이스가 없으면 본인 UID가 워크스페이스 ID (1인 사용자)
  return userId;
}

/**
 * 워크스페이스 생성 (팀장 전용)
 * 첫 가입 시 자동 생성되거나, 팀 설정에서 수동 생성
 */
export async function createWorkspace(name) {
  const user = getCurrentUser();
  if (!user || !isConfigured) return null;

  const wsId = user.uid; // 팀장의 UID를 워크스페이스 ID로 사용
  try {
    // 메타 정보 저장
    await setDoc(doc(db, 'workspaces', wsId, 'meta', 'info'), {
      name: name || 'My Workspace',
      ownerId: user.uid,
      ownerEmail: user.email,
      ownerName: user.displayName || '관리자',
      createdAt: new Date().toISOString(),
      members: [{
        uid: user.uid,
        email: user.email,
        name: user.displayName || '관리자',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      }],
    });

    // 사용자 프로필에 워크스페이스 연결
    await updateDoc(doc(db, 'users', user.uid), {
      workspaceId: wsId,
      role: 'admin',
    });

    currentWorkspaceId = wsId;
    showToast(`워크스페이스 "${name}" 생성 완료!`, 'success');
    return wsId;
  } catch (e) {
    showToast('워크스페이스 생성 실패: ' + e.message, 'error');
    return null;
  }
}

/**
 * 팀 멤버 초대 (이메일로)
 * 왜 이메일? → 상대방에게 별도 코드를 공유할 필요 없이 이메일만으로 초대 가능
 */
export async function inviteMember(email, role = 'staff') {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  const wsId = await getWorkspaceId(user.uid);

  try {
    // 초대 대상 사용자 찾기
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const snap = await getDocs(q);

    if (snap.empty) {
      showToast('해당 이메일로 가입된 사용자가 없습니다. 먼저 가입을 안내해 주세요.', 'warning');
      return false;
    }

    const targetUser = snap.docs[0];
    const targetUid = targetUser.id;
    const targetData = targetUser.data();

    // 이미 같은 워크스페이스인지 확인
    if (targetData.workspaceId === wsId) {
      showToast('이미 같은 팀에 속한 멤버입니다.', 'info');
      return false;
    }

    // 대상 사용자의 워크스페이스를 내 것으로 변경
    await updateDoc(doc(db, 'users', targetUid), {
      workspaceId: wsId,
      role: role,
    });

    // 메타 정보에 멤버 추가
    const metaRef = doc(db, 'workspaces', wsId, 'meta', 'info');
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      const members = metaSnap.data().members || [];
      members.push({
        uid: targetUid,
        email: email,
        name: targetData.name || '사용자',
        role: role,
        joinedAt: new Date().toISOString(),
      });
      await updateDoc(metaRef, { members });
    }

    showToast(`${email} 님을 팀에 초대했습니다!`, 'success');
    return true;
  } catch (e) {
    showToast('초대 실패: ' + e.message, 'error');
    return false;
  }
}

/**
 * 팀 멤버 제거
 */
export async function removeMember(targetUid) {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  const wsId = await getWorkspaceId(user.uid);

  try {
    // 대상의 워크스페이스 연결 해제 → 본인 UID를 워크스페이스로 복원
    await updateDoc(doc(db, 'users', targetUid), {
      workspaceId: targetUid,
      role: 'admin',
    });

    // 메타에서 멤버 제거
    const metaRef = doc(db, 'workspaces', wsId, 'meta', 'info');
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      const members = (metaSnap.data().members || []).filter(m => m.uid !== targetUid);
      await updateDoc(metaRef, { members });
    }

    showToast('멤버를 제거했습니다.', 'info');
    return true;
  } catch (e) {
    showToast('멤버 제거 실패: ' + e.message, 'error');
    return false;
  }
}

/**
 * 워크스페이스 메타 정보 가져오기
 */
export async function getWorkspaceMeta(wsId) {
  if (!isConfigured || !wsId) return null;

  try {
    const metaRef = doc(db, 'workspaces', wsId, 'meta', 'info');
    const snap = await getDoc(metaRef);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * 워크스페이스 실시간 동기화 시작
 * 왜 onSnapshot? → 다른 멤버가 데이터를 변경하면 즉시 반영되어야 하므로
 */
export async function startWorkspaceSync(userId) {
  if (!isConfigured || !userId) return;

  const wsId = await getWorkspaceId(userId);
  currentWorkspaceId = wsId;

  const docRef = doc(db, 'workspaces', wsId);

  // 기존 리스너 제거
  stopWorkspaceSync();

  // 실시간 리스너 등록
  unsubWorkspace = onSnapshot(docRef, (docSnap) => {
    if (isSyncing) return; // 내가 올린 변경은 무시

    if (docSnap.exists()) {
      const cloudData = docSnap.data();
      const cloudTime = cloudData._lastSync || 0;
      const localTime = lastSyncTime || 0;

      // 클라우드가 더 최신이면 로컬에 반영
      if (cloudTime > localTime) {
        const { _lastSync, _lastEditor, ...data } = cloudData;
        setState(data);
        lastSyncTime = cloudTime;
        console.log('[Workspace] 클라우드 → 로컬 동기화 완료');
      }
    }
  }, (error) => {
    console.warn('[Workspace] 실시간 동기화 에러:', error.message);
  });
}

/**
 * 로컬 → 워크스페이스 클라우드 업로드
 */
let wsSaveTimer = null;

export function syncWorkspaceToCloud() {
  if (!isConfigured || !currentWorkspaceId) return;

  const user = getCurrentUser();
  if (!user) return;

  // 3초 디바운스
  clearTimeout(wsSaveTimer);
  wsSaveTimer = setTimeout(async () => {
    try {
      isSyncing = true;
      const state = getState();
      const now = Date.now();

      const syncData = {
        mappedData: state.mappedData || [],
        transactions: state.transactions || [],
        transfers: state.transfers || [],
        vendorMaster: state.vendorMaster || [],
        accountEntries: state.accountEntries || [],
        purchaseOrders: state.purchaseOrders || [],
        stocktakeHistory: state.stocktakeHistory || [],
        customFields: state.customFields || [],
        safetyStock: state.safetyStock || {},
        warehouses: state.warehouses || [],
        industryTemplate: state.industryTemplate || 'general',
        costMethod: state.costMethod || 'weighted-avg',
        currency: state.currency || { code: 'KRW', symbol: '₩', rate: 1 },
        _lastSync: now,
        _lastEditor: user.displayName || user.email || 'Unknown',
      };

      const docRef = doc(db, 'workspaces', currentWorkspaceId);
      await setDoc(docRef, syncData, { merge: true });

      lastSyncTime = now;
      isSyncing = false;
      console.log('[Workspace] 로컬 → 클라우드 동기화 완료');
    } catch (error) {
      isSyncing = false;
      console.warn('[Workspace] 업로드 실패:', error.message);
    }
  }, 3000);
}

/**
 * 동기화 중지
 */
export function stopWorkspaceSync() {
  if (unsubWorkspace) {
    unsubWorkspace();
    unsubWorkspace = null;
  }
  clearTimeout(wsSaveTimer);
  lastSyncTime = null;
  currentWorkspaceId = null;
}

/**
 * 현재 워크스페이스 ID
 */
export function getCurrentWorkspaceId() {
  return currentWorkspaceId;
}

/**
 * 무료 기간 계산
 * 왜? → 가입일 기준 1년 무료, 남은 기간을 표시하여 유료 전환 유도
 */
export function getFreePeriodInfo(createdAt) {
  if (!createdAt) return { daysLeft: 365, expired: false, endDate: '' };

  const created = new Date(createdAt);
  const freeEnd = new Date(created);
  freeEnd.setFullYear(freeEnd.getFullYear() + 1);

  const now = new Date();
  const daysLeft = Math.ceil((freeEnd - now) / (1000 * 60 * 60 * 24));

  return {
    daysLeft: Math.max(0, daysLeft),
    expired: daysLeft <= 0,
    endDate: freeEnd.toLocaleDateString('ko-KR'),
    startDate: created.toLocaleDateString('ko-KR'),
  };
}
