/** The database function stays. Production builds do not show the button. */
export function showTestingConfirmButton(prod = import.meta.env.PROD): boolean {
  return !prod;
}
