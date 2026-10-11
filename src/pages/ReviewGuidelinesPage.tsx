import policy from "../../docs/legal/review-content-guidelines.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function ReviewGuidelinesPage() {
  return <LegalDocumentPage title="Review & Content Guidelines" source={policy} />;
}
