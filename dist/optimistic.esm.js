// resources/js/store.js
var sequence = 0;
function isApplied(entry) {
  if (entry.status === "pending" || entry.status === "awaiting")
    return true;
  return entry.status === "failed" && !!entry.options.retry;
}
function isUndoable(entry) {
  return entry.status === "pending" && entry.gates.has("undo");
}
function createStore() {
  let entries = [];
  let byAction = new WeakMap;
  let listeners = new Set;
  let store = {
    get entries() {
      return entries;
    },
    add(entry) {
      entry.seq = ++sequence;
      entry.gates = entry.gates || new Set;
      entry.status = entry.status || "pending";
      entry.error = entry.error ?? null;
      entries.push(entry);
      return entry;
    },
    attach(action, entry) {
      byAction.set(action, entry);
      entry.action = action;
    },
    forAction(action) {
      return byAction.get(action) || null;
    },
    find(id) {
      return entries.find((entry) => entry.id === id) || null;
    },
    remove(entry) {
      let index = entries.indexOf(entry);
      if (index !== -1)
        entries.splice(index, 1);
      entry.removed = true;
    },
    forComponent(component) {
      return entries.filter((entry) => entry.component === component);
    },
    applied(component) {
      return entries.filter((entry) => entry.component === component && isApplied(entry));
    },
    linkedTo(entry) {
      return entries.filter((candidate) => candidate.linkedTo === entry.id);
    },
    clear() {
      entries = [];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(reason) {
      listeners.forEach((listener) => listener(reason, entries));
    }
  };
  return store;
}

// resources/js/util.js
function uuid() {
  let bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ts = Date.now();
  for (let i = 5;i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = bytes[6] & 15 | 112;
  bytes[8] = bytes[8] & 63 | 128;
  let hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isObjecty(value) {
  return value !== null && typeof value === "object";
}
function clone(value) {
  if (Array.isArray(value))
    return value.map(clone);
  if (isObject(value)) {
    let result = {};
    for (let key of Object.keys(value))
      result[key] = clone(value[key]);
    return result;
  }
  return value;
}
function equal(a, b) {
  if (a === b)
    return true;
  if (!isObjecty(a) || !isObjecty(b))
    return false;
  if (Array.isArray(a) !== Array.isArray(b))
    return false;
  let aKeys = Object.keys(a);
  let bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length)
    return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
}
function sameKey(a, b) {
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  return String(a) === String(b);
}
function diff(from, to, path = [], changes = []) {
  if (equal(from, to))
    return changes;
  let bothObjects = isObject(from) && isObject(to);
  let sameLengthArrays = Array.isArray(from) && Array.isArray(to) && from.length === to.length;
  if (bothObjects) {
    for (let key of Object.keys(to)) {
      if (!Object.prototype.hasOwnProperty.call(from, key)) {
        changes.push({ path: [...path, key], value: clone(to[key]) });
      } else {
        diff(from[key], to[key], [...path, key], changes);
      }
    }
    for (let key of Object.keys(from)) {
      if (!Object.prototype.hasOwnProperty.call(to, key)) {
        changes.push({ path: [...path, key], remove: true });
      }
    }
    return changes;
  }
  if (sameLengthArrays) {
    to.forEach((item, index) => diff(from[index], item, [...path, index], changes));
    return changes;
  }
  changes.push({ path, value: clone(to) });
  return changes;
}
function patch(target, changes) {
  for (let change of changes) {
    if (change.path.length === 0)
      continue;
    let parent = target;
    let segments = change.path.slice(0, -1);
    for (let segment of segments) {
      if (!isObjecty(parent[segment]))
        parent[segment] = {};
      parent = parent[segment];
    }
    let last = change.path[change.path.length - 1];
    if (change.remove) {
      if (Array.isArray(parent))
        parent.splice(last, 1);
      else
        delete parent[last];
    } else {
      parent[last] = clone(change.value);
    }
  }
  return target;
}
var compiled = new Map;
function compile(args, body) {
  let cacheKey = args.join(",") + "\x00" + body;
  if (!compiled.has(cacheKey)) {
    compiled.set(cacheKey, new Function(...args, body));
  }
  return compiled.get(cacheKey);
}
function evaluateExpression(expression, scope) {
  let names = Object.keys(scope).filter(isIdentifier);
  return compile(names, `return (${expression})`)(...names.map((name) => scope[name]));
}
function isIdentifier(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
function toArray(value) {
  if (value === null || value === undefined)
    return [];
  return Array.isArray(value) ? value : [value];
}

// resources/js/order.js
function hasOrder(spec) {
  return !!spec && (!!spec.js || Array.isArray(spec.order) && spec.order.length > 0);
}
function orderFields(spec) {
  if (!spec)
    return [];
  if (spec.js)
    return toArray(spec.fields);
  return (spec.order || []).map(([field]) => field);
}
function sortKey(spec, item) {
  if (spec.js) {
    try {
      return toArray(evaluateExpression(spec.js, { item }));
    } catch (error) {
      console.error("[optimistic] Sort expression failed:", spec.js, error);
      return [];
    }
  }
  return spec.order.map(([field]) => item?.[field]);
}
function directions(spec) {
  if (spec.js)
    return [];
  return spec.order.map(([, direction]) => String(direction).toLowerCase() === "desc" ? -1 : 1);
}
function normalize(value) {
  if (typeof value === "boolean")
    return value ? 1 : 0;
  return value;
}
function compareValues(a, b) {
  a = normalize(a);
  b = normalize(b);
  let aMissing = a === null || a === undefined;
  let bMissing = b === null || b === undefined;
  if (aMissing || bMissing)
    return aMissing === bMissing ? 0 : aMissing ? -1 : 1;
  if (typeof a === "number" && typeof b === "number")
    return a === b ? 0 : a < b ? -1 : 1;
  a = String(a);
  b = String(b);
  return a === b ? 0 : a < b ? -1 : 1;
}
function comparator(spec) {
  let dirs = directions(spec);
  return (a, b) => {
    let length = Math.max(a.length, b.length);
    for (let i = 0;i < length; i++) {
      let result = compareValues(a[i], b[i]) * (dirs[i] ?? 1);
      if (result !== 0)
        return result;
    }
    return 0;
  };
}
function insertionIndex(spec, keys, key) {
  let compare = comparator(spec);
  let index = keys.findIndex((existing) => compare(existing, key) > 0);
  return index === -1 ? keys.length : index;
}

// resources/js/replay.js
function getPath(object, path) {
  return String(path).split(".").reduce((value, segment) => value === null || value === undefined ? undefined : value[segment], object);
}
function keyFieldOf(lists, list) {
  return lists?.[list]?.key || "id";
}
function replay(base, entries, lists = {}) {
  let draft = clone(base);
  for (let entry of entries) {
    for (let op of entry.ops) {
      try {
        applyOp(draft, op, entry, lists, base);
      } catch (error) {
        console.error(`[optimistic] Optimistic update for "${entry.method}" failed and was skipped:`, error);
      }
    }
  }
  return draft;
}
function applyOp(draft, op, entry, lists, base = draft) {
  if (op.type === "js")
    return applyJs(draft, op, entry);
  let items = getPath(draft, op.list);
  if (!Array.isArray(items))
    return;
  let spec = lists[op.list] || {};
  let keyField = keyFieldOf(lists, op.list);
  if (op.type === "create")
    return applyCreate(draft, items, op, spec, keyField, lists, base);
  if (op.type === "update")
    return applyUpdate(items, op, spec, keyField);
  if (op.type === "delete")
    return applyDelete(items, op, keyField);
}
function applyJs(draft, op, entry) {
  let scope = { ...entry.named, $id: entry.key, $now: entry.now, $params: entry.params };
  let names = Object.keys(scope).filter(isIdentifier);
  compile(["$wire", ...names], op.code)(draft, ...names.map((name) => scope[name]));
}
function findAnywhere(draft, lists, key, preferred) {
  let names = [preferred, ...Object.keys(lists).filter((name) => name !== preferred)];
  for (let name of names) {
    let items = getPath(draft, name);
    if (!Array.isArray(items))
      continue;
    let keyField = keyFieldOf(lists, name);
    let index = items.findIndex((item) => isObject(item) && sameKey(item[keyField], key));
    if (index !== -1)
      return { items, index, item: items[index] };
  }
  return null;
}
function position(items, item, spec) {
  if (hasOrder(spec)) {
    return insertionIndex(spec, items.map((existing) => sortKey(spec, existing)), sortKey(spec, item));
  }
  return spec.insert === "start" ? 0 : items.length;
}
function applyCreate(draft, items, op, spec, keyField, lists, base) {
  let item = clone(op.item);
  if (op.from !== null && op.from !== undefined) {
    let source = findAnywhere(draft, lists, op.from, op.list);
    if (source) {
      item = { ...clone(source.item), ...item };
      if (op.move)
        source.items.splice(source.index, 1);
    } else {
      let original = findAnywhere(base, lists, op.from, op.list);
      if (original)
        item = { ...clone(original.item), ...item };
    }
  }
  item[keyField] = op.key;
  let existing = items.find((candidate) => isObject(candidate) && sameKey(candidate[keyField], op.key));
  if (existing) {
    Object.assign(existing, item);
    return;
  }
  items.splice(position(items, item, spec), 0, item);
}
function applyUpdate(items, op, spec, keyField) {
  let targets = items.filter((item) => isObject(item) && (op.keys === null || op.keys.some((key) => sameKey(item[keyField], key))));
  let touchesOrder = orderFields(spec).some((field) => Object.prototype.hasOwnProperty.call(op.fields, field));
  let reorder = hasOrder(spec) && touchesOrder && !spec.stable;
  for (let item of targets) {
    Object.assign(item, clone(op.fields));
    if (reorder) {
      items.splice(items.indexOf(item), 1);
      items.splice(position(items, item, spec), 0, item);
    }
  }
}
function applyDelete(items, op, keyField) {
  for (let index = items.length - 1;index >= 0; index--) {
    let item = items[index];
    if (isObject(item) && op.keys.some((key) => sameKey(item[keyField], key)))
      items.splice(index, 1);
  }
}
function overlay(item, key, list, entries, lists) {
  let result = clone(item);
  let keyField = keyFieldOf(lists, list);
  let touched = false;
  for (let entry of entries) {
    for (let op of entry.ops) {
      if (op.list !== list)
        continue;
      if (op.type === "update" && (op.keys === null || op.keys.some((candidate) => sameKey(candidate, key)))) {
        Object.assign(result, clone(op.fields));
        touched = true;
      }
      if (op.type === "create" && sameKey(op.key, key)) {
        Object.assign(result, clone(op.item), { [keyField]: op.key });
        touched = true;
      }
    }
  }
  return { item: result, touched };
}

// resources/js/dom.js
var PREFIX = "wire:optimistic";
var STRUCTURAL = ["list", "group", "row", "create", "key"];
var INTERACTIVE = "button, input, select, textarea, a[href], [wire\\:click], [x-on\\:click]";
function directivesOf(el) {
  let directives = [];
  for (let attribute of Array.from(el.attributes || [])) {
    if (attribute.name !== PREFIX && !attribute.name.startsWith(PREFIX + "."))
      continue;
    let modifiers = attribute.name.split(".").slice(1);
    directives.push({ name: attribute.name, modifiers, type: modifiers[0] || null, value: attribute.value });
  }
  return directives;
}
function directive(el, type) {
  return directivesOf(el).find((candidate) => candidate.type === type) || null;
}
function isRow(el) {
  return !!el && el.nodeType === 1 && (el.hasAttribute(`${PREFIX}.row`) || !!el.__optimisticClone);
}
var KEYED = "[wire\\:key], [wire\\:optimistic\\.key]";
function isKeyed(el) {
  return el.hasAttribute("wire:key") || el.hasAttribute(`${PREFIX}.key`);
}
function readKey(el, evaluate) {
  if (el.hasAttribute("wire:key"))
    return el.getAttribute("wire:key");
  let expression = el.getAttribute(`${PREFIX}.key`);
  if (expression === null || !evaluate)
    return null;
  let value = evaluate(el, expression);
  return value === null || value === undefined ? null : String(value);
}
function belongsTo(component, el) {
  return el.closest("[wire\\:id]") === component.el;
}
function parseRow(el) {
  let raw = el.getAttribute(`${PREFIX}.row`);
  if (el.__optimisticParsed && el.__optimisticParsed.raw === raw)
    return el.__optimisticParsed.value;
  let value = {};
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("[optimistic] Invalid wire:optimistic.row JSON:", raw);
  }
  el.__optimisticParsed = { raw, value };
  return value;
}
function setAttribute(el, name, value) {
  if (value === null || value === undefined) {
    if (el.hasAttribute(name))
      el.removeAttribute(name);
    return;
  }
  if (el.getAttribute(name) !== value)
    el.setAttribute(name, value);
}
function setHidden(el, reason, hidden) {
  let reasons = el.__optimisticHide || (el.__optimisticHide = new Set);
  if (hidden)
    reasons.add(reason);
  else
    reasons.delete(reason);
  if (reasons.size > 0) {
    if (el.style.getPropertyValue("display") !== "none") {
      if (el.__optimisticDisplay === undefined)
        el.__optimisticDisplay = el.style.getPropertyValue("display");
      el.style.setProperty("display", "none", "important");
    }
  } else if (el.__optimisticDisplay !== undefined) {
    if (el.__optimisticDisplay)
      el.style.setProperty("display", el.__optimisticDisplay);
    else
      el.style.removeProperty("display");
    if (el.getAttribute("style") === "")
      el.removeAttribute("style");
    delete el.__optimisticDisplay;
  }
}
function setClasses(el, source, classes, active) {
  let sources = el.__optimisticClassSources || (el.__optimisticClassSources = new Map);
  let owned = el.__optimisticOwnedClasses || (el.__optimisticOwnedClasses = new Set);
  if (active && classes.length)
    sources.set(source, classes);
  else
    sources.delete(source);
  let desired = new Set([...sources.values()].flat());
  for (let name of desired) {
    if (!el.classList.contains(name)) {
      el.classList.add(name);
      owned.add(name);
    }
  }
  for (let name of [...owned]) {
    if (!desired.has(name)) {
      el.classList.remove(name);
      owned.delete(name);
    }
  }
}
function splitClasses(value) {
  if (Array.isArray(value))
    return value.flatMap(splitClasses);
  if (value && typeof value === "object") {
    return Object.entries(value).filter(([, on]) => on).flatMap(([names]) => splitClasses(names));
  }
  return String(value ?? "").split(/\s+/).filter(Boolean);
}
function setText(el, value, active) {
  let state = el.__optimisticText || (el.__optimisticText = { original: el.textContent, written: null });
  if (state.written === null || el.textContent !== state.written)
    state.original = el.textContent;
  if (active) {
    let text = value === null || value === undefined ? "" : String(value);
    if (el.textContent !== text)
      el.textContent = text;
    state.written = text;
  } else if (state.written !== null) {
    if (el.textContent !== state.original)
      el.textContent = state.original;
    state.written = null;
  }
}
var PROPERTIES = ["value", "checked", "selected", "disabled", "indeterminate"];
function setBinding(el, attribute, value) {
  let bound = el.__optimisticBound || (el.__optimisticBound = new Map);
  if (attribute === "class") {
    setClasses(el, "bind", splitClasses(value), true);
    return;
  }
  let serialized = JSON.stringify(value === undefined ? null : value);
  if (bound.has(attribute) && bound.get(attribute) === serialized)
    return;
  bound.set(attribute, serialized);
  if (PROPERTIES.includes(attribute)) {
    let next = attribute === "value" ? value === null || value === undefined ? "" : String(value) : !!value;
    if (el[attribute] !== next)
      el[attribute] = next;
    if (attribute !== "value")
      setAttribute(el, attribute, next ? "" : null);
    return;
  }
  setAttribute(el, attribute, value === false || value === null || value === undefined ? null : value === true ? "" : String(value));
}
function replaceAttribute(el, name, value) {
  for (let attribute of Array.from(el.attributes)) {
    if (attribute.name === name)
      el.removeAttributeNode(attribute);
  }
  el.setAttribute(name, value);
}
function detachComponents(el) {
  el.querySelectorAll("[wire\\:id]").forEach((child) => {
    child.removeAttribute("wire:id");
    child.removeAttribute("wire:snapshot");
    child.removeAttribute("wire:effects");
  });
  return el;
}
function copyOf(el) {
  let template = el.ownerDocument.createElement("template");
  template.innerHTML = el.outerHTML;
  return template.content.firstElementChild;
}
function createDom({ Alpine, store, configOf }) {
  let evaluateKey = (el, expression) => Alpine.evaluate(el, expression);
  let keyOf = (el) => readKey(el, evaluateKey);
  function listsOf(component) {
    return configOf(component)?.lists || {};
  }
  function containerOf(component, row) {
    let parent = row.parentElement;
    if (!parent || !belongsTo(component, parent))
      return null;
    return directive(parent, "list") ? parent : null;
  }
  function listNameOf(component, row) {
    let container = containerOf(component, row);
    return container ? directive(container, "list").value : null;
  }
  function targets(entry, key, list) {
    return entry.targets.some((target) => (list === null || target.list === list) && (target.all || sameKey(target.key, key)));
  }
  function rowEntries(component, key, list) {
    return store.forComponent(component).filter((entry) => targets(entry, key, list));
  }
  function rowItem(component, row) {
    let list = listNameOf(component, row) ?? row.__optimisticList ?? null;
    let base = parseRow(row);
    if (list === null)
      return { item: base, touched: false, fields: new Set };
    let applied = store.applied(component);
    let result = overlay(base, keyOf(row), list, applied, listsOf(component));
    let fields = new Set;
    for (let entry of applied) {
      for (let op of entry.ops) {
        if (op.list !== list)
          continue;
        if (op.type === "update" && (op.keys === null || op.keys.some((key) => sameKey(key, keyOf(row)))))
          Object.keys(op.fields).forEach((field) => fields.add(field));
      }
    }
    return { ...result, fields };
  }
  function makeElement(component, container, entry, op, item) {
    let template = Array.from(container.children).find((child) => {
      if (child.tagName !== "TEMPLATE")
        return false;
      let create = directive(child, "create");
      return create && (!create.value || create.value === entry.method);
    });
    let el = takeDetached(component, entry.id, op.key);
    if (el) {
      setAttribute(el, `${PREFIX}.row`, JSON.stringify(item));
      container.insertBefore(el, template || null);
      return el;
    }
    if (template) {
      let content = template.content.firstElementChild;
      el = content ? content.cloneNode(true) : null;
    } else if (op.from !== null && op.from !== undefined) {
      let source = ownRows(component).find((row) => sameKey(keyOf(row), op.from) && !row.__optimisticClone);
      el = source ? copyOf(source) : null;
    }
    if (!el)
      return null;
    detachComponents(el);
    el.removeAttribute("style");
    replaceAttribute(el, "wire:key", op.key);
    replaceAttribute(el, `${PREFIX}.row`, JSON.stringify(item));
    el.__optimisticClone = entry.id;
    el.__optimisticList = op.list;
    el.__optimisticFromTemplate = !!template;
    if (template)
      container.insertBefore(el, template);
    else
      container.appendChild(el);
    return el;
  }
  function detach(component) {
    let pool = component.__optimisticDetached = [];
    for (let row of ownRows(component)) {
      if (!row.__optimisticClone)
        continue;
      pool.push(row);
      row.parentNode.removeChild(row);
    }
  }
  function takeDetached(component, entryId, key) {
    let pool = component.__optimisticDetached || [];
    let index = pool.findIndex((el) => el.__optimisticClone === entryId && sameKey(keyOf(el), key));
    return index === -1 ? null : pool.splice(index, 1)[0];
  }
  function ownElements(component) {
    return Array.from(component.el.querySelectorAll("*")).filter((el) => belongsTo(component, el));
  }
  function ownRows(component) {
    return ownElements(component).filter(isRow);
  }
  function containers(component) {
    return ownElements(component).filter((el) => directive(el, "list"));
  }
  function groupOf(container) {
    let group = directive(container, "group");
    return group ? group.value : null;
  }
  function rowsIn(container) {
    return Array.from(container.children).filter(isRow);
  }
  function reconcileContainer(component, container, allContainers) {
    let list = directive(container, "list").value;
    let stable = directive(container, "list").modifiers.includes("stable");
    let spec = listsOf(component)[list] || {};
    let groupBy = spec.groupBy || null;
    let group = groupOf(container);
    let applied = store.applied(component);
    let dirty = new Set;
    let fitsHere = (item) => !groupBy || group === null || String(item?.[groupBy]) === String(group);
    for (let entry of applied) {
      for (let op of entry.ops) {
        if (op.type !== "create" || op.list !== list)
          continue;
        let { item } = overlay(op.item, op.key, list, applied, listsOf(component));
        if (op.from !== null && op.from !== undefined) {
          let source = ownRows(component).find((row) => sameKey(keyOf(row), op.from) && !row.__optimisticClone);
          if (source)
            item = { ...parseRow(source), ...item };
        }
        item[spec.key || "id"] = op.key;
        if (!fitsHere(item))
          continue;
        let existing = rowsIn(container).find((row) => sameKey(keyOf(row), op.key));
        if (existing && !existing.__optimisticClone)
          continue;
        if (existing) {
          setAttribute(existing, `${PREFIX}.row`, JSON.stringify(item));
          dirty.add(existing);
          continue;
        }
        let el = makeElement(component, container, entry, op, item);
        if (el)
          dirty.add(el);
      }
    }
    if (groupBy && group !== null) {
      for (let row of rowsIn(container)) {
        if (row.__optimisticClone)
          continue;
        let owner = applied.filter((entry) => entry.ops.some((op) => op.type === "update" && op.list === list && Object.prototype.hasOwnProperty.call(op.fields, groupBy) && (op.keys === null || op.keys.some((key) => sameKey(key, keyOf(row)))))).pop();
        let { item } = rowItem(component, row);
        let target = String(item[groupBy]);
        let movedOut = !!owner && target !== String(group);
        setHidden(row, "moved", movedOut);
        if (!movedOut)
          continue;
        let destination = allContainers.find((other) => other !== container && directive(other, "list").value === list && String(groupOf(other)) === target);
        if (!destination)
          continue;
        let mirror = rowsIn(destination).find((candidate) => sameKey(keyOf(candidate), keyOf(row)));
        if (mirror && !mirror.__optimisticClone)
          continue;
        if (!mirror) {
          mirror = takeDetached(component, owner.id, keyOf(row));
          if (mirror) {
            let template = Array.from(destination.children).find((child) => child.tagName === "TEMPLATE");
            destination.insertBefore(mirror, template || null);
          }
        }
        if (!mirror) {
          mirror = detachComponents(copyOf(row));
          mirror.__optimisticClone = owner.id;
          mirror.__optimisticMirrorOf = row;
          mirror.__optimisticList = list;
          mirror.removeAttribute("style");
          let template = Array.from(destination.children).find((child) => child.tagName === "TEMPLATE");
          destination.insertBefore(mirror, template || null);
        }
        mirror.__optimisticClone = owner.id;
        mirror.__optimisticMirrorOf = row;
        setAttribute(mirror, `${PREFIX}.row`, JSON.stringify(item));
      }
    }
    for (let row of rowsIn(container)) {
      if (!row.__optimisticClone)
        continue;
      let entry = store.find(row.__optimisticClone);
      let { item } = rowItem(component, row);
      let stale = !entry || !isApplied(entry) || !fitsHere(item);
      if (row.__optimisticMirrorOf) {
        let source = row.__optimisticMirrorOf;
        stale = stale || !source.isConnected || String(rowItem(component, source).item[groupBy]) !== String(group);
      }
      let duplicate = rowsIn(container).some((other) => other !== row && !other.__optimisticClone && sameKey(keyOf(other), keyOf(row)));
      if (stale || duplicate) {
        row.remove();
        continue;
      }
      dirty.add(row);
    }
    if (!hasOrder(spec))
      return;
    for (let row of rowsIn(container)) {
      if (row.__optimisticClone)
        continue;
      if (stable || spec.stable)
        continue;
      let { fields } = rowItem(component, row);
      if (orderFields(spec).some((field) => fields.has(field)))
        dirty.add(row);
    }
    let rows = rowsIn(container);
    let serverOrder = (row) => row.__optimisticServerIndex ?? Number.MAX_SAFE_INTEGER;
    let desired = rows.filter((row) => !dirty.has(row)).sort((a, b) => serverOrder(a) - serverOrder(b));
    let keyFor = (row) => sortKey(spec, rowItem(component, row).item);
    for (let row of rows.filter((row2) => dirty.has(row2))) {
      let index = insertionIndex(spec, desired.map(keyFor), keyFor(row));
      desired.splice(index, 0, row);
    }
    if (!rows.length)
      return;
    let anchor = rows[rows.length - 1].nextElementSibling;
    for (let index = desired.length - 1;index >= 0; index--) {
      let row = desired[index];
      if (row.nextElementSibling !== anchor)
        container.insertBefore(row, anchor);
      anchor = row;
    }
  }
  function stateFor(entries) {
    return {
      pending: entries.some((entry) => entry.status === "pending" || entry.status === "awaiting"),
      failed: entries.some((entry) => entry.status === "failed"),
      undoable: entries.some(isUndoable),
      any: entries.length > 0
    };
  }
  function rowOf(component, el) {
    let row = el.closest(KEYED);
    if (!row || row === component.el || !belongsTo(component, row))
      return null;
    return row;
  }
  function contextFor(component, el) {
    let row = rowOf(component, el);
    if (row) {
      let list = listNameOf(component, row) ?? row.__optimisticList ?? null;
      let key = keyOf(row);
      let entries2 = rowEntries(component, key, list);
      let applied = entries2.filter(isApplied);
      let { item, touched, fields } = isRow(row) ? rowItem(component, row) : { item: null, touched: false, fields: new Set };
      let matches = (op) => (list === null || op.list === list) && (op.keys === null || op.keys.some((candidate) => sameKey(candidate, key)));
      return {
        row,
        item,
        fields,
        touched,
        entries: entries2,
        state: {
          ...stateFor(entries2),
          removing: applied.some((entry) => entry.ops.some((op) => op.type === "delete" && matches(op)) || entry.hideEls.includes(row)),
          created: !!row.__optimisticClone || applied.some((entry) => entry.ops.some((op) => op.type === "create" && sameKey(op.key, key))),
          updating: applied.some((entry) => entry.ops.some((op) => op.type === "update" && matches(op)))
        }
      };
    }
    let all = store.forComponent(component);
    let entries = all;
    for (let node = el;node && node !== component.el; node = node.parentElement) {
      let triggered = all.filter((entry) => entry.trigger && node.contains(entry.trigger));
      if (triggered.length) {
        entries = triggered;
        break;
      }
      if (node.matches(INTERACTIVE) || node.querySelector(INTERACTIVE)) {
        entries = [];
        break;
      }
    }
    let undoable = all.some(isUndoable);
    return { row: null, item: null, fields: new Set, touched: false, entries, all, state: { ...stateFor(entries), undoable, removing: false, created: false, updating: false } };
  }
  function evaluate(el, expression, item) {
    return Alpine.evaluate(el, expression, { scope: { $item: item } });
  }
  function applyDirectives(component, el) {
    let directives = directivesOf(el).filter((candidate) => !STRUCTURAL.includes(candidate.type));
    let keyed = el !== component.el && isKeyed(el);
    if (!directives.length && !keyed)
      return;
    let context = contextFor(component, el);
    if (keyed && context.row === el) {
      let { state } = context;
      let marker = state.failed ? "failed" : state.pending ? "pending" : null;
      setAttribute(el, "data-optimistic", marker);
      let deleted = store.applied(component).some((entry) => entry.ops.some((op) => op.type === "delete" && op.keys.some((key) => sameKey(key, keyOf(el))) && (op.list === listNameOf(component, el) || listNameOf(component, el) === null)) || entry.hideEls.includes(el));
      if (isRow(el))
        setHidden(el, "removed", deleted);
    }
    for (let { type, modifiers, value } of directives) {
      if (type === "class") {
        let state = modifiers[1] || "pending";
        setClasses(el, "state:" + state, splitClasses(value), !!context.state[state]);
      }
      if (type === "show") {
        let visible = modifiers[1] ? !!context.state[modifiers[1]] : !!evaluate(el, value, context.item);
        setHidden(el, "show", !visible);
      }
      if (type === "text" && context.row) {
        let active = !!context.row.__optimisticClone || context.fields.has(value.split(".")[0]);
        setText(el, getPath(context.item || {}, value), active);
      }
      if (type === "bind" && modifiers[1]) {
        setBinding(el, modifiers[1], evaluate(el, value, context.item));
      }
    }
  }
  function markTriggers(component) {
    let marked = component.__optimisticTriggers || (component.__optimisticTriggers = new Set);
    let entries = store.forComponent(component).filter((entry) => entry.trigger);
    let now = new Map;
    for (let entry of entries) {
      let state = entry.status === "failed" ? "failed" : "pending";
      if (now.get(entry.trigger) !== "failed")
        now.set(entry.trigger, state);
    }
    for (let el of marked) {
      if (!now.has(el)) {
        setAttribute(el, "data-optimistic", null);
        marked.delete(el);
      }
    }
    for (let [el, state] of now) {
      if (isRow(el))
        continue;
      setAttribute(el, "data-optimistic", state);
      marked.add(el);
    }
  }
  function recordServerOrder(component, force = false) {
    for (let container of containers(component)) {
      rowsIn(container).forEach((row, index) => {
        if (row.__optimisticClone)
          return;
        if (force || row.__optimisticServerIndex === undefined)
          row.__optimisticServerIndex = index;
      });
    }
  }
  function reconcile(component) {
    if (!component.el || !component.el.isConnected)
      return;
    recordServerOrder(component);
    let all = containers(component);
    all.forEach((container) => reconcileContainer(component, container, all));
    component.__optimisticDetached = [];
    for (let entry of store.forComponent(component)) {
      for (let el of entry.hideEls)
        setHidden(el, "removed", isApplied(entry));
    }
    ownElements(component).forEach((el) => applyDirectives(component, el));
    markTriggers(component);
    component.__optimisticPreviews?.forEach((preview) => preview.reconcile());
  }
  function release(component, entry) {
    ownRows(component).forEach((row) => {
      if (row.__optimisticClone !== entry.id)
        return;
      delete row.__optimisticClone;
      delete row.__optimisticMirrorOf;
    });
  }
  function adoptServerContent(component) {
    recordServerOrder(component, true);
    for (let el of ownElements(component)) {
      if (el.__optimisticText)
        el.__optimisticText = { original: el.textContent, written: null };
    }
  }
  return { reconcile, release, detach, adoptServerContent, rowItem, rowOf, contextFor, isRow, keyOf };
}

// resources/js/plugin.js
var defaults = {
  timeout: 30000,
  warnOnUnload: true,
  linkTimeout: 5000,
  failedTtl: 0,
  handleErrors: true,
  maxBurst: 100
};
function install(Livewire, Alpine, options = {}) {
  let config = { ...defaults, ...globalThis.optimisticConfig || {}, ...options };
  let store = createStore();
  let version = Alpine.reactive({ value: 0 });
  let states = new WeakMap;
  let scheduled = new Set;
  let configOf = (component) => component?.snapshot?.memo?.optimistic || null;
  let dom = createDom({ Alpine, store, configOf });
  let keyOf = dom.keyOf;
  function setup(component, force = false) {
    if (states.has(component))
      return states.get(component);
    let cfg = configOf(component) || (force ? {} : null);
    if (!cfg)
      return null;
    let data = clone(cfg.data || {});
    let state = {
      server: clone(component.canonical),
      visible: clone(component.canonical),
      exposedServer: data,
      exposedVisible: clone(data),
      exposed: Alpine.reactive(clone(data))
    };
    states.set(component, state);
    wrapWire(component, state);
    watchUploads(component);
    return state;
  }
  function wrapWire(component, state) {
    let original = component.$wire;
    let isExposed = (property) => typeof property === "string" && Object.prototype.hasOwnProperty.call(state.exposed, property) && !Object.prototype.hasOwnProperty.call(component.reactive, property);
    let proxy = new Proxy({}, {
      get(target, property) {
        if (isExposed(property))
          return state.exposed[property];
        return original[property];
      },
      set(target, property, value) {
        if (isExposed(property))
          state.exposed[property] = value;
        else
          original[property] = value;
        return true;
      }
    });
    component.$wire = proxy;
    component.el.$wire = proxy;
  }
  function teardown(component) {
    for (let entry of store.forComponent(component)) {
      clearTimeout(entry.timer);
      clearTimeout(entry.undoTimer);
      clearTimeout(entry.awaitTimer);
      clearTimeout(entry.ttlTimer);
      store.remove(entry);
    }
    states.delete(component);
    notify();
  }
  function recompute(component, synced = false) {
    let state = states.get(component);
    if (!state)
      return;
    let lists = configOf(component)?.lists || {};
    let entries = store.applied(component);
    let base = { ...clone(state.exposedServer), ...clone(state.server) };
    let visible = replay(base, entries, lists);
    let nextReal = {};
    for (let key of Object.keys(state.server))
      nextReal[key] = visible[key];
    let nextExposed = {};
    for (let key of Object.keys(state.exposedServer)) {
      if (!Object.prototype.hasOwnProperty.call(state.server, key))
        nextExposed[key] = visible[key];
    }
    let changes = diff(synced ? state.server : state.visible, nextReal);
    if (changes.length) {
      patch(component.canonical, changes);
      patch(component.reactive, changes);
    }
    state.visible = nextReal;
    let exposedChanges = diff(state.exposedVisible, nextExposed);
    if (exposedChanges.length)
      patch(state.exposed, exposedChanges);
    state.exposedVisible = nextExposed;
  }
  function refresh(component) {
    recompute(component);
    dom.reconcile(component);
    afterAlpine(component);
    notify();
  }
  function afterAlpine(component) {
    Alpine.nextTick(() => {
      if (states.has(component))
        dom.reconcile(component);
    });
  }
  let burst = 0;
  let burstReset = null;
  function schedule(component) {
    if (scheduled.has(component))
      return;
    scheduled.add(component);
    burst++;
    if (!burstReset)
      burstReset = setTimeout(() => {
        burst = 0;
        burstReset = null;
      });
    let run = () => {
      scheduled.delete(component);
      if (states.has(component))
        dom.reconcile(component);
    };
    if (burst > config.maxBurst)
      setTimeout(run, 16);
    else
      queueMicrotask(run);
  }
  function emit(type, entry, extra = {}) {
    globalThis.dispatchEvent?.(new CustomEvent("optimistic:event", { detail: { type, entry: describe(entry), ...extra } }));
  }
  function notify() {
    version.value++;
    store.notify();
    globalThis.dispatchEvent?.(new CustomEvent("optimistic:change", { detail: { entries: store.entries } }));
  }
  let interaction = null;
  for (let type of ["click", "submit", "change", "input", "keydown"]) {
    globalThis.document?.addEventListener(type, (event) => {
      interaction = event.target;
      setTimeout(() => {
        if (interaction === event.target)
          interaction = null;
      });
    }, true);
  }
  function originOf(component, action) {
    let el = action.origin?.el || interaction;
    return el && el.nodeType === 1 && component.el.contains(el) ? el : null;
  }
  function evaluateWith(expressions, scope) {
    let values = {};
    for (let [field, expression] of Object.entries(expressions || {})) {
      try {
        values[field] = evaluateExpression(expression, scope);
      } catch (error) {
        console.error(`[optimistic] Could not evaluate "${expression}" for "${field}":`, error);
        values[field] = null;
      }
    }
    return values;
  }
  function without(object, keys) {
    let result = { ...object };
    keys.forEach((key) => delete result[key]);
    return result;
  }
  function resolveOps(component, entry, cfg) {
    let lists = configOf(component)?.lists || {};
    let scope = { ...entry.named, $id: entry.key, $now: entry.now, $wire: component.$wire };
    return cfg.ops.map((op) => {
      if (op.type === "js")
        return { type: "js", code: op.code };
      let keyParam = op.key;
      let keyValue = keyParam ? entry.named[keyParam] : null;
      let withValues = evaluateWith(op.with, scope);
      if (op.type === "create") {
        let fromParam = op.from || null;
        let fields = without(entry.named, [keyParam, fromParam].filter(Boolean));
        return {
          type: "create",
          list: op.list,
          key: keyValue,
          from: fromParam ? entry.named[fromParam] : null,
          move: !!fromParam && fromParam === keyParam,
          item: { ...clone(lists[op.list]?.defaults || {}), ...fields, ...clone(op.set || {}), ...withValues }
        };
      }
      let keys = op.all ? null : toArray(keyValue);
      if (op.type === "update") {
        return {
          type: "update",
          list: op.list,
          keys,
          fields: { ...without(entry.named, keyParam ? [keyParam] : []), ...clone(op.set || {}), ...withValues }
        };
      }
      return { type: "delete", list: op.list, keys: keys || [] };
    });
  }
  function targetsOf(ops) {
    let targets = [];
    for (let op of ops) {
      if (op.type === "create")
        targets.push({ list: op.list, key: op.key });
      if (op.type === "update" && op.keys === null)
        targets.push({ list: op.list, all: true });
      if (op.type === "update" && op.keys !== null || op.type === "delete")
        op.keys.forEach((key) => targets.push({ list: op.list, key }));
    }
    return targets;
  }
  function overlaps(a, b) {
    if (!a.targets.length && !b.targets.length)
      return a.method === b.method;
    return a.targets.some((x) => b.targets.some((y) => (x.list === null || y.list === null || x.list === y.list) && (x.all || y.all || sameKey(x.key, y.key))));
  }
  function createEntry(component, action, cfg) {
    let params = action.params;
    let injected = null;
    if (Number.isInteger(cfg.inject) && params.length < cfg.params.length) {
      params.splice(cfg.inject, 0, uuid());
      injected = cfg.inject;
    }
    let named = {};
    cfg.params.forEach((name, index) => {
      if (index < params.length)
        named[name] = params[index];
    });
    let entry = {
      id: uuid(),
      component,
      method: action.name,
      params: clone(params),
      named,
      key: cfg.key ? named[cfg.key] ?? null : null,
      injected,
      now: new Date().toISOString(),
      options: {
        undo: cfg.undo || 0,
        retry: !!cfg.retry,
        squash: !!cfg.squash,
        dispatch: cfg.dispatch || null,
        timeout: cfg.timeout ?? config.timeout
      },
      trigger: originOf(component, action),
      hideEls: [],
      dependents: [],
      createdAt: Date.now()
    };
    entry.ops = resolveOps(component, entry, cfg);
    entry.targets = targetsOf(entry.ops);
    let remover = entry.trigger?.closest?.("[wire\\:optimistic\\.remove]");
    if (remover && component.el.contains(remover)) {
      let row = remover.closest(KEYED);
      if (row && row !== component.el) {
        entry.hideEls.push(row);
        entry.targets.push({ list: null, key: keyOf(row) });
      }
    }
    action.mergeMetadata({ optimistic: { id: entry.id, injected } });
    return entry;
  }
  function supersedeFailures(entry) {
    for (let older of store.forComponent(entry.component)) {
      if (older === entry || older.status !== "failed")
        continue;
      if (overlaps(older, entry) || older.trigger && older.trigger === entry.trigger)
        removeEntry(older);
    }
  }
  function squashOlder(entry) {
    if (!entry.options.squash)
      return;
    for (let older of store.forComponent(entry.component)) {
      if (older === entry || older.status !== "pending" || older.sent || older.method !== entry.method)
        continue;
      if (overlaps(older, entry))
        cancelEntry(older);
    }
  }
  function link(entry) {
    let event = entry.options.dispatch;
    if (!event)
      return;
    for (let other of Livewire.all()) {
      let codes = toArray(configOf(other)?.listeners?.[event]);
      if (!codes.length)
        continue;
      setup(other);
      let linked = store.add({
        id: uuid(),
        component: other,
        method: `@${event}`,
        params: [],
        named: { $event: clone(entry.named) },
        key: null,
        now: entry.now,
        options: {},
        ops: codes.map((code) => ({ type: "js", code })),
        targets: [],
        hideEls: [],
        dependents: [],
        trigger: null,
        linkedTo: entry.id,
        event,
        createdAt: Date.now()
      });
      linked.sent = true;
      refresh(other);
    }
  }
  function hold(entry, action, gate) {
    entry.gates.add(gate);
    if (entry.held)
      return;
    if (!action.isDeferred())
      action.defer();
    action._fire = () => {};
    entry.held = action;
  }
  function release(entry, gate) {
    entry.gates.delete(gate);
    if (entry.gates.size > 0 || !entry.held || entry.removed)
      return;
    let held = entry.held;
    entry.held = null;
    let promise = Livewire.fireAction(entry.component, entry.method, entry.params, {
      ...held.metadata,
      optimistic: { ...held.metadata.optimistic, id: entry.id, resume: true }
    });
    promise.then((value) => held.resolvePromise(value), (error) => held.rejectPromise(error));
    notify();
  }
  function holdForDependencies(entry, action) {
    for (let target of entry.targets) {
      if (target.all || target.key === null || target.key === undefined)
        continue;
      let create = store.entries.find((candidate) => candidate !== entry && candidate.status === "pending" && candidate.ops.some((op) => op.type === "create" && sameKey(op.key, target.key)) && (!candidate.sent || candidate.held));
      if (create && !create.dependents.includes(entry)) {
        create.dependents.push(entry);
        hold(entry, action, `after:${create.id}`);
      }
    }
  }
  function removeEntry(entry) {
    if (entry.removed)
      return;
    clearTimeout(entry.timer);
    clearTimeout(entry.undoTimer);
    clearTimeout(entry.awaitTimer);
    clearTimeout(entry.ttlTimer);
    if (entry.preview?.url)
      URL.revokeObjectURL?.(entry.preview.url);
    store.remove(entry);
    emit(entry.settled ? "confirmed" : entry.status === "failed" ? "dismissed" : "rolled-back", entry);
    for (let linked of store.linkedTo(entry)) {
      removeEntry(linked);
      refresh(linked.component);
    }
  }
  function cancelEntry(entry) {
    if (entry.removed)
      return;
    let action = entry.held || entry.action;
    entry.cancelling = true;
    removeEntry(entry);
    entry.dependents.forEach(cancelEntry);
    if (action && !action.isCancelled()) {
      action._fire = () => {};
      action.cancel();
    }
    refresh(entry.component);
  }
  function fail(entry, error) {
    if (entry.removed || entry.status === "failed")
      return;
    clearTimeout(entry.timer);
    entry.status = "failed";
    entry.error = error;
    entry.failedAt = Date.now();
    for (let linked of store.linkedTo(entry)) {
      removeEntry(linked);
      refresh(linked.component);
    }
    entry.dependents.forEach(cancelEntry);
    entry.dependents = [];
    if (config.failedTtl > 0) {
      entry.ttlTimer = setTimeout(() => {
        if (entry.status !== "failed")
          return;
        removeEntry(entry);
        refresh(entry.component);
      }, config.failedTtl);
    }
    emit("failed", entry, { error });
  }
  function alias(entry, from, to) {
    let swap = (value) => sameKey(value, from) ? to : value;
    for (let dependent of entry.dependents) {
      dependent.params = dependent.params.map((param) => Array.isArray(param) ? param.map(swap) : swap(param));
      for (let name of Object.keys(dependent.named)) {
        let value = dependent.named[name];
        dependent.named[name] = Array.isArray(value) ? value.map(swap) : swap(value);
      }
      for (let op of dependent.ops) {
        if (op.keys)
          op.keys = op.keys.map(swap);
        if (op.key !== undefined)
          op.key = swap(op.key);
      }
      dependent.targets.forEach((target) => {
        target.key = swap(target.key);
      });
    }
  }
  function settle(entry, { result, effects } = {}) {
    if (entry.removed)
      return;
    let created = entry.ops.find((op) => op.type === "create");
    if (created && (typeof result === "string" || typeof result === "number") && !sameKey(result, created.key)) {
      alias(entry, created.key, result);
    }
    for (let linked of store.linkedTo(entry)) {
      let dispatched = toArray(effects?.dispatches).some((dispatch) => dispatch?.name === linked.event);
      if (!dispatched) {
        removeEntry(linked);
        refresh(linked.component);
        continue;
      }
      linked.status = "awaiting";
      linked.linkedTo = null;
      linked.awaitingSince = Date.now();
      linked.awaitTimer = setTimeout(() => {
        removeEntry(linked);
        refresh(linked.component);
      }, config.linkTimeout);
    }
    let dependents = entry.dependents;
    entry.dependents = [];
    entry.settled = true;
    dom.release(entry.component, entry);
    removeEntry(entry);
    dependents.forEach((dependent) => release(dependent, `after:${entry.id}`));
  }
  function track(entry, action, { onSend, onError, onFailure, onCancel }) {
    store.attach(action, entry);
    action.promise.catch(() => {});
    let current = () => entry.action === action && !entry.removed;
    onSend(() => {
      if (!current())
        return;
      entry.sent = true;
      entry.sentAt = Date.now();
      emit("sent", entry);
      if (entry.options.timeout > 0) {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          fail(entry, "Timed out");
          refresh(entry.component);
        }, entry.options.timeout);
      }
      notify();
    });
    onError(({ response } = {}) => {
      if (!current())
        return;
      fail(entry, `Request failed${response?.status ? ` (${response.status})` : ""}`);
      refresh(entry.component);
    });
    onFailure(() => {
      if (!current())
        return;
      fail(entry, "Network error");
      refresh(entry.component);
    });
    onCancel(() => {
      if (entry.action !== action || entry.cancelling)
        return;
      cancelEntry(entry);
    });
  }
  Livewire.interceptAction((hooks) => {
    let { action } = hooks;
    let component = action.component;
    let meta = action.metadata?.optimistic;
    if (meta?.resume) {
      let entry2 = store.find(meta.id);
      if (entry2 && !entry2.removed)
        track(entry2, action, hooks);
      return;
    }
    let cfg = configOf(component)?.actions?.[action.name];
    if (!cfg)
      return;
    if (!setup(component))
      return;
    let entry = store.add(createEntry(component, action, cfg));
    track(entry, action, hooks);
    supersedeFailures(entry);
    squashOlder(entry);
    holdForDependencies(entry, action);
    if (entry.options.undo > 0) {
      hold(entry, action, "undo");
      entry.undoUntil = Date.now() + entry.options.undo * 1000;
      entry.undoTimer = setTimeout(() => release(entry, "undo"), entry.options.undo * 1000);
    }
    emit("added", entry);
    link(entry);
    refresh(component);
  });
  Livewire.interceptRequest(({ request, onError }) => {
    onError(({ response, preventDefault }) => {
      if (!config.handleErrors || response?.status === 419)
        return;
      let actions = [...request.messages].flatMap((message) => [...message.actions]);
      if (actions.length && actions.every((action) => store.forAction(action)))
        preventDefault();
    });
  });
  Livewire.interceptMessage(({ message, onSend, onSuccess, onError, onFailure, onCancel }) => {
    let component = message.component;
    let actions = () => [...message.actions].flatMap((action) => [action, ...action.squashedActions]);
    onSend(() => {
      message.__optimisticSentAt = Date.now();
    });
    onSuccess(({ payload, onSync, onMorphed }) => {
      onSync(() => sync(component, message, payload, actions()));
      onMorphed(() => {
        if (!states.has(component))
          return;
        dom.reconcile(component);
        afterAlpine(component);
        notify();
      });
    });
    let failAll = (message2) => (details = {}) => {
      let error = typeof message2 === "function" ? message2(details) : message2;
      for (let action of actions()) {
        let entry = store.forAction(action);
        if (entry && entry.action === action)
          fail(entry, error);
        let upload = uploadEntry(component, action);
        if (upload)
          fail(upload, error);
      }
      if (states.has(component))
        refresh(component);
    };
    onError(failAll(({ response }) => `Request failed${response?.status ? ` (${response.status})` : ""}`));
    onFailure(failAll("Network error"));
    let cancelAll = () => {
      for (let action of actions()) {
        let entry = store.forAction(action);
        if (entry && entry.action === action)
          cancelEntry(entry);
      }
    };
    onCancel(cancelAll);
    queueMicrotask(() => {
      if (message.isCancelled())
        cancelAll();
    });
  });
  function sync(component, message, payload, actions) {
    let state = setup(component);
    if (!state)
      return;
    state.server = clone(component.canonical);
    state.exposedServer = clone(configOf(component)?.data || {});
    let effects = payload?.effects || {};
    let rejected = effects.optimistic?.rejected || {};
    let returns = toArray(effects.returns);
    let messageActions = [...message.actions];
    for (let action of actions) {
      let entry = store.forAction(action);
      if (!entry || entry.removed || entry.action !== action)
        continue;
      if (Object.prototype.hasOwnProperty.call(rejected, entry.id)) {
        entry.status = "pending";
        fail(entry, rejected[entry.id] || "Rejected");
        continue;
      }
      let index = messageActions.indexOf(action);
      settle(entry, { result: index === -1 ? undefined : returns[index], effects });
    }
    let sentAt = message.__optimisticSentAt ?? 0;
    for (let entry of store.forComponent(component)) {
      if (entry.status === "awaiting" && sentAt >= entry.awaitingSince)
        removeEntry(entry);
    }
    for (let action of messageActions) {
      let entry = uploadEntry(component, action);
      if (!entry)
        continue;
      let errors = toArray(component.snapshot?.memo?.errors?.[action.params[0]]);
      if (errors.length)
        fail(entry, errors[0]);
      else if (action.name === "_uploadErrored")
        fail(entry, "Upload failed");
      else
        removeEntry(entry);
    }
    recompute(component, true);
  }
  function uploadEntry(component, action) {
    if (!["_finishUpload", "_uploadErrored"].includes(action.name))
      return null;
    return store.forComponent(component).filter((entry) => entry.preview?.property === action.params[0] && entry.status === "pending").pop() || null;
  }
  function watchUploads(component) {
    let previews = component.__optimisticPreviews || (component.__optimisticPreviews = new Set);
    let modelOf = (input) => {
      let attribute = Array.from(input.attributes).find((candidate) => candidate.name.startsWith("wire:model"));
      return attribute ? attribute.value : null;
    };
    let latest = (property) => store.forComponent(component).filter((entry) => entry.preview?.property === property).pop();
    component.el.addEventListener("change", (event) => {
      let input = event.target;
      if (!input || input.type !== "file" || !input.files?.length)
        return;
      let property = modelOf(input);
      if (!property || ![...previews].some((preview) => preview.property === property))
        return;
      let previous = latest(property);
      if (previous)
        removeEntry(previous);
      store.add({
        id: uuid(),
        component,
        method: `$upload:${property}`,
        params: [],
        named: {},
        key: null,
        now: new Date().toISOString(),
        options: {},
        ops: [],
        targets: [],
        hideEls: [],
        dependents: [],
        trigger: input,
        preview: { property, url: URL.createObjectURL(input.files[0]) },
        createdAt: Date.now()
      });
      refresh(component);
    }, true);
    let onUpload = (name, callback) => component.el.addEventListener(name, (event) => {
      let entry = latest(event.detail?.property);
      if (!entry || entry.removed)
        return;
      callback(entry);
      refresh(component);
    });
    onUpload("livewire-upload-error", (entry) => fail(entry, "Upload failed"));
    onUpload("livewire-upload-cancel", (entry) => removeEntry(entry));
    component.__optimisticPreviewFor = (property) => {
      let entry = latest(property);
      return entry && isApplied(entry) ? entry.preview.url : null;
    };
  }
  function registerPreview(component, el, property) {
    let previews = component.__optimisticPreviews || (component.__optimisticPreviews = new Set);
    let state = { original: el.getAttribute("src"), written: null };
    let preview = {
      property,
      reconcile() {
        let url = component.__optimisticPreviewFor?.(property) ?? null;
        let current = el.getAttribute("src");
        if (state.written === null || current !== state.written)
          state.original = current;
        if (url) {
          if (current !== url)
            el.setAttribute("src", url);
          state.written = url;
        } else if (state.written !== null) {
          if (state.original === null)
            el.removeAttribute("src");
          else
            el.setAttribute("src", state.original);
          state.written = null;
        }
      }
    };
    previews.add(preview);
    return () => previews.delete(preview);
  }
  function keyFromArgument(value) {
    if (isObject(value))
      return value.id ?? value.key ?? null;
    return value;
  }
  function entriesFor(component, el, key, wide = false) {
    if (key === undefined) {
      let context = dom.contextFor(component, el);
      return wide && !context.row ? context.all : context.entries;
    }
    key = keyFromArgument(key);
    return store.forComponent(component).filter((entry) => entry.targets.some((target) => target.all || sameKey(target.key, key)));
  }
  function retry(entry) {
    entry.status = "pending";
    entry.error = null;
    entry.sent = false;
    clearTimeout(entry.ttlTimer);
    emit("retried", entry);
    Livewire.fireAction(entry.component, entry.method, entry.params, {
      optimistic: { id: entry.id, injected: entry.injected, resume: true, retry: true }
    });
    refresh(entry.component);
  }
  function undo(entry) {
    cancelEntry(entry);
  }
  function dismiss(entry) {
    removeEntry(entry);
    refresh(entry.component);
  }
  function describe(entry) {
    return {
      id: entry.id,
      component: entry.component?.name,
      componentId: entry.component?.id,
      method: entry.method,
      params: entry.params,
      status: entry.status,
      error: entry.error,
      sent: !!entry.sent,
      gates: [...entry.gates],
      undoUntil: entry.undoUntil || null,
      linked: !!entry.event,
      createdAt: entry.createdAt
    };
  }
  function api(component, el) {
    version.value;
    let pick = (key) => entriesFor(component, el, key);
    let latest = (key, predicate) => pick(key).filter(predicate).pop() || null;
    return {
      get entries() {
        return store.forComponent(component).map(describe);
      },
      get all() {
        return store.entries.map(describe);
      },
      pending: (key) => pick(key).some((entry) => entry.status === "pending" || entry.status === "awaiting"),
      failed: (key) => pick(key).some((entry) => entry.status === "failed"),
      error: (key) => latest(key, (entry) => entry.status === "failed")?.error ?? null,
      state(key) {
        let entries = pick(key);
        if (entries.some((entry) => entry.status === "failed"))
          return "failed";
        if (entries.length)
          return "pending";
        return null;
      },
      undoable: (key) => entriesFor(component, el, key, true).filter(isUndoable).map(describe),
      undo: (key) => entriesFor(component, el, key, true).filter(isUndoable).forEach(undo),
      retry: (key) => pick(key).filter((entry) => entry.status === "failed").forEach(retry),
      dismiss: (key) => pick(key).filter((entry) => entry.status === "failed").forEach(dismiss),
      server(path) {
        let state = states.get(component);
        return state ? getPath({ ...state.exposedServer, ...state.server }, path) : undefined;
      },
      item: (key) => {
        let row = [...component.el.querySelectorAll(KEYED)].find((candidate) => dom.isRow(candidate) && sameKey(keyOf(candidate), keyFromArgument(key)));
        return row ? dom.rowItem(component, row).item : null;
      }
    };
  }
  Alpine.magic("item", (el) => {
    version.value;
    let component = el.closest("[wire\\:id]")?.__livewire;
    let row = component && dom.rowOf(component, el);
    return row && dom.isRow(row) ? dom.rowItem(component, row).item : {};
  });
  Alpine.magic("optimistic", (el) => {
    let root = el.closest("[wire\\:id]");
    let component = root?.__livewire;
    if (!component)
      return null;
    return api(component, el);
  });
  Livewire.directive("optimistic", ({ el, directive: directive2, component, cleanup }) => {
    let type = directive2.modifiers[0];
    setup(component, true);
    if (["retry", "undo", "dismiss"].includes(type)) {
      let handler = (event) => {
        event.preventDefault();
        let context = dom.contextFor(component, el);
        let entries = context.entries;
        if (type === "retry")
          entries.filter((entry) => entry.status === "failed").forEach(retry);
        if (type === "undo")
          (context.row ? entries : context.all).filter(isUndoable).forEach(undo);
        if (type === "dismiss")
          entries.filter((entry) => entry.status === "failed").forEach(dismiss);
      };
      el.addEventListener("click", handler);
      cleanup(() => el.removeEventListener("click", handler));
    }
    if (type === "preview")
      cleanup(registerPreview(component, el, directive2.expression));
    schedule(component);
  });
  Livewire.hook("component.init", ({ component, cleanup }) => {
    if (!setup(component))
      return;
    cleanup(() => teardown(component));
    schedule(component);
  });
  Livewire.hook("morph", ({ component }) => {
    if (states.has(component))
      dom.detach(component);
  });
  Livewire.hook("morphed", ({ component }) => {
    if (!states.has(component))
      return;
    dom.adoptServerContent(component);
    dom.reconcile(component);
  });
  function flushUndoWindows() {
    for (let entry of store.entries) {
      if (entry.gates.has("undo")) {
        clearTimeout(entry.undoTimer);
        release(entry, "undo");
      }
    }
  }
  globalThis.addEventListener?.("beforeunload", (event) => {
    let pending = store.entries.filter((entry) => entry.status === "pending");
    if (!pending.length)
      return;
    flushUndoWindows();
    if (config.warnOnUnload) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  globalThis.document?.addEventListener("livewire:navigate", flushUndoWindows);
  for (let component of Livewire.all?.() || []) {
    if (setup(component))
      schedule(component);
  }
  return { store, config, version, uuid, api, describe, refresh, flushUndoWindows };
}

// resources/js/index.js
function boot(target = globalThis) {
  if (target.Optimistic)
    return target.Optimistic;
  let start = () => {
    if (target.Optimistic)
      return;
    target.Optimistic = install(target.Livewire, target.Alpine);
  };
  if (target.Livewire && target.Alpine)
    start();
  else
    target.document?.addEventListener("livewire:init", start, { once: true });
  return target.Optimistic || null;
}
boot();
export {
  install,
  boot
};
