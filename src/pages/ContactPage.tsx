import { FormEvent, useState } from "react";
import { PostProjectLink } from "../components/layout/PostProjectLink";
import { Button, ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { TextInput } from "../components/ui/Input";
import { SUPPORT_EMAIL, CUSTOMER_CTA } from "../data/brand";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
  CONTACT_PHONE_MAX,
  CONTACT_TOPICS,
  CONTACT_VALIDATION_ERROR,
} from "../lib/contact/contactForm";
import { isContactTopic, submitContactForm, type ContactSubmitCode } from "../lib/contact/submitContactForm";

const FALLBACK = `Contact form is temporarily unavailable. Email us at ${SUPPORT_EMAIL}.`;
const RATE_LIMIT = `Too many messages from this connection. Please wait and try again, or email us at ${SUPPORT_EMAIL}.`;

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const trimmedMessage = message.trim();
    if (
      !name.trim() ||
      !email.trim() ||
      !isContactTopic(topic) ||
      trimmedMessage.length < CONTACT_MESSAGE_MIN ||
      trimmedMessage.length > CONTACT_MESSAGE_MAX
    ) {
      setError(CONTACT_VALIDATION_ERROR);
      return;
    }
    setSending(true);
    setError(null);
    const result = await submitContactForm({
      name,
      email,
      phone,
      topic,
      message,
      companyWebsite,
    });
    setSending(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    setError(messageFor(result.code));
  }

  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Contact</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800 sm:text-5xl">
          Talk to Priority Property Pros
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">
          Use this page for marketplace questions. PPP is not the contractor, so job payment, scheduling, and
          workmanship stay between you and the pro you hire.
        </p>
        <p className="mt-4 text-base text-ink-700">
          Email{" "}
          <a className="font-semibold text-forest-800 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        {sent ? (
          <div className="mt-8 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-6" role="status">
            <h2 className="font-display text-3xl font-semibold text-forest-800">Message sent</h2>
            <p className="mt-3 text-ink-700">
              Thanks. We received it and will reply to the email address you entered.
            </p>
          </div>
        ) : (
          <form className="relative mt-8 space-y-4" onSubmit={onSubmit}>
            {error ? (
              <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-forest-800" role="alert">
                {error}
              </p>
            ) : null}
            <TextInput
              label="Your name"
              name="name"
              autoComplete="name"
              required
              maxLength={CONTACT_NAME_MAX}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextInput
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={CONTACT_EMAIL_MAX}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextInput
              label="Phone (optional)"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={CONTACT_PHONE_MAX}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <label className="block" htmlFor="contact-topic">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
                Topic
              </span>
              <select
                id="contact-topic"
                name="topic"
                required
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 text-base text-ink-900"
              >
                <option value="">Select a topic</option>
                {CONTACT_TOPICS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor="contact-message">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
                Message
              </span>
              <textarea
                id="contact-message"
                name="message"
                required
                rows={6}
                minLength={CONTACT_MESSAGE_MIN}
                maxLength={CONTACT_MESSAGE_MAX}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-32 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3 text-base text-ink-900"
              />
            </label>
            <p className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>
                Company website
                <input
                  name="company_website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyWebsite}
                  onChange={(event) => setCompanyWebsite(event.target.value)}
                />
              </label>
            </p>
            <Button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Send message"}
            </Button>
          </form>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/faq" variant="outline">
            Read the FAQ
          </ButtonLink>
          <PostProjectLink to="/post-project" variant="ghost">
            {CUSTOMER_CTA}
          </PostProjectLink>
        </div>
      </Container>
    </section>
  );
}

function messageFor(code: ContactSubmitCode): string {
  if (code === "validation") return CONTACT_VALIDATION_ERROR;
  if (code === "rate_limited") return RATE_LIMIT;
  return FALLBACK;
}
