# Realistic AI Persona Experience

## Goal
Make the persona conversations feel visually alive and naturally spoken while remaining clear that they are AI interpretations, not the real people.

## Changes
- Replace placeholder symbols for Kalpana Chawla and Rakesh Sharma with licensed public portraits, preserving source and license attribution.
- Keep the fictional MOSDAC analyst clearly illustrated rather than presenting a fake real person.
- Animate the portrait while speech plays using subtle breathing, expression, and audio-reactive mouth movement.
- Replace device-dependent browser speech with natural AI-generated Indian-English voices delivered through the secure app backend.
- Keep mute, pause, replay, text fallback, and visible AI disclosure; never imitate or claim to reproduce a real person's actual voice.

## Technical Details
- Add a protected server audio endpoint with input validation, safe error messages, and no exposed credentials.
- Fetch generated audio as binary data and drive portrait motion from playback state.
- Store licensed portrait files locally rather than hotlinking them.

## Verification
- Test portrait rendering, source attribution, audio generation, playback controls, and speaking animation.
- Confirm failures leave the full answer readable and controls return to a usable state.
