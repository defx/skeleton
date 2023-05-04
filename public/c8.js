function mergeTemplateEvents(a, b) {
  a.types.push(...b.types);
  a.handlers = {
    ...a.handlers,
    ...b.handlers,
  };
  return a
}

function stars(n) {
  return new Array(n).fill("*").join("")
}

function looksLikeATemplate(o) {
  return o?.markup && o?.strings
}

function wrap(v) {
  if (looksLikeATemplate(v)) return `<!--#${v.id}-->${v.markup}`
  if (Array.isArray(v)) return `<!--{-->${v.map(wrap).join("")}<!--}-->`
  return `<!--{-->${v ?? ""}<!--}-->`
}

let handlerId = 0;

function html(strings, ...values) {
  const L = values.length - 1;

  const event = {
    types: [],
    handlers: {},
  };

  const markup = strings.reduce((markup, string, i) => {
    let str =
      markup +
      string.replace(/<\/[\n\s]*textarea[\n\s]*>/, "</textarea><!--&-->");

    if (i > L) return str

    if (looksLikeATemplate(values[i]?.[0])) {
      values[i].forEach((v) => mergeTemplateEvents(event, v.event));
    }

    const isElement = str.match(/<[^\/>]+$/);
    const isAttributeValue = str.match(/(\w+-?\w+)=['"]{1}([^'"]*)$/);

    if (isElement) {
      const startOpenTag = str.lastIndexOf("<");
      const placeholder = str.slice(0, startOpenTag).match(/<!--(\*+)-->$/);

      if (placeholder) {
        const n = placeholder[1].length;
        str =
          str
            .slice(0, startOpenTag)
            .replace(/<!--(\*+)-->$/, `<!--${stars(n + 1)}-->`) +
          str.slice(startOpenTag);
      } else {
        str = str.slice(0, startOpenTag) + `<!--*-->` + str.slice(startOpenTag);
      }

      if (isAttributeValue) {
        if (isAttributeValue[1].startsWith("on")) {
          const type = isAttributeValue[1].slice(2);
          event.types.push(type);
          let id = handlerId++;
          event.handlers[id] = values[i];
          str = str.replace(/\s(on[\w]+=['""'])$/, " data-$1");
          return str + id
        }

        return str + values[i]
      } else {
        const v = values[i];
        if (values[i]) {
          return str + `${v}`
        } else {
          return str
        }
      }
    }

    if (str.match(/<textarea[\s\n\r][^>]+>$/m)) {
      return str + values[i]
    }

    return str + wrap(values[i])
  }, "");

  return {
    markup,
    strings,
    values,
    event: {
      types: [...new Set(event.types)],
      handlers: event.handlers,
    },
    key(v) {
      this.id = v;
      return this
    },
  }
}

const first = (v) => v[0];

const last = (v) => v[v.length - 1];

const walk = (node, callback, deep = true) => {
  if (!node) return

  let v = callback(node);
  if (v === false || v === null) return
  if (v?.nodeName) return walk(v, callback, deep)

  if (deep) walk(node.firstChild, callback, deep);
  if (v === 1) return
  walk(node.nextSibling, callback, deep);
};

function templateNodeFromString(str) {
  let node = document.createElement("template");
  node.innerHTML = str.trim();
  return node
}

const isPrimitive = (v) => v === null || typeof v !== "object";

const isAttributeSentinel = (node) =>
  node.nodeType === Node.COMMENT_NODE && node.textContent.match(/\*+/);

const isTextAreaSentinel = (node) =>
  node.nodeType === Node.COMMENT_NODE && node.textContent.match("&");

const isOpenBrace = (node) =>
  node.nodeType === Node.COMMENT_NODE && node.textContent === "{";

const isCloseBrace = (node) =>
  node.nodeType === Node.COMMENT_NODE && node.textContent === "}";

const getBlocks = (sentinel) => {
  let blocks = [];
  walk(
    sentinel.nextSibling,
    (node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        if (isCloseBrace(node)) return null
        const id = node.textContent.match(/^#(.+)$/)?.[1];
        if (id) {
          blocks.push({ id, nodes: [] });
        }
      }

      last(blocks)?.nodes.push(node);
    },
    false
  );
  return blocks
};

function Block(v) {
  const { childNodes: nodes } = templateNodeFromString(
    `<!--#${v.id}-->${v.markup}`
  ).content.cloneNode(true);

  return {
    id: v.id,
    nodes: [...nodes],
  }
}

function getAttributes(p, markup) {
  return (
    markup
      .match(/<!--\*+-->(<[^>]+>)/g)
      [p]?.split(/--><[\w-]+\s/)[1]
      .match(/[^\t\n\f /><"'=]+=['"][^'"]+['"]|(?<!<)[^\t\n\f /><"'=]+/g) || []
  )
}

function attributeEntries(attributes) {
  return (
    attributes?.map((v) => {
      const [a, b] = v.split("=");
      return [a, b ? b.slice(1, -1) : ""]
    }) || []
  )
}

const update$1 = (templateResult, rootNode, finalNode) => {
  const { markup, values } = templateResult;
  let v = 0; // value count
  let p = 0; // placeholder count

  walk(rootNode, (node) => {
    if (isOpenBrace(node)) {
      const { nextSibling } = node;

      const value = values[v++];

      if (isPrimitive(value)) {
        if (nextSibling.textContent !== value) {
          nextSibling.textContent = value;
        }

        return
      } else if (Array.isArray(value)) {
        const blocks = getBlocks(node);

        const nextBlocks = value.map(({ id }, i) => {
          if (id !== undefined) {
            return blocks.find((block) => block.id == id) || Block(value[i])
          } else {
            return blocks[i] || Block(value[i])
          }
        });

        const removals = blocks.filter(
          (b, i) =>
            !(b.id !== undefined
              ? nextBlocks.find(({ id }) => id === b.id)
              : nextBlocks[i])
        );

        removals.forEach(({ nodes }) => nodes.forEach((node) => node.remove()));

        if (!nextBlocks.length) {
          return node.nextSibling
        }

        const lastNode = last(last(nextBlocks).nodes);
        let t = node;
        nextBlocks.forEach((block, i) => {
          const firstChild = first(block.nodes);
          if (t.nextSibling !== firstChild) {
            t.after(...block.nodes);
          }
          t = last(block.nodes);
          update$1(value[i], firstChild, t);
        });

        return lastNode.nextSibling
      }
      p++;
    } else if (isAttributeSentinel(node)) {
      const stars = node.textContent.match(/(\*+)/)?.[1].split("");
      const target = node.nextSibling;
      const newAttributes = attributeEntries(getAttributes(p, markup));

      newAttributes.forEach(([name, value]) => {
        if (name === "value") {
          target.value = value;
          return
        }

        if (target.hasAttribute(name)) {
          if (target.getAttribute(name) !== value) {
            target.setAttribute(name, value);
          }
        } else {
          target.setAttribute(name, value);
        }
      });

      for (const attr of target.attributes) {
        if (!newAttributes.find(([name]) => name === attr.name)) {
          target.removeAttribute(attr.name);
        }
      }

      v += stars.length;
      p++;
    } else if (isTextAreaSentinel(node)) {
      const value = values[v];
      const textarea = node.previousSibling;
      if (textarea.value !== value) {
        textarea.value = value;
      }
    }

    if (finalNode && node.isEqualNode(finalNode)) {
      return 1
    }
  });
};

const nodes = new WeakSet();
const isServer = typeof window === "undefined";
const eventListeners = new WeakMap();

function bindEvents(rootNode, templateResult) {
  const {
    event: { types = [], handlers = {} },
  } = templateResult;
  if (typeof window === "undefined") return
  const listeners = eventListeners.get(rootNode) || {};

  rootNode.$handlers = handlers;

  types.forEach((type) => {
    if (type in listeners) return

    listeners[type] = (e) => {
      const k = e.target.dataset[`on${type}`];
      rootNode.$handlers[k]?.(e);
    };
    rootNode.addEventListener(type, listeners[type]);
  });
  eventListeners.set(rootNode, listeners);
}

function render(templateResult, rootNode) {
  const { markup } = templateResult;
  if (isServer || !rootNode) return markup

  if (!nodes.has(rootNode)) {
    if (rootNode.innerHTML !== markup) {
      rootNode.innerHTML = markup;
    }
    nodes.add(rootNode);
  } else {
    update$1(templateResult, rootNode.firstChild);
  }
  bindEvents(rootNode, templateResult);
}

const subscribers = new Set();

let state = {};
let reducer = () => ({});
let middleware = [];
let resolveAsReady;
let ready = new Promise((resolve) => (resolveAsReady = resolve));

function getState() {
  return { ...state }
}

const debounce = (callback) => {
  let timeoutId = null;
  return (...args) => {
    window.cancelAnimationFrame(timeoutId);
    timeoutId = window.requestAnimationFrame(() => {
      callback.apply(null, args);
    });
  }
};

function dispatch(type, payload) {
  middleware.forEach((fn) => fn(type, payload, { getState, dispatch }));
  state = reducer(getState(), type, payload);
  update();
}

function subscribe(fn) {
  subscribers.add(fn);
}

function configure(r, m = []) {
  reducer = r;
  middleware = m;
  state = reducer();
  resolveAsReady();
}

const update = debounce(function publish() {
  for (const fn of subscribers.values()) {
    fn(getState());
  }
});

const define = (name, fn) => {
  if (customElements.get(name)) return

  customElements.define(
    name,
    class extends HTMLElement {
      async connectedCallback() {
        const update = (state) => render(fn(state, dispatch), this);
        await ready;
        update(getState());
        subscribe(update);
      }
    }
  );
};

export { configure, define, html, render, subscribe };
