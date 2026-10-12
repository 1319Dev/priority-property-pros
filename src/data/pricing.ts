/** Public pricing copy. Marketing-only — do not import payment internals or flip live flags. */

export const PRICING_PATH = "/pricing";

export const SEE_PRICING_LABEL = "See pricing";

export const SIGNUP_FEE = "$9.99";

export const SIGNUP_FEE_SHORT = "$9.99 one-time account activation";

/** One-time / not-monthly wording without the refund rule, for spots where the page already states it once. */
export const SIGNUP_FEE_ONE_TIME_PLAIN =
  "This is a one-time $9.99 account activation, not $9.99/month. There is no monthly charge to keep an account.";

export const SIGNUP_FEE_NOT_MONTHLY =
  `${SIGNUP_FEE_ONE_TIME_PLAIN} The $9.99 account activation fee is non-refundable.`;

export const SIGNUP_FEE_ONE_TIME_LABEL = "$9.99 ONE TIME";

export const SIGNUP_FEE_NON_REFUNDABLE = "The $9.99 account activation fee is non-refundable.";

export const CONNECTION_FEE = "$4.99";

export const CONNECTION_FEE_PER_LABEL = "$4.99 PER CONNECTION";

/**
 * $4.99 refund rule (owner decision 2026-10-11): non-refundable once the connection is delivered;
 * refunded automatically when a charge goes through but the connection can't be provided.
 * The $9.99 activation rule above is unchanged.
 */
export const CONNECTION_FEE_AUTO_REFUND_CASES =
  "the project was cancelled or closed, the opportunity expired, the customer blocked you, or you were charged twice";

export const CONNECTION_FEE_NON_REFUNDABLE =
  "The $4.99 Connection Fee is non-refundable once the connection is delivered. If you are charged but the connection can't be provided, the $4.99 is refunded automatically.";

/** For screens shown after the connection is delivered. */
export const CONNECTION_FEE_DELIVERED_NON_REFUNDABLE =
  "This connection was delivered, so its $4.99 fee is non-refundable.";

export const PLATFORM_FEES_NON_REFUNDABLE = `${SIGNUP_FEE_NON_REFUNDABLE} ${CONNECTION_FEE_NON_REFUNDABLE}`;

export const SIGNUP_FEE_PUBLIC_NOTE =
  "$9.99 one-time account activation. Non-refundable. Not a monthly subscription.";

export const SIGNUP_FEE_CHECKOUT_NOTE =
  "$9.99 one-time account activation. Non-refundable. Not a monthly subscription. Checkout is not live yet.";

export const SIGNUP_FEE_CHECKOUT_LIVE_NOTE =
  "$9.99 one-time account activation. Non-refundable. Not a monthly subscription. After you verify your email, you will pay $9.99 to activate.";

/** Shown on the signup form before the create-account button. Does not change the fee. */
export const SIGNUP_BEFORE_CHECKOUT =
  "Creating an account does not charge you. After you verify your email, checkout is the one-time $9.99 account activation. It is not a monthly subscription, not the job payment, and not the $4.99 Connection Fee. The $9.99 account activation fee is non-refundable.";

export const SIGNUP_BEFORE_CHECKOUT_NOT_LIVE =
  "Creating an account does not charge you. Checkout is not live yet. The one-time $9.99 account activation is not a monthly subscription, not the job payment, and not the $4.99 Connection Fee. The $9.99 account activation fee is non-refundable.";

export const CUSTOMER_ACCOUNT_DIFFERENCE =
  "A customer account is for homeowners and businesses who need work done. You post projects, review connections, and hire. There is no PPP Connection Fee. You pay the contractor directly for the job.";

/** The contractor signup lede (CONTRACTOR_SIGNUP_LEDE) already states the $9.99 and $4.99 refund rules once. */
export const CONTRACTOR_ACCOUNT_DIFFERENCE =
  "A contractor account is for independent pros who want to get hired. Priority Property Pros is not your employer. Browse first, then pay $4.99 only when you choose to connect. Connecting does not guarantee a hire.";

export const SIGNUP_TERMS_ACCEPTANCE =
  "I agree to the Terms of Use and Privacy Policy. The $9.99 account activation fee is non-refundable. PPP is a marketplace, not the contractor.";

export const PRICING_PAGE_TITLE = "Simple pricing. No percentage of your job.";

/** Job cost, stated without restating the account or connection fees. */
export const JOB_PAYMENT_PLAIN =
  "The customer pays the contractor directly for any job cost. Priority Property Pros does not collect that payment or take a cut of the work.";

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
  "Everyone pays a one-time $9.99 account activation — not $9.99 a month. Homeowners & Businesses post projects with no PPP Connection Fee. Contractors pay $4.99 per voluntary connection. PPP does not take a percentage of the job. " +
  PLATFORM_FEES_NON_REFUNDABLE;

export const HOMEOWNER_BUSINESS_HEADING = "Homeowners & Businesses";

export const HOMEOWNER_PRICING_SUMMARY =
  "$9.99 one-time account activation. $0/month. Post projects, review connections, and hire. No PPP Connection Fee. Project payments are made directly with the contractor.";

export const PRO_PRICING_SUMMARY =
  "$9.99 one-time account activation. Then $4.99 per connection. $0/month. Browse eligible opportunities first. No percentage of the job. No bid fee. You choose who to connect with.";

export const MONTHLY_PRICE = "$0/month";

export const CUSTOMER_SIGNUP_LEDE =
  "Join Priority Property Pros for a one-time $9.99 account activation. Not $9.99/month. No monthly subscription, and no PPP Connection Fee. The $9.99 account activation fee is non-refundable.";

export const CONTRACTOR_SIGNUP_LEDE =
  "Get started for a one-time $9.99 account activation — not $9.99/month. Then $0/month. Pay $4.99 only when you choose to connect. " +
  PLATFORM_FEES_NON_REFUNDABLE;

export const SIGNUP_ROLE_LEDE =
  "Get started for a one-time $9.99 account activation, not $9.99 a month. Contractors pay $4.99 per connection. " +
  PLATFORM_FEES_NON_REFUNDABLE;

export const SIGN_IN_CREATE_ACCOUNT_NOTE =
  "$9.99 one-time account activation — not a monthly subscription. Non-refundable.";

export const CUSTOMER_DASHBOARD_PRICING_NOTE =
  "No monthly subscription. There is no PPP Connection Fee for customers. Project payments are made directly with the contractor.";

export const PRO_DASHBOARD_PRICING_NOTE =
  "After the one-time $9.99 activation, it is $0/month. Browse first. Pay $4.99 only when you choose to connect. No percentage of the job. " +
  PLATFORM_FEES_NON_REFUNDABLE;

/** No-hire wording without the refund rule, for spots where the page already states it once. */
export const CONNECTION_FEE_NO_HIRE_PLAIN =
  "The $4.99 Connection Fee opens messaging with that customer on that project. The customer decides if and when to share contact details. It does not guarantee a hire or the work.";

export const CONNECTION_FEE_NO_HIRE_GUARANTEE = `${CONNECTION_FEE_NO_HIRE_PLAIN} ${CONNECTION_FEE_NON_REFUNDABLE}`;

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
    question: "Does paying $4.99 show me the customer's phone number or address?",
    answer:
      "No. The $4.99 Connection Fee opens messaging with that customer on that project. The customer decides if and when to share their phone, email, and exact address. Paying does not reveal them automatically.",
  },
  {
    question: "Who pays for the job?",
    answer: JOB_PAYMENT_PLAIN,
  },
  {
    question: "Does the Connection Fee guarantee a hire?",
    answer:
      "No. $4.99 opens messaging with the customer, not a guaranteed job. Project payment is between the customer and the contractor. PPP does not take a percentage of that payment.",
  },
  {
    question: "Are the $9.99 activation fee and $4.99 Connection Fee refundable?",
    answer:
      `The $9.99 account activation fee is non-refundable. It is a one-time fee to open an account. The $4.99 Connection Fee is non-refundable once the connection is delivered: you will not get a refund if you are not hired, the customer chooses someone else, the customer cancels after you connected, or you change your mind. If you are charged but the connection can't be provided (for example ${CONNECTION_FEE_AUTO_REFUND_CASES}), the $4.99 is refunded automatically to your card. The $4.99 opens messaging only. It does not guarantee a hire or reveal contact details.`,
  },
] as const;
