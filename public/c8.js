function stars(n) {
  return new Array(n).fill("*").join("")
}

function value(v) {
  if (v) {
    if (v.hasOwnProperty("markup")) return `<!--#${v.id}-->${v.markup}`
    if (Array.isArray(v)) {
      return `<!--{-->${v.map(value).join("")}<!--}-->`
    }
  }

  return `<!--{-->${v}<!--}-->`
}

function html(strings, ...values) {
  const L = values.length - 1;
  const events = new Set();

  const markup = strings.reduce((markup, string, i) => {
    let str = markup + string;

    if (i > L) return str

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
          events.add(type);
          str = str.replace(/\s(on[\w]+=['""'])$/, " data-$1");
          return str + i
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

    return str + value(values[i])
  }, "");

  return Object.assign(markup, {
    markup,
    strings,
    values,
    events,
    key(v) {
      this.id = v;
      return this
    },
  })
}

const first = (v) => v[0];

const last = (v) => v[v.length - 1];

const walk = (node, callback, deep = true) => {
  if (!node) return

  let v = callback(node);
  if (v === false || v === null) return
  if (v?.nodeName) return walk(v, callback, deep)

  if (deep) walk(node.firstChild, callback, deep);
  walk(node.nextSibling, callback, deep);
};

function templateNodeFromString(str) {
  let node = document.createElement("template");
  node.innerHTML = str.trim();
  return node
}

const isTemplateResult = (v) => v?.hasOwnProperty("markup");

const isPrimitive = (v) => v === null || typeof v !== "object";

const isAttributeSentinel = (node) =>
  node.nodeType === Node.COMMENT_NODE && node.textContent.match(/\*+/);

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
          // return
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
  return markup
    .match(/<!--\*+-->(<[^>]+>)/g)
    .filter((v) => v)
    [p].split("-->")[1]
    .match(/[^\t\n\f /><"'=]+=['"][^'"]+['"]|(?<!<)[^\t\n\f /><"'=]+/g)
}

function attributeEntries(attributes) {
  return (
    attributes?.map((v) => {
      const [a, b] = v.split("=");
      return [a, b ? b.slice(1, -1) : ""]
    }) || []
  )
}

const update$1 = (templateResult, rootNode) => {
  const { markup, values } = templateResult;
  let v = 0; // value count
  let p = 0; // placeholder count

  walk(rootNode, (node) => {
    if (isOpenBrace(node)) {
      const { nextSibling } = node;

      const value = values[v++];

      if (isPrimitive(value)) {
        if (nextSibling.nodeType === Node.TEXT_NODE) {
          if (nextSibling.textContent !== value) {
            nextSibling.textContent = value;
          }
        }

        return
      } else if (Array.isArray(value) && isTemplateResult(value[0])) {
        const blocks = getBlocks(node);
        const nextBlocks = value.map(({ id }, i) => {
          if (id !== undefined) {
            return blocks.find((block) => block.id == id) || Block(value[i])
          } else {
            return blocks[i]
          }
        });
        const lastNode = last(last(nextBlocks).nodes);
        let t = node;
        nextBlocks.forEach((block, i) => {
          const firstChild = first(block.nodes);
          if (t.nextSibling !== firstChild) {
            t.after(...block.nodes);
          }
          update$1(value[i], firstChild);
          t = last(block.nodes);
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
    }
  });
};

const nodes = new WeakSet();
const eventListeners = new WeakMap();
const isServer = typeof window === "undefined";

function bindEvents(rootNode, events = [], values = []) {
  if (typeof window === "undefined") return
  rootNode.$values = values;
  const types = [...events];
  const listeners = eventListeners.get(rootNode) || {};
  types.forEach((type) => {
    if (type in listeners) return
    listeners[type] = (e) => {
      const index = +e.target.dataset[`on${type}`];
      const fn = rootNode.$values[index];
      fn?.(e);
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
  bindEvents(rootNode, templateResult.events, templateResult.values);
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

export { configure, define, html, render };
