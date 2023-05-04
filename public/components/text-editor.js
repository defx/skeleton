import { define, html } from "../c8.js"

define(
  "text-editor",
  ({ message }, dispatch) =>
    html`<textarea
        autofocus
        oninput="${(e) => dispatch("textchange", { value: e.target.value })}"
      >
${message}</textarea
      >
      <button type="button" onclick="${() => dispatch("save")}">save</button> `
)
