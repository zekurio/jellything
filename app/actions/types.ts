export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export function success<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function error<T = never>(message: string): ActionResult<T> {
  return { success: false, error: message };
}
