import { FormEvent, useState } from "react";
import { Button, ButtonLink } from "../components/ui/Button";
import { Container } from "../components/ui/Container";
import { TextInput } from "../components/ui/Input";
import { SUPPORT_EMAIL, CUSTOMER_CTA } from "../data/brand";

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const subject = encodeURIComponent(`PPP contact from ${name.trim() || "website"}`);
    const body = encodeURIComponent(`${message.trim()}\n\nFrom: ${name.trim()}\nEmail: ${email.trim()}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <section className="py-10 sm:py-16">
      <Container className="max-w-2xl">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Contact</p>
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
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <TextInput label="Your name" name="name" value={name} onChange={(event) => setName(event.target.value)} />
          <TextInput
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="block" htmlFor="contact-message">
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
              Message
            </span>
            <textarea
              id="contact-message"
              name="message"
              required
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-32 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3 text-base text-ink-900"
            />
          </label>
          <Button type="submit">Open email</Button>
        </form>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/faq" variant="outline">
            Read the FAQ
          </ButtonLink>
          <ButtonLink to="/post-project" variant="ghost">
            {CUSTOMER_CTA}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
