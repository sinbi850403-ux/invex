export const DELETE_UNDO_WINDOW_MS = 8000;
export const DELETE_UNDO_WINDOW_SECONDS = Math.floor(DELETE_UNDO_WINDOW_MS / 1000);
export const DELETE_UNDO_LABEL = '실행 취소';

export function getDeleteUndoGuide(entityLabel: string) {
  return `${entityLabel} 삭제 후 ${DELETE_UNDO_WINDOW_SECONDS}초 안에 실행 취소할 수 있습니다.`;
}
