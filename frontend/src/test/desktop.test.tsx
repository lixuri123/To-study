import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDesktopClose, useDesktopCloseGuard } from "../desktop/useDesktopClose";

afterEach(() => { delete window.__QINGJIAN_DESKTOP__; });

it("registers when the shell bridge arrives after React mounts", async () => {
  renderHook(() => useDesktopClose());
  const registerCloseGuard = vi.fn().mockResolvedValue(undefined);
  const confirmClose = vi.fn().mockResolvedValue(undefined);
  window.__QINGJIAN_DESKTOP__ = { registerCloseGuard, confirmClose };
  await act(async () => window.dispatchEvent(new Event("qingjian:desktop-ready")));
  expect(registerCloseGuard).toHaveBeenCalledOnce();
  await act(async () => window.dispatchEvent(new Event("qingjian:request-close")));
  expect(confirmClose).toHaveBeenCalledOnce();
});

it("registers desktop close handling and closes when no workspace blocks it", async () => {
  const confirmClose = vi.fn().mockResolvedValue(undefined);
  const registerCloseGuard = vi.fn().mockResolvedValue(undefined);
  window.__QINGJIAN_DESKTOP__ = { confirmClose, registerCloseGuard };
  renderHook(() => useDesktopClose());
  await act(async () => window.dispatchEvent(new Event("qingjian:request-close")));
  expect(registerCloseGuard).toHaveBeenCalledOnce();
  expect(confirmClose).toHaveBeenCalledOnce();
});

it("delegates close to the current workspace guard and waits for approval", async () => {
  const confirmClose = vi.fn().mockResolvedValue(undefined);
  window.__QINGJIAN_DESKTOP__ = { confirmClose, registerCloseGuard: vi.fn().mockResolvedValue(undefined) };
  let approve: (() => void) | undefined;
  const guard = vi.fn((close: () => void) => { approve = close; });
  renderHook(() => { useDesktopClose(); useDesktopCloseGuard(guard); });
  await act(async () => window.dispatchEvent(new Event("qingjian:request-close")));
  expect(guard).toHaveBeenCalledOnce();
  expect(confirmClose).not.toHaveBeenCalled();
  await act(async () => approve?.());
  expect(confirmClose).toHaveBeenCalledOnce();
});

it("uses an updated guard and removes it when the workspace unmounts", async () => {
  const confirmClose = vi.fn().mockResolvedValue(undefined);
  window.__QINGJIAN_DESKTOP__ = { confirmClose, registerCloseGuard: vi.fn().mockResolvedValue(undefined) };
  renderHook(() => useDesktopClose());
  const first = vi.fn();
  const second = vi.fn();
  const hook = renderHook(({guard}) => useDesktopCloseGuard(guard), {initialProps: {guard: first}});
  hook.rerender({guard: second});
  await act(async () => window.dispatchEvent(new Event("qingjian:request-close")));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  hook.unmount();
  await act(async () => window.dispatchEvent(new Event("qingjian:request-close")));
  expect(confirmClose).toHaveBeenCalledOnce();
});
