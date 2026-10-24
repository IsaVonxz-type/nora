export const USER_KEY = "user:v1";
let sessionGeneration = 0;

export function getSessionGeneration() {
  return sessionGeneration;
}

export function advanceSessionGeneration() {
  sessionGeneration += 1;
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user) {
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
}
