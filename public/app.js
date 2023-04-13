import { configure, define, html } from "/c8.js"

const initialState = {
  message: "Bonjour!",
}

configure((state = initialState, type, payload) => {
  // ...
  return state
})

define("text-tagger", ({ message }, dispatch) => html`<p>${message}</p>`)
