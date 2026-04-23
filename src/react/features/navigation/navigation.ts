export const navigationItems = [
  {
    to: '/',
    label: '홈',
    hint: '오늘 해야 할 일과 주요 지표를 한눈에 확인',
    title: '운영 홈',
    eyebrow: '대시보드',
  },
  {
    to: '/inventory',
    label: '재고',
    hint: '재고 등록, 부족 재고 확인, 품목 수정',
    title: '재고 현황',
    eyebrow: '재고',
  },
  {
    to: '/inout',
    label: '입출고',
    hint: '입고와 출고 기록을 빠르게 등록하고 조회',
    title: '입출고 관리',
    eyebrow: '입출고',
  },
  {
    to: '/auth',
    label: '계정',
    hint: '로그인, 권한 상태, 비밀번호 재설정',
    title: '계정 및 인증',
    eyebrow: '인증',
  },
] as const;

export function getNavigationMeta(pathname: string) {
  const item =
    navigationItems.find((entry) => entry.to === pathname) ||
    navigationItems.find((entry) => entry.to !== '/' && pathname.startsWith(entry.to));

  return item || navigationItems[0];
}
