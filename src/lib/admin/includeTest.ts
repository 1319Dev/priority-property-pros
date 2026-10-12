export const INCLUDE_TEST_KEY = "ppp-admin-include-test";

/** Test accounts stay hidden until an admin turns the shared switch on. */
export function readIncludeTest(): boolean {
  try {
    return localStorage.getItem(INCLUDE_TEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeIncludeTest(value: boolean) {
  try {
    localStorage.setItem(INCLUDE_TEST_KEY, value ? "1" : "0");
  } catch {
    // The switch still changes this view when storage is blocked.
  }
}
