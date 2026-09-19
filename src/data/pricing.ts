/** Public pricing copy. Marketing-only — do not import payment internals or flip live flags. */

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const SIGNUP_FEE = "$9.99";

export const SIGNUP_FEE_SHORT = "$9.99 one-time account activation";

export const SIGNUP_FEE_NOT_MONTHLY =
  "This is a one-time $9.99 account activation, not $9.99/month. There is no monthly charge to keep an account. The $9.99 account activation fee is non-refundable.";

export const SIGNUP_FEE_ONE_TIME_LABEL = "$9.99 ONE TIME";

export const SIGNUP_FEE_NON_REFUNDABLE = "The $9.99 account activation fee is non-refundable.";

export const CONNECTION_FEE = "$4.99";

export const CONNECTION_FEE_PER_LABEL = "$4.99 PER CONNECTION";

export const CONNECTION_FEE_NON_REFUNDABLE = "The $4.99 Connection Fee is non-refundable.";

export const PLATFORM_FEES_NON_REFUNDABLE =
  "The $9.99 account activation fee and the $4.99 Connection Fee are non-refundable.";

export const SIGNUP_FEE_PUBLIC_NOTE =
  "$9.99 one-time account activation. Non-refundable. Not a monthly subscription.";

export const SIGNUP_FEE_CHECKOUT_NOTE =
  "$9.99 one-time account activation. Non-refundable. Not a monthly subscription. Checkout is not live yet.";

export const SIGNUP_TERMS_ACCEPTANCE =
  "I agree to the Terms of Use and Privacy Policy. The $9.99 account activation fee is non-refundable. PPP is a marketplace, not the contractor.";

export const PRICING_PAGE_TITLE = "Simple pricing. No percentage of your job.";

export const PRICING_PRIMARY =
  "See the opportunity first. Pay $4.99 only when you choose to connect.";

export const PRICING_SECONDARY = "No bidding fees. No percentage of your job. Just $4.99 to connect.";

export const HOMEPAGE_SIGNUP_HEADLINE =
  "Join Priority Property Pros for a one-time $9.99 account activation.";

export const HOMEPAGE_SIGNUP_SUPPORTING =
  "Homeowners & Businesses pay $0/month and $0 Connection Fee. Contractors browse first, then pay $4.99 only when they choose to connect. Project payments are made directly with the contractor.";

export const PRICING_HOMEPAGE_LINE = HOMEPAGE_SIGNUP_HEADLINE;

export const CONTRACTOR_SIGNUP_HEADLINE = "Get started for a one-time $9.99 account activation.";

export const CONTRACTOR_SIGNUP_SUPPORTING =
  "Then $0/month. Browse eligible opportunities first. Pay $4.99 only when you choose to connect. No percentage of the job. No bid fee.";

export const PRICING_PAGE_INTRO =
  "Everyone pays a one-time $9.99 account activation — not $9.99 a month. Homeowners & Businesses post projects with no PPP Connection Fee. Contractors pay $4.99 per voluntary connection. PPP does not take a percentage of the job. The $9.99 account activation fee and the $4.99 Connection Fee are non-refundable.";

export const HOMEOWNER_BUSINESS_HEADING = "Homeowners & Businesses";

export const HOMEOWNER_PRICING_SUMMARY =
  "$9.99 one-time account activation. $0/month. Post projects, review connections, and hire. No PPP Connection Fee. Project payments are made directly with the contractor.";

export const PRO_PRICING_SUMMARY =
  "$9.99 one-time account activation. Then $4.99 per connection. $0/month. Browse eligible opportunities first. No percentage of the job. No bid fee. You choose who to connect with.";

export const MONTHLY_PRICE = "$0/month";

export const CUSTOMER_SIGNUP_LEDE =
  "Join Priority Property Pros for a one-time $9.99 account activation. Not $9.99/month. No monthly subscription, and no PPP Connection Fee. The $9.99 account activation fee is non-refundable.";

export const CONTRACTOR_SIGNUP_LEDE =
  "Get started for a one-time $9.99 account activation — not $9.99/month. Then $0/month. Pay $4.99 only when you choose to connect. The $9.99 activation fee and the $4.99 Connection Fee are non-refundable.";

export const VERIFIER_SIGNUP_LEDE =
  "Get started for a one-time $9.99 account activation. This is not a monthly subscription. The $9.99 account activation fee is non-refundable.";

export const SIGNUP_ROLE_LEDE =
  "Get started for a one-time $9.99 account activation. Not $9.99 a month. No monthly subscription to keep your account. The $9.99 account activation fee is non-refundable.";

export const SIGN_IN_CREATE_ACCOUNT_NOTE =
  "$9.99 one-time account activation — not a monthly subscription. Non-refundable.";

export const CUSTOMER_DASHBOARD_PRICING_NOTE =
  "No monthly subscription. There is no PPP Connection Fee for customers. Project payments are made directly with the contractor.";

export const PRO_DASHBOARD_PRICING_NOTE =
  "After the one-time $9.99 activation, it is $0/month. Browse first. Pay $4.99 only when you choose to connect. No percentage of the job. The $9.99 activation fee and the $4.99 Connection Fee are non-refundable.";

export const CONNECTION_FEE_NO_HIRE_GUARANTEE =
  "The $4.99 Connection Fee purchases connection access. It does not guarantee a hire or the work. The $4.99 Connection Fee is non-refundable.";

export const PRICING_FAQ = [
  {
    question: "Is the $9.99 account activation monthly?",
    answer:
      "No. The $9.99 account activation is one-time, not $9.99/month. There is no monthly charge to keep a customer or contractor account.",
  },
  {
    question: "Do homeowners and businesses pay a PPP Connection Fee?",
    answer:
      "No. Homeowners & Businesses pay the one-time $9.99 account activation and then pay the contractor directly for the job. There is no PPP Connection Fee for customers and no monthly subscription.",
  },
  {
    question: "What do contractors pay?",
    answer:
      "After the one-time $9.99 account activation, contractors pay $0/month and browse eligible opportunities. The $4.99 Connection Fee is paid only when a contractor chooses to connect. There is no bid fee and no percentage of the job.",
  },
  {
    question: "Does the Connection Fee guarantee a hire?",
    answer:
      "No. $4.99 buys connection access, not a guaranteed job. The $4.99 Connection Fee is non-refundable. Project payment is between the customer and the contractor. PPP does not take a percentage of that payment.",
  },
  {
    question: "Are the $9.99 activation fee and $4.99 Connection Fee refundable?",
    answer:
      "No. Both fees are non-refundable. The $9.99 account activation is a one-time fee to open an account. The $4.99 Connection Fee buys connection access only — it does not guarantee a hire. You will not get a refund if you are not hired, the customer chooses someone else, the customer cancels, or you change your mind.",
  },
] as const;
