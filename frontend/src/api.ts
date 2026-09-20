export interface Note {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}
export interface Task {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  created_at: string;
}
export interface User {
  id: string;
  username: string;
}
export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: FieldErrors = {},
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = "qingjian:unauthorized";
let requestGeneration = 0;
let activeUserId: string | null = null;
let authQueue: Promise<unknown> = Promise.resolve();

export function setActiveUser(id: string | null) {
  activeUserId = id;
  requestGeneration++;
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const started = requestGeneration;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(activeUserId && !path.startsWith("/auth/")
          ? { "X-Qingjian-User": activeUserId }
          : {}),
        ...(method !== "GET" && method !== "HEAD"
          ? { "X-Qingjian-Request": "1" }
          : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("连接失败，请检查网络后重试。");
  }
  const raw = await response.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : undefined;
  } catch {
    if (response.ok)
      throw new Error("服务器返回了无法读取的数据，请稍后重试。");
  }
  if (!response.ok) {
    const payload = data as { detail?: unknown; fields?: unknown } | undefined;
    if (
      response.status === 401 &&
      !path.startsWith("/auth/") &&
      started === requestGeneration
    ) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(
      typeof payload?.detail === "string"
        ? payload.detail
        : "操作失败，请稍后重试。",
      response.status,
      payload?.fields && typeof payload.fields === "object"
        ? (payload.fields as FieldErrors)
        : {},
    );
  }
  return data as T;
}

export function authApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const execute = () => {
    const locks = (
      navigator as Navigator & {
        locks?: {
          request<T>(name: string, callback: () => Promise<T>): Promise<T>;
        };
      }
    ).locks;
    return locks
      ? locks.request("qingjian-auth", () => api<T>(path, method, body))
      : api<T>(path, method, body);
  };
  const result = authQueue.then(execute, execute).then((value) => {
    if (method !== "GET" && method !== "HEAD") requestGeneration++;
    return value;
  });
  authQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
