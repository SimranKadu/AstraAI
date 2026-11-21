<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Preserve ASTRAAI's TanStack protected-route shell and browser-local chat threads because the imported product already depends on those navigation and persistence boundaries.
- Keep all AI generation behind authenticated TanStack server routes because prompts, credentials, and private user inputs must remain server-side.
- Serve generated persona speech as private streamed audio from an authenticated server route because voice text and credentials must remain server-side.
