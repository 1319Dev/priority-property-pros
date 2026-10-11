import { Link } from "react-router-dom";
import { LEGAL_DOCUMENTS, requiredAgreements } from "../../lib/legal/catalog";
import { legalPagesPublished } from "../../lib/legal/publish";

export function SignupAgreementLabel({
  accountType,
  published = legalPagesPublished(),
}: {
  accountType: "CUSTOMER" | "CONTRACTOR";
  published?: boolean;
}) {
  const required = requiredAgreements(accountType);
  const fee =
    accountType === "CONTRACTOR"
      ? " The $9.99 account activation fee and the $4.99 Connection Fee are non-refundable."
      : " The $9.99 account activation fee is non-refundable.";
  const extra = LEGAL_DOCUMENTS.filter((doc) => !required.some((item) => item.slug === doc.slug));

  return (
    <span>
      I agree to{" "}
      {required.map((doc, index) => (
        <span key={doc.slug}>
          {index === 0 ? "" : index === required.length - 1 ? ", and " : ", "}
          the{" "}
          {published ? (
            <Link to={doc.path} className="font-semibold text-forest-800 underline">
              {doc.title}
            </Link>
          ) : (
            doc.title
          )}
        </span>
      ))}
      .{fee} PPP is a marketplace, not the contractor.
      {published
        ? extra.map((doc) => (
            <span key={doc.slug}>
              {" "}
              <Link to={doc.path} className="font-semibold text-forest-800 underline">
                {doc.title}
              </Link>{" "}
              explain how contractor accounts work.
            </span>
          ))
        : null}
    </span>
  );
}
