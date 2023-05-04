import { configure } from "/c8.js"

import "/components/item-list.js"
import "/components/text-editor.js"

const initialState = {
  message: "Bonjour!",
}

configure((state = initialState, type, payload) => {
  switch (type) {
    case "textchange": {
      return {
        ...state,
        message: payload.value,
      }
    }
    case "save": {
      const { items = [], message } = state

      return {
        ...state,
        items: [...items, { id: Date.now(), text: message }],
        message: "",
      }
    }
    case "remove": {
      return {
        ...state,
        items: state.items.filter(({ id }) => id !== payload.id),
      }
    }
    default: {
      return state
    }
  }
})
