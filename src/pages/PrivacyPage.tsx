import policy from "../../docs/legal/privacy-policy.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function PrivacyPage() {
  return <LegalDocumentPage title="Privacy Policy" source={policy} />;
}