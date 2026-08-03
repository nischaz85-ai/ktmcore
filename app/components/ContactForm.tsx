"use client";

import { FormEvent, useState } from "react";

const CONTACT_EMAIL = "nischaz85@gmail.com";

export default function ContactForm() {
  const [emailPrepared, setEmailPrepared] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const company = String(form.get("company") ?? "Not provided");
    const service = String(form.get("service") ?? "General inquiry");
    const budget = String(form.get("budget") ?? "Not specified");
    const message = String(form.get("message") ?? "");

    const subject = `KTMcore project inquiry: ${service}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company / project: ${company || "Not provided"}`,
      `Service: ${service}`,
      `Estimated budget: ${budget}`,
      "",
      "Project details:",
      message,
    ].join("\n");

    setEmailPrepared(true);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="grid gap-2 text-sm text-slate-300">
          Name
          <input
            required
            name="name"
            type="text"
            autoComplete="name"
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          Email
          <input
            required
            name="email"
            type="email"
            autoComplete="email"
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm text-slate-300">
        Company or project type
        <input
          name="company"
          type="text"
          className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-300">
          Service needed
          <select
            required
            name="service"
            defaultValue=""
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option value="" disabled>Select a service</option>
            <option>Mechanical CAD / SolidWorks</option>
            <option>Product development / prototyping</option>
            <option>Robotics hardware integration</option>
            <option>Civil CAD / drawing support</option>
            <option>Robotic simulation</option>
            <option>Other engineering support</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm text-slate-300">
          Estimated budget
          <select
            name="budget"
            defaultValue="Not sure yet"
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>Under $500</option>
            <option>$500–$1,500</option>
            <option>$1,500–$5,000</option>
            <option>$5,000+</option>
            <option>Not sure yet</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm text-slate-300">
        What do you need help with?
        <textarea
          required
          name="message"
          rows={5}
          className="resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none transition focus:border-cyan-400"
        />
      </label>

      <button
        type="submit"
        className="min-h-12 rounded-md bg-cyan-400 px-6 font-semibold text-slate-950 transition hover:bg-cyan-300"
      >
        Prepare Project Email
      </button>

      <p className="text-xs leading-5 text-slate-400">
        This opens your email app with the project details prepared. You can also
        email us directly at{" "}
        <a className="text-cyan-300 hover:text-cyan-200" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>.
      </p>

      {emailPrepared && (
        <p className="text-sm text-cyan-200" role="status">
          Your email is ready. Review it in your email app and press Send.
        </p>
      )}
    </form>
  );
}
