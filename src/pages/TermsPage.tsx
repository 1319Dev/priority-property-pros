import terms from "../../docs/legal/terms-of-service.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function TermsPage() {
  return <LegalDocumentPage title="Terms of Service" source={terms} />;
}
