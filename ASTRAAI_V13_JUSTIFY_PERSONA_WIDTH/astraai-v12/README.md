# ASTRAAI

Space research assistant. It answers from its own **trained archive first** (your documents in `./data`) and uses an **AI API only as the backup** when the archive cannot answer.

## Run in VS Code

> **Your `.env` is never overwritten by updates.** The zip does not contain `.env`. If you start from a fresh folder, copy `.env.example` to `.env` and fill in your keys.


Requires Node.js 20 or newer. Open the folder in VS Code, open a terminal (Ctrl+`) and run:

```sh
npm install        # .npmrc already sets legacy-peer-deps
npm run train      # (re)builds the knowledge index from ./data
npm run dev        # open http://localhost:8080
```

Sign in on the `/auth` page. Authentication uses the Supabase project configured in `.env`.

## How answers are produced

1. **Gemini API (when `GEMINI_API_KEY` is set).** Every chat question goes to Gemini together with the best passages from the trained archive (`src/data/trained-index.json` plus the built-in ISRO mission and launch vehicle dataset). The assistant answers space and ISRO questions and politely declines unrelated ones.
2. **Archive fallback.** If no key is set, or the API fails, ASTRAAI answers from the closest archive passages.

The terminal prints one line per question showing which path was used, for example `[astra] local answer (confidence 0.82)` or `[astra] archive not confident (0.38), using API backup`.

## Turn on the API backup (optional)

Edit `.env`:

```
GEMINI_API_KEY=your-key        # free key from https://aistudio.google.com (Get API key)
# GEMINI_MODEL=gemini-3.8-flash
```

Restart `npm run dev`. With no key the app works fully offline from the archive.

`ASTRA_LOCAL_CONFIDENCE` (default `0.62`) controls how readily the archive is trusted: raise it to use the API more often, lower it to use the archive more.

## Career Hub

The Career Hub is built from `data/careers/ISRO_Career_Guide_Jobs_Exams_Resources.docx`. The list shows each role with a short description and its related studies. Opening a role shows what the work involves, the education needed, exams and selection, subjects and books, and study resources. The roadmap appears only when you press **Show roadmap**.

- The page reads `src/data/careers.json`. Edit that file to change roles, exam routes, books or the six-month plan.
- Role descriptions, study routes, exam text, subjects and the plan are copied word for word from the guide (a test checks this). The book titles are standard textbooks suggested by ASTRAAI, because the guide names no books.
- `npm run train` also turns each role into searchable notes, so the AI Assistant can answer questions like "What exams are needed for Technical Assistant?" offline.

## Persona voice

With `GEMINI_API_KEY` set, personas speak with a natural AI voice. Without it, or if it fails, they speak with your browser's built-in voice and never show an error. Portraits: add `public/personas/<id>.jpg` (see the README there); otherwise initials are shown.

## Detailed answers

When a question names a document in the archive (for example `Aditya-L1`, `NISAR` or `INSAT-3D and INSAT-3DR`), ASTRAAI answers section by section from that document: Overview, Objectives, Launch, Payloads, Science and so on, plus quick facts or a comparison table. Asking about "payloads", "launch", "objectives" or "results" puts the matching sections first. Other questions get the best passages grouped by document, with sources.

## Curated notes

`data/curated/ISRO history and human spaceflight notes.md` holds background on the Indian space programme, SLV-3, Gaganyaan, Chandrayaan-3 and the six personas, so the persona questions can be answered offline. Edit it or add more `.md` files (use `##` headings) and run `npm run train`.

## Training on more data

Put PDF, DOCX, DOC, TXT or MD files anywhere under `./data`, run `npm run train`, then restart the dev server. The trainer keeps Word document headings and fact tables, removes duplicate files and passages, skips files that look personal (Aadhaar, resume, CV, passport) and reports scanned PDFs that have no text layer.

This is retrieval-based "training" (a searchable knowledge base built from your files), not neural network fine-tuning. New documents take effect immediately and every answer traces back to a source.

## Mission simulation

The Mission Simulation page (`src/routes/_authenticated/simulation.tsx`) has an animated Earth, rocket ascent and orbiting satellite. Payloads with less than 10% spare capacity make the rocket shake, an over-capacity payload explodes partway up and the mission is lost, and the satellite only deploys after a successful orbit insertion. The previous version of the page is kept in `backup/` in case you want it back.

## PDF summary

The PDF text is read on the server and sent to the AI as plain text, so any AI model works. If there is no AI key, or the AI service fails, a built-in summary made from the PDF's own text is shown instead, with a note saying why. Scanned PDFs (pictures of text) have nothing to read and are reported as such.

## Reference documents

`data/reference/` holds the ISRO Comprehensive Reference 2026 and the ISRO Mission Encyclopedia (Expanded Points 20 and 21). `npm run train` keeps their chapter and section headings and turns every table row into one line (for example "Launch event 61: GSLV-F09 / GSAT-9; Date: 5 May 2017; Launcher: GSLV Mk II"), so questions about a specific launch or mission find the exact row.

## Word hints (glossary)

Space, data and AI terms get a dotted underline across the app. Hover over a term (or tap it on a touch screen) to see an **i** icon and its meaning. The meanings come from `reference/glossary/AstraAI_Hard_Words_Glossary.docx`, which is not part of the training data. All terms are also listed, with search, on the **Glossary** page.

- Switch hints on or off with **Word hints** in the left menu (the choice is remembered).
- Headings, links, code and form fields are not underlined.
- To change the terms, edit the glossary document and run `npm run glossary`. Terms like "Sea Surface Temperature (SST)" also match "SST".
- Underlines use the CSS Custom Highlight API (Chrome, Edge and Safari 17.2 or newer). In other browsers the hover card still works, without the underline.

## Raising the archive's confidence

ASTRAAI answers from the archive when its confidence is at least 0.62, and otherwise asks the AI backup. Confidence is the share of the question's important words (rare words count more) found in the best matching passages, and the question must also be about space or something named in the archive.

See why a question scores the way it does:

```sh
npm run ask -- "Can a diploma holder join ISRO?"
```

It prints the score, which words were found, which are missing, and the best passages. Then:

1. **Add the missing wording.** Write a short note in `data/curated/` that answers the question in the words people use. Use a question as the heading:
   ```
   ## Can a diploma holder join ISRO?
   Yes. Technical Assistant posts commonly require a relevant engineering diploma...
   ```
   Then run `npm run train` and restart the server.
2. **Add more documents** to `data/` and train again. Scanned PDFs need OCR first.
3. **Adjust the threshold** with `ASTRA_LOCAL_CONFIDENCE` in `.env` (default 0.62). Values from about 0.5 to 0.62 are safe. Below 0.5 the archive starts answering questions it does not really cover. A low score is correct when no document covers the topic, for example salaries.

## Email verification

After sign-up the app shows a full "Check your email" screen (with a Resend button and a 60 second countdown). The link in the email opens `/account-verified`, a page that says **"Your account is verified"** and leads to the dashboard. Logging in before verifying shows the same "Check your email" screen. In Supabase, Authentication, URL Configuration, the Redirect URLs must include `http://localhost:8080/**`. To skip email verification while testing, turn off **Confirm email** under Authentication, Sign In / Providers, Email.

## Troubleshooting: "This page didn't load"

When running locally the error screen now shows the real cause in a grey box under the buttons. Also press F12 and open the Console tab for the full red error. Common fixes:

1. Stop the server (Ctrl+C), delete the `node_modules/.vite` folder, run `npm run dev -- --force`, then hard refresh the browser (Ctrl+Shift+R). This clears a stale cache after files were replaced while the server was running.
2. Make sure the whole zip was copied, including `src/data/careers.json`, `src/data/careers.ts` and the `data` folder.
3. Run `npm install --legacy-peer-deps` again after updating.

The bottom of the left menu shows the build label (for example "Build v10 · confidence"). If it shows an older label, an old copy is running.

## Tests

```sh
npm test
```

Covers the archive confidence scoring and the archive, API and fallback flow (using a mock API server).

## What needs the API

Chat and personas use Gemini when a key is set. PDF summaries, diagrams, the satellite recommender and the simulation analysis generate new text, so they always need `GEMINI_API_KEY`.

## Supabase (login)

Supabase is used only for email and password sign-in. There are no database tables to create. To use your own project, create one at supabase.com, then put its URL and publishable key into `.env` (all six `SUPABASE_*` and `VITE_SUPABASE_*` lines). In Authentication, URL Configuration, set Site URL to `http://localhost:8080` and add `http://localhost:8080/**` as a Redirect URL. Restart `npm run dev` after editing `.env`.

## AI Persona knowledge guide

The six educational AI personas use `data/reference/ASTRA_AI_Persona_Field_Guide.docx` (readable document) and its matching Markdown source. The guide is included in the local knowledge archive and covers public biographies, mission context, documented challenges, specialist topics and factuality rules. Persona chat retrieves both persona-specific passages and mission/MOSDAC passages before sending context to the configured AI model. When adding or editing archive documents, run `npm run train` from the project root and restart the app. This builds a retrieval index; it does not fine-tune model weights.
