// Frontend del chatbot: habla con FastAPI via nginx (/api -> :8000), que a su vez usa Ollama.
// Las conversaciones se guardan en localStorage (solo en este navegador).
const API = "/api";
const KEY = "chatbot.chats";
const $ = (id) => document.getElementById(id);
const messages = $("messages"), form = $("form"), input = $("input"), send = $("send"),
      status = $("status"), list = $("chats"), sidebar = $("sidebar");

// chats: [{ id, title, updated, history: [{role, content, meta?}] }]
let chats = load();
let current = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(chats)); } catch { /* almacenamiento lleno o bloqueado */ }
}

function add(text, cls, meta) {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  if (meta) {
    const m = document.createElement("span");
    m.className = "meta";
    m.textContent = meta;
    div.appendChild(m);
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function renderList() {
  list.innerHTML = "";
  for (const c of [...chats].sort((a, b) => b.updated - a.updated)) {
    const li = document.createElement("li");
    if (current && c.id === current.id) li.className = "active";
    const t = document.createElement("span");
    t.className = "title";
    t.textContent = c.title;
    const del = document.createElement("button");
    del.className = "del";
    del.title = "Eliminar";
    del.textContent = "✕";
    del.onclick = (e) => { e.stopPropagation(); remove(c.id); };
    li.onclick = () => open(c.id);
    li.append(t, del);
    list.appendChild(li);
  }
}

function renderChat() {
  messages.innerHTML = "";
  add("Hola, ¿en qué te puedo ayudar?", "bot");
  for (const m of current?.history || []) add(m.content, m.role === "user" ? "user" : "bot", m.meta);
}

function open(id) {
  current = chats.find((c) => c.id === id) || null;
  renderChat();
  renderList();
  sidebar.classList.remove("open");
  input.focus();
}

function newChat() { open(null); }

function remove(id) {
  if (!confirm("¿Eliminar esta conversación?")) return;
  chats = chats.filter((c) => c.id !== id);
  save();
  if (current?.id === id) newChat(); else renderList();
}

async function checkHealth() {
  try {
    const r = await fetch(API + "/health");
    const d = await r.json();
    status.textContent = r.ok ? d.default_model : "Ollama no disponible";
    status.className = "status " + (r.ok ? "ok" : "err");
  } catch {
    status.textContent = "API no disponible";
    status.className = "status err";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.style.height = "auto";

  // La conversación se crea al enviar el primer mensaje; el título es ese mensaje.
  if (!current) {
    current = { id: Date.now().toString(36), title: text.slice(0, 40), updated: Date.now(), history: [] };
    chats.push(current);
  }
  const chat = current;
  const history = chat.history.map(({ role, content }) => ({ role, content }));
  chat.history.push({ role: "user", content: text });
  chat.updated = Date.now();
  save();
  renderList();

  add(text, "user");
  send.disabled = true;
  const typing = add("Pensando…", "bot typing");
  try {
    const r = await fetch(API + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || r.statusText);
    const meta = `${d.model} · ${(d.elapsed_ms / 1000).toFixed(1)} s`;
    chat.history.push({ role: "assistant", content: d.reply, meta });
    chat.updated = Date.now();
    save();
    typing.remove();
    if (current === chat) add(d.reply, "bot", meta);
  } catch (err) {
    // El mensaje sin respuesta se descarta para no dejar el historial descuadrado.
    chat.history.pop();
    if (!chat.history.length) {
      chats = chats.filter((c) => c !== chat);
      if (current === chat) current = null;
    }
    save();
    renderList();
    typing.remove();
    if (current === chat) add("Error: " + err.message, "bot error");
  } finally {
    send.disabled = false;
    input.focus();
  }
});

// Enter envía, Shift+Enter hace salto de línea; el textarea crece con el texto.
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
});

$("new").addEventListener("click", newChat);
$("toggle").addEventListener("click", () => sidebar.classList.toggle("open"));

newChat();
checkHealth();
