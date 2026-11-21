# Upgrade the existing ASTRAAI project

## Scope
- Import the uploaded ASTRAAI application into this project while preserving its existing pages, navigation, authentication, knowledge archive, AI tools, and integrations.
- Implement only the improvements listed in the uploaded brief.

## Changes
1. **AI assistant**
   - Refine the assistant instructions for structured, moderately detailed space answers with headings, bullets, technical accuracy, and mission-specific sections.
   - Preserve Markdown and improve answer spacing and readability.

2. **PDF summaries**
   - Make the default summary short: concise overview, key points, and brief conclusion.
   - Add an optional Detailed Summary action without changing upload behavior.

3. **Mission simulation**
   - Replace the static orbit sketch with a smooth animated launch-to-orbit sequence.
   - Add play, pause/resume, restart, and 0.5×/1×/2× controls.
   - Add live timeline, interpolated telemetry, source labels, flight path, stage, mission phase, and orbit status.
   - Base values on the selected real vehicle and known orbital parameters; clearly distinguish real reference data from simulated/estimated telemetry.
   - Add deterministic risk evaluation with explained LOW/MEDIUM/HIGH/CRITICAL states and corresponding visual behavior. Failure effects occur only from a genuine critical condition.

4. **AI personas**
   - Add visible space-expert character treatments for each existing persona.
   - Add speaking/idle/thinking states, text responses, browser-safe voice playback, mute, pause/resume, replay, ask-another, and change-persona controls.
   - Preserve conversation context and text fallback.

5. **Integration and verification**
   - Keep protected routes and server-side AI calls intact, adapting the uploaded app to this project’s Cloud connection.
   - Verify sign-in flow, chat Markdown, PDF modes, simulation controls and telemetry, persona conversation/voice fallback, desktop/mobile layout, and page metadata.

## Technical details
- Use the existing TanStack Start route structure and AI streaming architecture.
- Keep credentials server-side and use the assigned Lovable AI model through the gateway.
- Use requestAnimationFrame-style interpolation for animation and throttled React updates for performance.
- Preserve the existing browser-only chat history behavior.
