import policy from "../../docs/legal/community-guidelines.md?raw";
import { LegalDocumentPage } from "./LegalDocumentPage";

export function CommunityGuidelinesPage() {
  return <LegalDocumentPage title="Community Guidelines" source={policy} />;
}
