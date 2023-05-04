import { define, html } from "../c8.js"

define(
  "item-list",
  ({ items = [] }, dispatch) => html`<div>
    ${items.map(({ id, text }) =>
      html`
        <div>
          ${text}<button
            onclick="${() => {
              dispatch("remove", { id })
            }}"
          >
            [x]
          </button>
        </div>
      `.key(id)
    )}
  </div>`
)
