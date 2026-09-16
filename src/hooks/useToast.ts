import { createContext, useContext } from "react";

export type Toast = { id: number; message: string };

export type ToastContextValue = {
  toasts: Toast[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return ctx;
}
