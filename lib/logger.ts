export function logWithTs(...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

export function logErrorWithTs(...args: unknown[]): void {
  console.error(`[${new Date().toISOString()}]`, ...args);
}
