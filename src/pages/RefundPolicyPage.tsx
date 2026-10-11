import policy from "../../docs/legal/refund-cancellation-policy.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function RefundPolicyPage() {
  return <LegalDocumentPage title="Refund & Cancellation Policy" source={policy} />;
}
