"use client";

import { useSyncExternalStore } from "react";

type SetupStatus = "new" | "install" | "assign" | "test" | "dismissed" | "complete";
const STORAGE_KEY = "ourpool:shortcut-setup:v1";
const CHANGE_EVENT = "ourpool:shortcut-setup-change";
const STATUSES: SetupStatus[] = ["new", "install", "assign", "test", "dismissed", "complete"];
let memoryStatus: SetupStatus = "new";
let memoryOnly = false;

function getSnapshot(): SetupStatus {
  if (memoryOnly) return memoryStatus;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return STATUSES.includes(stored as SetupStatus) ? stored as SetupStatus : "new";
  } catch {
    return memoryStatus;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function setStatus(status: SetupStatus) {
  memoryStatus = status;
  try {
    window.localStorage.setItem(STORAGE_KEY, status);
    memoryOnly = false;
  } catch {
    // Private/restricted storage must not stop dismissal or expense entry.
    memoryOnly = true;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const subscribeToDevice = () => () => {};
const isIPhone = () => /iPhone/i.test(navigator.userAgent);

export function useShortcutSetup() {
  const status = useSyncExternalStore(subscribe, getSnapshot, () => "new" as const);
  const iPhone = useSyncExternalStore(subscribeToDevice, isIPhone, () => false);
  return { status, setStatus, iPhone };
}
