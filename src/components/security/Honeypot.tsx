import { HONEYPOT_FIELD_NAME } from "../../lib/security/botGuard";

/**
 * Hidden from people and assistive tech; simple bots fill every input.
 * Off-screen instead of display:none so naive bots still see it.
 */
export function Honeypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
      <label htmlFor={HONEYPOT_FIELD_NAME}>Leave this field empty</label>
      <input
        id={HONEYPOT_FIELD_NAME}
        name={HONEYPOT_FIELD_NAME}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid="honeypot"
      />
    </div>
  );
}
