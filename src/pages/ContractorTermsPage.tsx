import policy from "../../docs/legal/contractor-participation-terms.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function ContractorTermsPage() {
  return <LegalDocumentPage title="Contractor Participation Terms" source={policy} />;
}
