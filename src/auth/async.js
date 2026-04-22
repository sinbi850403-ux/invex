export class TimeoutError extends Error {
  constructor(label) {
    super(`${label} timeout`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout(promise, ms, label) {
  let timer = null;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(label)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
