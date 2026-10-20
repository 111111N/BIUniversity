import { useLayoutEffect } from "react";
import { useUnsavedChangesGuard } from "../components/UnsavedChangesProvider";
import { changesLocation, type UnsavedNavigationCheck } from "../domain/unsavedNavigation";

const useUnsavedChangesWarning = (enabled: boolean, shouldBlockNavigation: UnsavedNavigationCheck = changesLocation, blockRoleChange = true) => {
  const { register } = useUnsavedChangesGuard();
  useLayoutEffect(() => {
    if (!enabled) return;
    // Each form owns its registration; saving or unmounting removes only that form.
    return register((transition) => shouldBlockNavigation(transition), blockRoleChange);
  }, [enabled, register, shouldBlockNavigation, blockRoleChange]);
};

export default useUnsavedChangesWarning;
