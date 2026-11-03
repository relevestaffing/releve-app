# The save rule (Nona, 3 November 2026)

Anywhere a person types information and presses Save, the form must close into a read-only "Saved" state. It must never stay open and editable after saving. A client must never see that.

This is enforced in one place: `components/SaveLock.tsx`, mounted in `app/layout.tsx`. It watches every non-GET `/api/` call and, when the server answers ok, locks the form (or `[data-save-scope]` block) the click came from.

- A `<form>` is covered automatically. Build new forms normally.
- A block of fields that is not a `<form>` (a card with its own Save button) needs `data-save-scope` on its root.
- A box that must stay live after sending (chat, add-another) needs `data-keep-open`. A form whose text fields clear themselves is skipped on its own.
- Do not add a second "Saved" label that leaves fields editable.
