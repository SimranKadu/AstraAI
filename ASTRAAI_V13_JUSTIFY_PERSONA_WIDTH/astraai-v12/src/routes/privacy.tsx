import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy | ASTRAAI" },
      { name: "description", content: "How ASTRAAI handles conversations and uploaded knowledge." },
      { property: "og:title", content: "Privacy | ASTRAAI" },
      {
        property: "og:description",
        content: "How ASTRAAI handles conversations and uploaded knowledge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link to="/" className="legal-brand">
          ASTRAAI
        </Link>
        <h1>Privacy Policy</h1>
        <p className="legal-date">Effective September 29, 2026</p>
        <section>
          <h2>Conversation storage</h2>
          <p>
            Your conversations are stored in your browser on this device. ASTRAAI does not create an
            account or sync your conversation history across devices.
          </p>
        </section>
        <section>
          <h2>AI processing</h2>
          <p>
            When you send a question, the conversation and relevant excerpts from the space
            knowledge archive are sent to the AI service you configured, only when the archive cannot answer on its own, to generate an answer.
          </p>
        </section>
        <section>
          <h2>Uploaded knowledge</h2>
          <p>
            The assistant uses the supplied MOSDAC and satellite material. Identity and résumé
            documents found in the archive are excluded from retrieval.
          </p>
        </section>
        <section>
          <h2>Your control</h2>
          <p>
            You can delete individual conversations from the chat sidebar. Clearing this site’s
            browser storage also removes all saved conversations.
          </p>
        </section>
        <Link to="/" className="legal-back">
          Return to ASTRAAI
        </Link>
      </div>
    </main>
  );
}
