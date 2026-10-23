import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/api/client";
import { trackEnquirySuccess } from "@/analytics/Analytics";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EnquiryForm() {
  const id = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/enquiries", {
        method: "POST",
        auth: false,
        body: {
          name: String(data.get("name") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          category: data.get("category"),
          message: String(data.get("message") ?? "").trim(),
          contactConsent: data.get("contactConsent") === "on",
          website: String(data.get("website") ?? ""),
        },
      });
      form.reset();
      setSuccess(true);
      trackEnquirySuccess();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not send your enquiry. Please check your connection and try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      id="contact"
      className="enquiry-section landing-container"
      aria-labelledby={`${id}-title`}
    >
      <div className="enquiry-intro">
        <span className="landing-icon">
          <MessageCircle aria-hidden="true" />
        </span>
        <p className="landing-eyebrow">Let’s talk</p>
        <h2 id={`${id}-title`} className="landing-section-title">
          Good questions deserve
          <br />a human answer.
        </h2>
        <p className="landing-section-description">
          Exploring Vaultessa for your team? Have a question or an idea? Send us
          a message.
        </p>
        <p className="enquiry-privacy">
          We use your name, email and message to respond to this enquiry. This
          does not subscribe you to marketing emails.
        </p>
        <p className="enquiry-security">
          <strong>Keep your secrets in your vault.</strong>
          <br />
          Never include passwords, recovery keys or vault contents.
        </p>
      </div>
      {success ? (
        <div className="enquiry-success" role="status">
          <span className="landing-icon">
            <Check aria-hidden="true" />
          </span>
          <h3>Thanks for getting in touch.</h3>
          <p>
            Your enquiry has been received. Keep an eye on your inbox for a
            response.
          </p>
          <button className="landing-button" onClick={() => setSuccess(false)}>
            Send another enquiry
          </button>
        </div>
      ) : (
        <form className="enquiry-form" onSubmit={submit} aria-busy={busy}>
          {error && (
            <p className="enquiry-error" role="alert">
              {error}
            </p>
          )}
          <div className="enquiry-fields">
            <label htmlFor={`${id}-name`}>
              Your name
              <Input
                id={`${id}-name`}
                name="name"
                required
                maxLength={100}
                autoComplete="name"
                disabled={busy}
              />
            </label>
            <label htmlFor={`${id}-email`}>
              Email address
              <Input
                id={`${id}-email`}
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                disabled={busy}
              />
            </label>
          </div>
          <label htmlFor={`${id}-category`}>
            What’s on your mind?
            <Select
              name="category"
              defaultValue="general"
              disabled={busy}
            >
              <SelectTrigger id={`${id}-category`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="general">General question</SelectItem>
                <SelectItem value="teams">Vaultessa for teams</SelectItem>
                <SelectItem value="feedback">Feedback or an idea</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label htmlFor={`${id}-message`}>
            Your message
            <Textarea
              id={`${id}-message`}
              name="message"
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              disabled={busy}
              placeholder="Tell us a little about how we can help."
              aria-describedby={`${id}-hint`}
            />
          </label>
          <small id={`${id}-hint`}>
            10–4,000 characters. Please leave out sensitive information.
          </small>
          <div className="enquiry-honeypot" aria-hidden="true">
            <label htmlFor={`${id}-website`}>
              Leave this field empty
              <input
                id={`${id}-website`}
                name="website"
                tabIndex={-1}
                autoComplete="off"
                maxLength={200}
              />
            </label>
          </div>
          <label className="enquiry-consent">
            <input
              type="checkbox"
              name="contactConsent"
              required
              disabled={busy}
            />
            I agree that Vaultessa can use these details to respond to my
            enquiry.
          </label>
          <button className="landing-button" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send enquiry"}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
      )}
    </section>
  );
}
