const DEMO_SESSION_KEY = "nora:demo:active:v1";
let demoActiveInMemory = false;

export const demoUser = Object.freeze({
  id: 9001,
  nombre: "Alex Demo",
  email: "demo@nora.example",
  rol: "Admin",
  activo: true,
});

export function isDemoActive() {
  if (demoActiveInMemory) return true;
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "active";
  } catch {
    return false;
  }
}

export function startDemoSession() {
  try {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    demoActiveInMemory = true;
    return true;
  } catch {
    return false;
  }
}

export function endDemoSession() {
  demoActiveInMemory = false;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    window.dispatchEvent(new Event("app:demo-ended"));
  } catch {
    return;
  }
}
