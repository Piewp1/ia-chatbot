// Frontend del chatbot: habla con FastAPI via nginx (/api -> :8000), que a su vez usa Ollama.
const API = "/api";
const $ = (id) => document.getElementById(id);
const messages = $("messages"), form = $("form"), input = $("input"), send = $("send"), status = $("status");
let history = [];

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
    typing.remove();
    add(d.reply, "bot", `${d.model} · ${(d.elapsed_ms / 1000).toFixed(1)} s`);
    history.push({ role: "user", content: text }, { role: "assistant", content: d.reply });
  } catch (err) {
    typing.remove();
    add("Error: " + err.message, "bot error");
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

$("clear").addEventListener("click", () => {
  history = [];
  messages.innerHTML = "";
  add("Nueva conversación. ¿En qué te ayudo?", "bot");
});

checkHealth();
