import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms and Conditions | ASTRAAI" },
      {
        name: "description",
        content: "Terms governing use of the ASTRAAI space intelligence assistant.",
      },
      { property: "og:title", content: "Terms and Conditions | ASTRAAI" },
      {
        property: "og:description",
        content: "Terms governing use of the ASTRAAI space intelligence assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link to="/" className="legal-brand">
          ASTRAAI
        </Link>
        <h1>Terms and Conditions</h1>
        <p className="legal-date">Effective September 29, 2026</p>
        <section>
          <h2>Purpose</h2>
          <p>
            ASTRAAI provides informational answers about satellite missions, meteorology,
            oceanography, and MOSDAC data from its supplied knowledge archive.
          </p>
        </section>
        <section>
          <h2>No operational reliance</h2>
          <p>
            AI responses may contain errors or omissions. Verify critical mission, safety, legal,
            and scientific decisions against authoritative sources.
          </p>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <p>
            Do not use the service to break laws, interfere with the platform, extract protected
            information, or submit content you do not have permission to process.
          </p>
        </section>
        <section>
          <h2>Availability</h2>
          <p>
            The service may change or become unavailable. Conversation history remains subject to
            your browser’s storage settings and limits.
          </p>
        </section>
        <Link to="/" className="legal-back">
          Return to ASTRAAI
        </Link>
      </div>
    </main>
  );
}
