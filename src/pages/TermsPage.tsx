import terms from "../../docs/legal/terms-of-use.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function TermsPage() {
  return <LegalDocumentPage title="Terms of Service" source={terms} />;
}
