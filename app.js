/* ==========================================================
   MOUSIK — Central de Produção
   ========================================================== */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STATUS_COLOR = {
  "Composição": "#8C8C88",
  "Produção": "#E8C468",
  "Mixagem": "#7FB8E8",
  "Masterização": "#9FE870",
  "Recall": "#E5544C",
};

let state = {
  role: "leitor",
  tab: "tarefas",
  tasks: [],
  artistas: [],  // [{id, nome}]
  produtores: [], // [{id, nome}]
  autores: [],    // [{id, nome}]
  editoras: [],   // [{id, nome}]
  obras: [],      // [{id, titulo, editoras:[nome], letra, autores:[{nome,percentual}]}]
  editingTaskId: null,
  editingObraId: null,
  viewingObraId: null,
  obraAutoresDraft: [],
  filter: { type: "todos", value: "" },
  taskMixDraft: { link: "", confirmada: false },
  mixOkContext: { mode: "draft", taskId: null },
  taskMasterDraft: { link: "", confirmada: false },
  masterOkContext: { mode: "draft", taskId: null },
  report: { type: "obras", filterType: "todas", filterValue: "" },
};

function filteredTasks() {
  if (state.filter.type === "produtor" && state.filter.value) {
    return state.tasks.filter((t) => t.produtor === state.filter.value);
  }
  if (state.filter.type === "artista" && state.filter.value) {
    return state.tasks.filter((t) => t.artista === state.filter.value);
  }
  if (state.filter.type === "cliente" && state.filter.value) {
    return state.tasks.filter((t) => t.cliente === state.filter.value);
  }
  return state.tasks;
}

function renderFilterBar() {
  const { type, value } = state.filter;
  let valueOptions = "";
  if (type === "produtor") {
    valueOptions = state.produtores
      .map((p) => `<option value="${p.nome}" ${p.nome === value ? "selected" : ""}>${p.nome}</option>`)
      .join("");
  } else if (type === "artista") {
    valueOptions = state.artistas
      .map((a) => `<option value="${a.nome}" ${a.nome === value ? "selected" : ""}>${a.nome}</option>`)
      .join("");
  } else if (type === "cliente") {
    const clientes = [...new Set(state.tasks.map((t) => t.cliente).filter(Boolean))].sort();
    valueOptions = clientes
      .map((c) => `<option value="${c}" ${c === value ? "selected" : ""}>${c}</option>`)
      .join("");
  }
  return `
    <div class="filter-bar">
      <select id="filter-type">
        <option value="todos" ${type === "todos" ? "selected" : ""}>Todas as tarefas</option>
        <option value="produtor" ${type === "produtor" ? "selected" : ""}>Por produtor</option>
        <option value="artista" ${type === "artista" ? "selected" : ""}>Por artista</option>
        <option value="cliente" ${type === "cliente" ? "selected" : ""}>Por cliente</option>
      </select>
      ${type !== "todos" ? `
        <select id="filter-value">
          <option value="">Selecione...</option>
          ${valueOptions}
        </select>
      ` : ""}
    </div>
  `;
}

/* ---------------------- AUTENTICAÇÃO ---------------------- */

document.getElementById("login-btn").addEventListener("click", () => {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  auth.signInWithEmailAndPassword(email, pass).catch((err) => {
    errEl.textContent = "E-mail ou senha inválidos.";
    console.error(err);
  });
});

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  if (user) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("user-email").textContent = user.email;

    const roleDoc = await db.collection("roles").doc(user.uid).get();
    state.role = roleDoc.exists ? roleDoc.data().role : "leitor";
    const roleLabels = { editor: "Editor", produtor: "Produtor", leitor: "Leitor" };
    document.getElementById("role-label").textContent = roleLabels[state.role] || "Leitor";
    updateHeaderButtons();

    listenToData();
  } else {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
});

/* ---------------------- FIRESTORE LISTENERS ---------------------- */

function listenToData() {
  db.collection("tasks").orderBy("createdAt", "desc").onSnapshot((snap) => {
    state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  db.collection("artistas").orderBy("nome").onSnapshot((snap) => {
    state.artistas = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    fillSelect("f-artista", state.artistas.map((a) => a.nome));
    render();
  });
  db.collection("produtores").orderBy("nome").onSnapshot((snap) => {
    state.produtores = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    fillSelect("f-produtor", state.produtores.map((p) => p.nome));
    render();
  });
  db.collection("autores").orderBy("nome").onSnapshot((snap) => {
    state.autores = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    fillObraAutorSelect();
    render();
  });
  db.collection("editoras").orderBy("nome").onSnapshot((snap) => {
    state.editoras = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    render();
  });
  db.collection("obras").orderBy("titulo").onSnapshot((snap) => {
    state.obras = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    fillObraSelect();
    render();
  });
}

function fillSelect(id, options) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
  if (options.includes(current)) el.value = current;
}

function fillSelectWithBlank(id, options, blankLabel) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = `<option value="">${blankLabel}</option>` + options.map((o) => `<option value="${o}">${o}</option>`).join("");
  if ([...el.options].some((op) => op.value === current)) el.value = current;
}

function fillObraSelect() {
  const el = document.getElementById("f-obra");
  const current = el.value;
  el.innerHTML =
    `<option value="">— Obra temporária (digitar abaixo) —</option>` +
    state.obras.map((o) => `<option value="${o.id}">${o.titulo}</option>`).join("");
  if ([...el.options].some((op) => op.value === current)) el.value = current;
}

function fillObraAutorSelect() {
  const el = document.getElementById("o-add-autor-select");
  if (!el) return;
  el.innerHTML = state.autores.map((a) => `<option value="${a.nome}">${a.nome}</option>`).join("");
}

function obraEditorasList(o) {
  const dosAutores = [...new Set((o.autores || []).map((a) => a.editora).filter(Boolean))];
  if (dosAutores.length) return dosAutores;
  if (o.editoras && o.editoras.length) return o.editoras; // compatibilidade com cadastros antigos
  if (o.editora) return [o.editora]; // compatibilidade com cadastros ainda mais antigos
  return [];
}

/* ---------------------- NAVEGAÇÃO ---------------------- */

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.tab = btn.dataset.tab;
  updateHeaderButtons();
  render();
});

function gotoObra(obraId) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  const obrasNavBtn = document.querySelector('.nav-item[data-tab="obras"]');
  if (obrasNavBtn) obrasNavBtn.classList.add("active");
  state.tab = "obras";
  updateHeaderButtons();
  render();
  setTimeout(() => {
    const el = document.getElementById(`obra-card-${obraId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight");
      setTimeout(() => el.classList.remove("highlight"), 2200);
    }
  }, 50);
}

function gotoTask(taskId) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  const tarefasNavBtn = document.querySelector('.nav-item[data-tab="tarefas"]');
  if (tarefasNavBtn) tarefasNavBtn.classList.add("active");
  state.tab = "tarefas";
  updateHeaderButtons();
  render();
  setTimeout(() => {
    const el = document.getElementById(`task-card-${taskId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight");
      setTimeout(() => el.classList.remove("highlight"), 2200);
    }
  }, 50);
}

function updateHeaderButtons() {
  document.getElementById("new-task-btn").classList.toggle(
    "hidden",
    !(state.tab === "tarefas" && state.role === "editor")
  );
  document.getElementById("new-obra-btn").classList.toggle(
    "hidden",
    !(state.tab === "obras" && state.role === "editor")
  );
}

const TAB_META = {
  tarefas: { eyebrow: "Tarefas", title: "Tarefas em produção" },
  cronograma: { eyebrow: "Cronograma", title: "Cronograma de entregas" },
  calendario: { eyebrow: "Calendário", title: "Calendário de entregas" },
  lancamentos: { eyebrow: "Lançamentos", title: "Lançamentos" },
  artistas: { eyebrow: "Artistas", title: "Artistas" },
  produtores: { eyebrow: "Produtores", title: "Produtores" },
  autores: { eyebrow: "Autores", title: "Autores" },
  editoras: { eyebrow: "Editoras", title: "Editoras" },
  obras: { eyebrow: "Obras", title: "Obras" },
  relatorio: { eyebrow: "Relatório", title: "Relatórios" },
};

/* ---------------------- RENDER PRINCIPAL ---------------------- */

function render() {
  const meta = TAB_META[state.tab];
  document.getElementById("tab-eyebrow").textContent = meta.eyebrow;
  document.getElementById("tab-title").textContent = meta.title;

  const content = document.getElementById("content");
  if (state.tab === "tarefas") content.innerHTML = renderFilterBar() + renderTarefas();
  if (state.tab === "cronograma") content.innerHTML = renderFilterBar() + renderCronograma();
  if (state.tab === "calendario") content.innerHTML = renderFilterBar() + renderCalendario();
  if (state.tab === "artistas") content.innerHTML = renderPessoas("artista", state.artistas, "artistas");
  if (state.tab === "produtores") content.innerHTML = renderPessoas("produtor", state.produtores, "produtores");
  if (state.tab === "autores") content.innerHTML = renderPessoas(null, state.autores, "autores");
  if (state.tab === "editoras") content.innerHTML = renderPessoas(null, state.editoras, "editoras");
  if (state.tab === "obras") content.innerHTML = renderObras();
  if (state.tab === "lancamentos") content.innerHTML = renderLancamentos();
  if (state.tab === "relatorio") content.innerHTML = renderRelatorio();

  attachDynamicListeners();
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function isAtrasada(entry) {
  if (!entry || entry.confirmada || !entry.data) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataEntrega = new Date(entry.data + "T00:00:00");
  return dataEntrega < hoje;
}

function obraLabel(t) {
  if (t.obraId) {
    const obra = state.obras.find((o) => o.id === t.obraId);
    return obra ? obra.titulo : (t.obraNome || "—");
  }
  return t.obraNome ? `${t.obraNome} (temporária)` : "—";
}

function obraBadge(t) {
  const label = obraLabel(t);
  if (t.obraId) {
    return `<button type="button" class="obra-link" data-goto-obra="${t.obraId}" title="Ver obra e autores">${label} ↗</button>`;
  }
  return `<span class="obra-plain">${label}</span>`;
}

/* ---------------------- TAREFAS ---------------------- */

function renderTarefas() {
  const tasks = filteredTasks();
  if (state.tasks.length === 0) {
    return `<div class="empty-state"><p>Nenhuma tarefa cadastrada ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? 'Use o botão "Nova Tarefa" para começar.' : "Assim que houver tarefas, elas aparecem aqui."}</p></div>`;
  }
  if (tasks.length === 0) {
    return `<div class="empty-state"><p>Nenhuma tarefa encontrada com esse filtro</p></div>`;
  }
  return tasks.map((t) => `
    <div class="task-card clickable" id="task-card-${t.id}" data-view-task="${t.id}">
      <div>
        <p class="task-title">${t.titulo} ${taskEmojis(t)}</p>
        <p class="task-sub">${t.artista || "Sem artista vinculado"} · Obra: ${obraBadge(t)}${t.cliente ? ` · Cliente: ${t.cliente}` : ""}</p>
        ${t.observacoes ? `<p class="task-obs">📝 ${t.observacoes}</p>` : ""}
      </div>
      <span class="pill" style="color:#8C8C88;border:1px solid #8C8C8855;background:#8C8C8814">${t.tipo}</span>
      <span style="font-size:12px;color:#8C8C88">${t.produtor}</span>
      <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      <div>
        <span class="date-badge-label">Entrega mixagem</span>
        <span class="date-badge-value ${t.mixagem.confirmada ? "confirmed" : (isAtrasada(t.mixagem) ? "pending" : "")}" data-task="${t.id}" data-field="mixagem" title="Clique para confirmar com Mix OK">${fmt(t.mixagem.data)}</span>
        ${t.mixagem.linkBackup ? `<a href="${t.mixagem.linkBackup}" target="_blank" rel="noopener" class="backup-link" data-stop-card-click title="Abrir link do backup">🔗 Backup</a>` : ""}
      </div>
      <div>
        <span class="date-badge-label">Entrega master</span>
        <span class="date-badge-value ${t.master.confirmada ? "confirmed" : (isAtrasada(t.master) ? "pending" : "")}" data-task="${t.id}" data-field="master">${fmt(t.master.data)}</span>
        ${t.master.link ? `<a href="${t.master.link}" target="_blank" rel="noopener" class="backup-link" data-stop-card-click title="Abrir link da master">🔗 Master</a>` : ""}
      </div>
      <div class="row-actions">
        ${state.role === "editor" ? `
          <button class="task-edit-btn" data-toggle-concluida="${t.id}">${t.concluida ? "Reabrir" : "✅ Concluir"}</button>
          <button class="task-edit-btn danger" data-del-task="${t.id}">Excluir</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

function taskEmojis(t) {
  let out = "";
  if (t.mixagem && t.mixagem.confirmada && t.mixagem.linkBackup) out += " 💿";
  if (t.master && t.master.confirmada && t.master.link) out += " 🎧";
  if (t.concluida) out += " ✅";
  if (t.lancado) out += " 🚀";
  return out;
}

/* ---------------------- CRONOGRAMA ---------------------- */

function renderCronograma() {
  const tasks = filteredTasks();
  const events = [];
  tasks.forEach((t) => {
    events.push({
      taskId: t.id, titulo: t.titulo, tipo: "Mixagem", obraId: t.obraId, obraNome: t.obraNome, concluida: t.concluida,
      emoji: (t.mixagem.confirmada && t.mixagem.linkBackup) ? "💿" : "", linkUrl: t.mixagem.linkBackup || "",
      data: t.mixagem.data, confirmada: t.mixagem.confirmada,
    });
    events.push({
      taskId: t.id, titulo: t.titulo, tipo: "Master", obraId: t.obraId, obraNome: t.obraNome, concluida: t.concluida,
      emoji: (t.master.confirmada && t.master.link) ? "🎧" : "", linkUrl: t.master.link || "",
      data: t.master.data, confirmada: t.master.confirmada,
    });
  });
  events.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

  if (state.tasks.length === 0) {
    return `<div class="empty-state"><p>Nenhuma entrega no cronograma</p>
      <p style="font-size:11px">As entregas aparecem aqui assim que houver tarefas cadastradas.</p></div>`;
  }
  if (events.length === 0) {
    return `<div class="empty-state"><p>Nenhuma entrega encontrada com esse filtro</p></div>`;
  }

  return `<div class="timeline">${events.map((e) => {
    const atrasada = isAtrasada(e);
    const cor = e.confirmada ? "#9FE870" : atrasada ? "#E5544C" : "#F3F3F1";
    const statusTxt = e.confirmada ? "Confirmada" : atrasada ? "Atrasada" : "No prazo";
    const emojis = `${e.emoji ? " " + e.emoji : ""}${e.concluida ? " ✅" : ""}`;
    return `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${cor}"></div>
      <div class="timeline-date">${fmt(e.data)}</div>
      <div class="timeline-card" style="border-color:${atrasada ? "#E5544C55" : "#262626"}">
        <div>
          <p style="margin:0;font-size:13px">
            <button type="button" class="obra-link" data-goto-task="${e.taskId}" title="Ver tarefa">${e.titulo}${emojis}</button>
          </p>
          <p style="margin:3px 0 0;font-size:11px;color:#8C8C88">Entrega de ${e.tipo} · Obra: ${obraBadge(e)}${e.linkUrl ? ` · <a href="${e.linkUrl}" target="_blank" rel="noopener" class="backup-link">🔗 ${e.tipo === "Mixagem" ? "Backup" : "Master"}</a>` : ""}</p>
        </div>
        <span class="pill" style="color:${cor};border:1px solid ${cor}55;background:${cor}14">
          ${statusTxt}
        </span>
      </div>
    </div>
  `;
  }).join("")}</div>`;
}

/* ---------------------- CALENDÁRIO ---------------------- */

let calMonthOffset = 0;

function renderCalendario() {
  const tasks = filteredTasks();
  const base = new Date(2026, 7 + calMonthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const byDay = {};
  tasks.forEach((t) => {
    [
      { ...t.mixagem, tipo: "Mixagem", titulo: t.titulo, taskId: t.id, concluida: t.concluida, emoji: (t.mixagem.confirmada && t.mixagem.linkBackup) ? "💿" : "" },
      { ...t.master, tipo: "Master", titulo: t.titulo, taskId: t.id, concluida: t.concluida, emoji: (t.master.confirmada && t.master.link) ? "🎧" : "" },
    ].forEach((e) => {
      if (!e.data) return;
      const d = new Date(e.data);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        byDay[day] = byDay[day] || [];
        byDay[day].push(e);
      }
    });
  });

  let cells = "";
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const items = byDay[d] || [];
    cells += `<div class="cal-cell">
      <div class="cal-day-num">${d}</div>
      ${items.map((e) => {
        const cor = e.confirmada ? "#9FE870" : (isAtrasada(e) ? "#E5544C" : "#F3F3F1");
        const emojis = `${e.emoji ? " " + e.emoji : ""}${e.concluida ? " ✅" : ""}`;
        return `<button type="button" class="cal-event" data-goto-task="${e.taskId}" style="color:${cor}">● ${e.titulo} - ${e.tipo}${emojis}</button>`;
      }).join("")}
    </div>`;
  }

  return `
    <div class="cal-header">
      <button class="btn-icon" id="cal-prev">‹</button>
      <p style="text-transform:capitalize;font-size:13px;width:160px">${monthName}</p>
      <button class="btn-icon" id="cal-next">›</button>
    </div>
    <div class="cal-grid" style="margin-bottom:8px">
      ${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
    </div>
    <div class="cal-grid">${cells}</div>
  `;
}

/* ---------------------- ARTISTAS / PRODUTORES / AUTORES ---------------------- */

function renderPessoas(taskField, people, collection) {
  const label = { artistas: "artista", produtores: "produtor", autores: "autor", editoras: "editora" }[collection];
  const addRow = state.role === "editor"
    ? `<div class="people-add">
        <input id="new-person-input" data-collection="${collection}" placeholder="Nome do novo ${label}" />
        <button class="btn-primary" id="new-person-btn" data-collection="${collection}" style="white-space:nowrap">+ Adicionar</button>
      </div>`
    : "";

  if (people.length === 0) {
    return `${addRow}<div class="empty-state"><p>Ninguém cadastrado ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? "Use o campo acima para adicionar." : "Volte em breve."}</p></div>`;
  }

  const cards = people.map((p) => {
    const name = p.nome;
    const related = taskField ? state.tasks.filter((t) => t[taskField] === name) : [];
    const obrasDoAutor = collection === "autores"
      ? state.obras.filter((o) => (o.autores || []).some((a) => a.nome === name))
      : [];
    const obrasDaEditora = collection === "editoras"
      ? state.obras.filter((o) => obraEditorasList(o).includes(name))
      : [];
    return `<div class="people-card">
      <div class="people-card-header">
        <p style="margin:0;font-size:14px">${name}</p>
        ${state.role === "editor" ? `
          <div class="row-actions">
            <button class="task-edit-btn" data-edit-person="${p.id}" data-collection="${collection}">Editar</button>
            <button class="task-edit-btn danger" data-del-person="${p.id}" data-collection="${collection}">Excluir</button>
          </div>` : ""}
      </div>
      ${taskField && related.length === 0 ? `<p style="font-size:11px;color:#8C8C88">Nenhuma tarefa no momento</p>` : ""}
      ${related.map((t) => `<div class="people-task-row">
        <span>${t.titulo}</span>
        <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      </div>`).join("")}
      ${collection === "autores" ? (
        obrasDoAutor.length === 0
          ? `<p style="font-size:11px;color:#8C8C88">Nenhuma obra vinculada</p>`
          : obrasDoAutor.map((o) => {
              const pct = (o.autores.find((a) => a.nome === name) || {}).percentual ?? 0;
              return `<div class="people-task-row"><span>${o.titulo}</span><span class="pill" style="color:#E8C468;border:1px solid #E8C46855;background:#E8C46814">${pct}%</span></div>`;
            }).join("")
      ) : ""}
      ${collection === "editoras" ? (
        obrasDaEditora.length === 0
          ? `<p style="font-size:11px;color:#8C8C88">Nenhuma obra vinculada</p>`
          : obrasDaEditora.map((o) => `<div class="people-task-row"><span>${o.titulo}</span></div>`).join("")
      ) : ""}
    </div>`;
  }).join("");

  return `${addRow}<div class="people-grid">${cards}</div>`;
}

/* ---------------------- OBRAS ---------------------- */

function renderObras() {
  if (state.obras.length === 0) {
    return `<div class="empty-state"><p>Nenhuma obra cadastrada ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? 'Use o botão "Nova Obra" para começar.' : "Volte em breve."}</p></div>`;
  }
  return `<div class="people-grid">${state.obras.map((o) => {
    const autoresTxt = (o.autores || []).map((a) => `${a.nome} (${a.percentual}%${a.editora ? ` — ${a.editora}` : ""})`).join(", ") || "—";
    const tarefasVinculadas = state.tasks.filter((t) => t.obraId === o.id);
    return `<div class="people-card clickable ${o.editado ? "editado" : ""}" id="obra-card-${o.id}" data-view-obra="${o.id}">
      <div class="people-card-header">
        <p style="margin:0;font-size:14px">${o.titulo}${o.editado ? " ✅" : ""}</p>
        ${state.role === "editor" ? `
          <div class="row-actions">
            <button class="task-edit-btn" data-toggle-editado="${o.id}">${o.editado ? "Desfazer Editado" : "Editado"}</button>
            <button class="task-edit-btn danger" data-del-obra="${o.id}">Excluir</button>
          </div>` : ""}
      </div>
      <p class="obra-meta">Autores: ${autoresTxt}</p>
      ${tarefasVinculadas.length > 0 ? tarefasVinculadas.map((t) => `<div class="people-task-row">
        <span>${t.titulo}</span>
        <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      </div>`).join("") : `<p style="font-size:11px;color:#8C8C88;margin-top:6px">Nenhuma tarefa vinculada</p>`}
    </div>`;
  }).join("")}</div>`;
}

/* ---------------------- LANÇAMENTOS ---------------------- */

function renderLancamentos() {
  const concluidas = state.tasks.filter((t) => t.concluida);
  if (concluidas.length === 0) {
    return `<div class="empty-state"><p>Nenhum lançamento ainda</p>
      <p style="font-size:11px">Quando uma tarefa for marcada como concluída, ela aparece aqui.</p></div>`;
  }
  return concluidas.map((t) => `
    <div class="task-card lancamento-card">
      <div>
        <p class="task-title">${t.titulo} ${t.lancado ? "🚀" : ""}</p>
        <p class="task-sub">${t.artista || "Sem artista"} · ${t.cliente ? `Cliente: ${t.cliente}` : "Sem cliente"} · Obra: ${obraBadge(t)}</p>
      </div>
      <div>
        <span class="date-badge-label">Data de lançamento</span>
        <input type="date" class="lancamento-date-input" value="${t.lancamentoData || ""}" data-lancamento-data="${t.id}" ${state.role !== "editor" ? "disabled" : ""} />
      </div>
      <div class="row-actions">
        ${state.role === "editor" ? `
          <button class="task-edit-btn" data-toggle-lancado="${t.id}">${t.lancado ? "Desfazer lançado" : "🚀 Lançado"}</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

/* ---------------------- RELATÓRIO ---------------------- */

function renderRelatorio() {
  const type = state.report.type;
  const filterType = state.report.filterType;
  const filterValue = state.report.filterValue;

  const typeTabs = `
    <div class="report-type-tabs">
      <button type="button" class="report-type-btn ${type === "obras" ? "active" : ""}" data-report-type="obras">Relatório de Obras</button>
      <button type="button" class="report-type-btn ${type === "tarefas" ? "active" : ""}" data-report-type="tarefas">Relatório de Tarefas</button>
      <button type="button" class="report-type-btn ${type === "atraso" ? "active" : ""}" data-report-type="atraso">Tarefas em Atraso</button>
    </div>
  `;

  let filterOptions = "";
  let valueOptions = "";
  if (type === "obras") {
    filterOptions = `
      <option value="todas" ${filterType === "todas" ? "selected" : ""}>Todas</option>
      <option value="autor" ${filterType === "autor" ? "selected" : ""}>Por autor</option>
      <option value="editora" ${filterType === "editora" ? "selected" : ""}>Por editora</option>
      <option value="editadas" ${filterType === "editadas" ? "selected" : ""}>Editadas</option>
      <option value="nao-editadas" ${filterType === "nao-editadas" ? "selected" : ""}>Não editadas</option>
    `;
    if (filterType === "autor") {
      valueOptions = state.autores.map((a) => `<option value="${a.nome}" ${a.nome === filterValue ? "selected" : ""}>${a.nome}</option>`).join("");
    } else if (filterType === "editora") {
      valueOptions = state.editoras.map((e) => `<option value="${e.nome}" ${e.nome === filterValue ? "selected" : ""}>${e.nome}</option>`).join("");
    }
  } else {
    filterOptions = `
      <option value="todas" ${filterType === "todas" ? "selected" : ""}>Todos</option>
      <option value="artista" ${filterType === "artista" ? "selected" : ""}>Por artista</option>
      <option value="produtor" ${filterType === "produtor" ? "selected" : ""}>Por produtor</option>
      <option value="cliente" ${filterType === "cliente" ? "selected" : ""}>Por cliente</option>
    `;
    if (filterType === "artista") {
      valueOptions = state.artistas.map((a) => `<option value="${a.nome}" ${a.nome === filterValue ? "selected" : ""}>${a.nome}</option>`).join("");
    } else if (filterType === "produtor") {
      valueOptions = state.produtores.map((p) => `<option value="${p.nome}" ${p.nome === filterValue ? "selected" : ""}>${p.nome}</option>`).join("");
    } else if (filterType === "cliente") {
      const clientes = [...new Set(state.tasks.map((t) => t.cliente).filter(Boolean))].sort();
      valueOptions = clientes.map((c) => `<option value="${c}" ${c === filterValue ? "selected" : ""}>${c}</option>`).join("");
    }
  }

  const filterBar = `
    <div class="filter-bar">
      <select id="report-filter-type">${filterOptions}</select>
      ${filterType !== "todas" && filterType !== "editadas" && filterType !== "nao-editadas" ? `<select id="report-filter-value"><option value="">Selecione...</option>${valueOptions}</select>` : ""}
    </div>
  `;

  const rows = getReportRows();
  const preview = rows.length === 0
    ? `<div class="empty-state"><p>Nenhum resultado para esse filtro</p></div>`
    : `<div class="report-table-wrap"><table class="report-table"><thead><tr>${rows.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.data.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

  return `
    ${typeTabs}
    ${filterBar}
    <div class="report-actions">
      <button id="report-excel-btn" class="btn-primary">⬇ Exportar Excel</button>
      <button id="report-pdf-btn" class="btn-primary">⬇ Exportar PDF</button>
    </div>
    ${preview}
  `;
}

function getReportRows() {
  const type = state.report.type;
  const filterType = state.report.filterType;
  const filterValue = state.report.filterValue;

  if (type === "obras") {
    let obras = state.obras;
    if (filterType === "autor" && filterValue) {
      obras = obras.filter((o) => (o.autores || []).some((a) => a.nome === filterValue));
    } else if (filterType === "editora" && filterValue) {
      obras = obras.filter((o) => obraEditorasList(o).includes(filterValue));
    } else if (filterType === "editadas") {
      obras = obras.filter((o) => o.editado);
    } else if (filterType === "nao-editadas") {
      obras = obras.filter((o) => !o.editado);
    }
    return {
      headers: ["Título", "Autores (% — Editora)", "Editoras", "Editado"],
      data: obras.map((o) => [
        o.titulo,
        (o.autores || []).map((a) => `${a.nome} (${a.percentual}%${a.editora ? ` — ${a.editora}` : ""})`).join(", ") || "—",
        obraEditorasList(o).join(", ") || "—",
        o.editado ? "Sim" : "Não",
      ]),
    };
  }

  let tasks = state.tasks;
  if (type === "atraso") {
    tasks = tasks.filter((t) => isAtrasada(t.mixagem) || isAtrasada(t.master));
  }
  if (filterType === "artista" && filterValue) tasks = tasks.filter((t) => t.artista === filterValue);
  if (filterType === "produtor" && filterValue) tasks = tasks.filter((t) => t.produtor === filterValue);
  if (filterType === "cliente" && filterValue) tasks = tasks.filter((t) => t.cliente === filterValue);

  return {
    headers: ["Título", "Tipo", "Artista", "Produtor", "Cliente", "Status", "Entrega Mix", "Entrega Master", "Concluída"],
    data: tasks.map((t) => [
      t.titulo, t.tipo, t.artista || "—", t.produtor, t.cliente || "—", t.status,
      fmt(t.mixagem.data), fmt(t.master.data), t.concluida ? "Sim" : "Não",
    ]),
  };
}

function reportTitle() {
  const names = { obras: "Relatório de Obras", tarefas: "Relatório de Tarefas", atraso: "Tarefas em Atraso" };
  return names[state.report.type];
}

function exportReportExcel() {
  const rows = getReportRows();
  if (rows.data.length === 0) { alert("Nenhum dado para exportar."); return; }
  const ws = XLSX.utils.aoa_to_sheet([rows.headers, ...rows.data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `${reportTitle().replace(/\s+/g, "-")}.xlsx`);
}

function exportReportPDF() {
  const rows = getReportRows();
  if (rows.data.length === 0) { alert("Nenhum dado para exportar."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("MOUSIK", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(232, 196, 104);
  doc.text(reportTitle().toUpperCase(), 14, 23);

  doc.autoTable({
    head: [rows.headers],
    body: rows.data,
    startY: 34,
    theme: "grid",
    headStyles: { fillColor: [18, 18, 18], textColor: [243, 243, 241], fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`${reportTitle().replace(/\s+/g, "-")}.pdf`);
}

/* ---------------------- LISTENERS DINÂMICOS (após cada render) ---------------------- */

function attachDynamicListeners() {
  document.querySelectorAll(".date-badge-value").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const taskId = el.dataset.task;
      const field = el.dataset.field;
      if (field === "mixagem" && (state.role === "editor" || state.role === "produtor")) {
        openMixOkModal("inline", taskId);
      } else if (field === "master" && state.role === "editor") {
        openMasterOkModal("inline", taskId);
      }
    });
  });

  document.querySelectorAll("[data-stop-card-click]").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  document.querySelectorAll("[data-toggle-concluida]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.toggleConcluida;
      const task = state.tasks.find((t) => t.id === taskId);
      db.collection("tasks").doc(taskId).update({ concluida: !task.concluida });
    });
  });

  document.querySelectorAll("[data-view-task]").forEach((card) => {
    card.addEventListener("click", () => openTaskModal(card.dataset.viewTask));
  });
  document.querySelectorAll("[data-del-task]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("Excluir esta tarefa? Essa ação não pode ser desfeita.")) {
        db.collection("tasks").doc(btn.dataset.delTask).delete();
      }
    });
  });

  document.querySelectorAll("[data-goto-obra]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      gotoObra(btn.dataset.gotoObra);
    });
  });
  document.querySelectorAll("[data-goto-task]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      gotoTask(btn.dataset.gotoTask);
    });
  });

  document.querySelectorAll("[data-view-obra]").forEach((card) => {
    card.addEventListener("click", () => openObraViewModal(card.dataset.viewObra));
  });
  document.querySelectorAll("[data-toggle-editado]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const obraId = btn.dataset.toggleEditado;
      const obra = state.obras.find((o) => o.id === obraId);
      db.collection("obras").doc(obraId).update({ editado: !obra.editado });
    });
  });
  document.querySelectorAll("[data-del-obra]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("Excluir esta obra? As tarefas vinculadas a ela ficarão sem obra.")) {
        db.collection("obras").doc(btn.dataset.delObra).delete();
      }
    });
  });

  document.querySelectorAll("[data-edit-person]").forEach((btn) => {
    btn.addEventListener("click", () => editPerson(btn.dataset.editPerson, btn.dataset.collection));
  });
  document.querySelectorAll("[data-del-person]").forEach((btn) => {
    btn.addEventListener("click", () => deletePerson(btn.dataset.delPerson, btn.dataset.collection));
  });

  document.querySelectorAll("[data-lancamento-data]").forEach((el) => {
    el.addEventListener("change", (e) => {
      db.collection("tasks").doc(el.dataset.lancamentoData).update({ lancamentoData: e.target.value });
    });
  });
  document.querySelectorAll("[data-toggle-lancado]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const taskId = btn.dataset.toggleLancado;
      const task = state.tasks.find((t) => t.id === taskId);
      db.collection("tasks").doc(taskId).update({ lancado: !task.lancado });
    });
  });

  document.querySelectorAll("[data-report-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.report.type = btn.dataset.reportType;
      state.report.filterType = "todas";
      state.report.filterValue = "";
      render();
    });
  });
  const reportFilterTypeEl = document.getElementById("report-filter-type");
  if (reportFilterTypeEl) {
    reportFilterTypeEl.addEventListener("change", (e) => {
      state.report.filterType = e.target.value;
      state.report.filterValue = "";
      render();
    });
  }
  const reportFilterValueEl = document.getElementById("report-filter-value");
  if (reportFilterValueEl) {
    reportFilterValueEl.addEventListener("change", (e) => {
      state.report.filterValue = e.target.value;
      render();
    });
  }
  const reportExcelBtn = document.getElementById("report-excel-btn");
  if (reportExcelBtn) reportExcelBtn.addEventListener("click", exportReportExcel);
  const reportPdfBtn = document.getElementById("report-pdf-btn");
  if (reportPdfBtn) reportPdfBtn.addEventListener("click", exportReportPDF);

  const filterTypeEl = document.getElementById("filter-type");
  if (filterTypeEl) {
    filterTypeEl.addEventListener("change", (e) => {
      state.filter.type = e.target.value;
      state.filter.value = "";
      render();
    });
  }
  const filterValueEl = document.getElementById("filter-value");
  if (filterValueEl) {
    filterValueEl.addEventListener("change", (e) => {
      state.filter.value = e.target.value;
      render();
    });
  }

  const prevBtn = document.getElementById("cal-prev");
  const nextBtn = document.getElementById("cal-next");
  if (prevBtn) prevBtn.addEventListener("click", () => { calMonthOffset--; render(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { calMonthOffset++; render(); });

  const addBtn = document.getElementById("new-person-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const input = document.getElementById("new-person-input");
      const name = input.value.trim();
      if (!name) return;
      db.collection(addBtn.dataset.collection).add({ nome: name });
      input.value = "";
    });
  }
}

/* ---------------------- EDITAR / EXCLUIR ARTISTA, PRODUTOR, AUTOR ---------------------- */
/* Ao renomear, atualiza também as referências existentes em tarefas e obras */

const TASK_FIELD_BY_COLLECTION = { artistas: "artista", produtores: "produtor" };

function editPerson(id, collection) {
  const list = state[collection];
  const person = list.find((p) => p.id === id);
  if (!person) return;
  const novoNome = prompt("Novo nome:", person.nome);
  if (!novoNome || !novoNome.trim() || novoNome.trim() === person.nome) return;
  const nomeAntigo = person.nome;
  const nomeNovo = novoNome.trim();

  const batch = db.batch();
  batch.update(db.collection(collection).doc(id), { nome: nomeNovo });

  if (collection === "artistas" || collection === "produtores") {
    const field = TASK_FIELD_BY_COLLECTION[collection];
    state.tasks.filter((t) => t[field] === nomeAntigo).forEach((t) => {
      batch.update(db.collection("tasks").doc(t.id), { [field]: nomeNovo });
    });
  }

  if (collection === "autores") {
    state.obras.filter((o) => (o.autores || []).some((a) => a.nome === nomeAntigo)).forEach((o) => {
      const novosAutores = o.autores.map((a) => a.nome === nomeAntigo ? { ...a, nome: nomeNovo } : a);
      batch.update(db.collection("obras").doc(o.id), { autores: novosAutores });
    });
  }

  if (collection === "editoras") {
    state.obras.filter((o) => (o.autores || []).some((a) => a.editora === nomeAntigo)).forEach((o) => {
      const novosAutores = o.autores.map((a) => a.editora === nomeAntigo ? { ...a, editora: nomeNovo } : a);
      batch.update(db.collection("obras").doc(o.id), { autores: novosAutores });
    });
  }

  batch.commit();
}

function deletePerson(id, collection) {
  const list = state[collection];
  const person = list.find((p) => p.id === id);
  if (!person) return;

  let emUso = false;
  if (collection === "artistas") emUso = state.tasks.some((t) => t.artista === person.nome);
  if (collection === "produtores") emUso = state.tasks.some((t) => t.produtor === person.nome);
  if (collection === "autores") emUso = state.obras.some((o) => (o.autores || []).some((a) => a.nome === person.nome));
  if (collection === "editoras") emUso = state.obras.some((o) => obraEditorasList(o).includes(person.nome));

  const aviso = emUso
    ? " Ele(a) está vinculado(a) a tarefas ou obras existentes, que manterão o nome mesmo após a exclusão."
    : "";
  if (confirm(`Excluir "${person.nome}"?${aviso}`)) {
    db.collection(collection).doc(id).delete();
  }
}

/* ---------------------- MODAL: NOVA/EDITAR TAREFA ---------------------- */

const taskModal = document.getElementById("task-modal");

function openTaskModal(taskId) {
  state.editingTaskId = taskId || null;
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : null;

  const isEditor = state.role === "editor";
  const isProdutor = state.role === "produtor";
  document.getElementById("task-modal-title").textContent = task
    ? (isEditor ? "Editar Tarefa" : isProdutor ? "Tarefa — Mix OK / Observações" : "Ver Tarefa")
    : "Nova Tarefa";
  document.getElementById("save-task-btn").textContent = task ? "Salvar alterações" : "Salvar tarefa";

  fillSelect("f-artista", state.artistas.map((a) => a.nome));
  fillSelect("f-produtor", state.produtores.map((p) => p.nome));
  fillObraSelect();

  document.getElementById("f-titulo").value = task ? task.titulo : "";
  document.getElementById("f-tipo").value = task ? task.tipo : "Single";
  document.getElementById("f-artista-wrap").classList.toggle("hidden", task ? task.tipo === "Composição" : false);
  if (task && task.artista) document.getElementById("f-artista").value = task.artista;
  if (task && task.produtor) document.getElementById("f-produtor").value = task.produtor;
  document.getElementById("f-cliente").value = task ? task.cliente || "" : "";
  document.getElementById("f-status").value = task ? task.status : "Composição";

  document.getElementById("f-obra").value = task && task.obraId ? task.obraId : "";
  document.getElementById("f-obra-temp").value = task && !task.obraId ? (task.obraNome || "") : "";

  document.getElementById("f-mix-data").value = task ? task.mixagem.data || "" : "";
  document.getElementById("f-master-data").value = task ? task.master.data || "" : "";
  document.getElementById("f-concluida").checked = task ? !!task.concluida : false;
  document.getElementById("f-observacoes").value = task ? task.observacoes || "" : "";

  state.taskMixDraft = task
    ? { link: task.mixagem.linkBackup || "", confirmada: !!task.mixagem.confirmada }
    : { link: "", confirmada: false };
  updateMixStatusLabel();

  state.taskMasterDraft = task
    ? { link: task.master.link || "", confirmada: !!task.master.confirmada }
    : { link: "", confirmada: false };
  updateMasterStatusLabel();

  setTaskFormEditable(state.role);

  taskModal.classList.remove("hidden");
}

function setTaskFormEditable(role) {
  const isEditor = role === "editor";
  const isProdutor = role === "produtor";

  document.querySelectorAll("#task-modal input, #task-modal select, #task-modal textarea").forEach((el) => {
    const sempreLivre = isProdutor && el.id === "f-observacoes";
    el.disabled = !isEditor && !sempreLivre;
  });
  document.querySelectorAll('#task-modal [data-add]').forEach((btn) => {
    btn.classList.toggle("hidden", !isEditor);
  });
  document.getElementById("f-mix-ok-btn").classList.toggle("hidden", !(isEditor || isProdutor));
  document.getElementById("f-master-ok-btn").classList.toggle("hidden", !isEditor);
  document.getElementById("save-task-btn").classList.toggle("hidden", !(isEditor || isProdutor));
}

document.getElementById("new-task-btn").addEventListener("click", () => openTaskModal(null));
document.getElementById("close-modal-btn").addEventListener("click", () => taskModal.classList.add("hidden"));

document.getElementById("f-tipo").addEventListener("change", (e) => {
  document.getElementById("f-artista-wrap").classList.toggle("hidden", e.target.value === "Composição");
});

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener("click", () => {
    const collection = btn.dataset.add;
    const labelMap = { artistas: "artista", produtores: "produtor", editoras: "editora" };
    const name = prompt(`Nome do novo ${labelMap[collection] || "item"}:`);
    if (name && name.trim()) {
      db.collection(collection).add({ nome: name.trim() });
    }
  });
});

/* ---------------------- MIX OK (link de backup) ---------------------- */

const mixokModal = document.getElementById("mixok-modal");

function openMixOkModal(mode, taskId) {
  state.mixOkContext = { mode, taskId };
  const currentLink = mode === "draft"
    ? state.taskMixDraft.link
    : ((state.tasks.find((t) => t.id === taskId) || {}).mixagem || {}).linkBackup || "";
  document.getElementById("mixok-link").value = currentLink;
  mixokModal.classList.remove("hidden");
}

function updateMixStatusLabel() {
  const label = document.getElementById("f-mix-status");
  if (!label) return;
  if (state.taskMixDraft.confirmada && state.taskMixDraft.link) {
    label.textContent = "💿 Mixagem confirmada";
    label.className = "field-hint ok";
  } else {
    label.textContent = "Mixagem ainda não confirmada";
    label.className = "field-hint";
  }
}

document.getElementById("f-mix-ok-btn").addEventListener("click", () => openMixOkModal("draft", null));
document.getElementById("close-mixok-modal-btn").addEventListener("click", () => mixokModal.classList.add("hidden"));

document.getElementById("save-mixok-btn").addEventListener("click", () => {
  const link = document.getElementById("mixok-link").value.trim();
  if (!link) { alert("Preencha o link do backup para confirmar a mixagem."); return; }

  if (state.mixOkContext.mode === "draft") {
    state.taskMixDraft = { link, confirmada: true };
    updateMixStatusLabel();
  } else {
    db.collection("tasks").doc(state.mixOkContext.taskId).update({
      "mixagem.confirmada": true,
      "mixagem.linkBackup": link,
    });
  }
  mixokModal.classList.add("hidden");
});

document.getElementById("remove-mixok-btn").addEventListener("click", () => {
  if (!confirm("Remover a confirmação e o link da mixagem?")) return;

  if (state.mixOkContext.mode === "draft") {
    state.taskMixDraft = { link: "", confirmada: false };
    updateMixStatusLabel();
  } else {
    db.collection("tasks").doc(state.mixOkContext.taskId).update({
      "mixagem.confirmada": false,
      "mixagem.linkBackup": firebase.firestore.FieldValue.delete(),
    });
  }
  document.getElementById("mixok-link").value = "";
  mixokModal.classList.add("hidden");
});

/* ---------------------- MASTER OK (link da master) ---------------------- */

const masterokModal = document.getElementById("masterok-modal");

function openMasterOkModal(mode, taskId) {
  state.masterOkContext = { mode, taskId };
  const currentLink = mode === "draft"
    ? state.taskMasterDraft.link
    : ((state.tasks.find((t) => t.id === taskId) || {}).master || {}).link || "";
  document.getElementById("masterok-link").value = currentLink;
  masterokModal.classList.remove("hidden");
}

function updateMasterStatusLabel() {
  const label = document.getElementById("f-master-status");
  if (!label) return;
  if (state.taskMasterDraft.confirmada && state.taskMasterDraft.link) {
    label.textContent = "🎧 Master confirmada";
    label.className = "field-hint ok";
  } else {
    label.textContent = "Master ainda não confirmada";
    label.className = "field-hint";
  }
}

document.getElementById("f-master-ok-btn").addEventListener("click", () => openMasterOkModal("draft", null));
document.getElementById("close-masterok-modal-btn").addEventListener("click", () => masterokModal.classList.add("hidden"));

document.getElementById("save-masterok-btn").addEventListener("click", () => {
  const link = document.getElementById("masterok-link").value.trim();
  if (!link) { alert("Preencha o link da master para confirmar."); return; }

  if (state.masterOkContext.mode === "draft") {
    state.taskMasterDraft = { link, confirmada: true };
    updateMasterStatusLabel();
  } else {
    db.collection("tasks").doc(state.masterOkContext.taskId).update({
      "master.confirmada": true,
      "master.link": link,
    });
  }
  masterokModal.classList.add("hidden");
});

document.getElementById("remove-masterok-btn").addEventListener("click", () => {
  if (!confirm("Remover a confirmação e o link da master?")) return;

  if (state.masterOkContext.mode === "draft") {
    state.taskMasterDraft = { link: "", confirmada: false };
    updateMasterStatusLabel();
  } else {
    db.collection("tasks").doc(state.masterOkContext.taskId).update({
      "master.confirmada": false,
      "master.link": firebase.firestore.FieldValue.delete(),
    });
  }
  document.getElementById("masterok-link").value = "";
  masterokModal.classList.add("hidden");
});

document.getElementById("save-task-btn").addEventListener("click", () => {
  const titulo = document.getElementById("f-titulo").value.trim();
  const tipo = document.getElementById("f-tipo").value;
  const artista = tipo === "Composição" ? null : document.getElementById("f-artista").value;
  const produtor = document.getElementById("f-produtor").value;
  const cliente = document.getElementById("f-cliente").value.trim();
  const status = document.getElementById("f-status").value;
  const obraId = document.getElementById("f-obra").value || null;
  const obraTemp = document.getElementById("f-obra-temp").value.trim();
  const mixData = document.getElementById("f-mix-data").value;
  const masterData = document.getElementById("f-master-data").value;
  const concluida = document.getElementById("f-concluida").checked;
  const observacoes = document.getElementById("f-observacoes").value.trim();

  if (!titulo) { alert("Preencha o título da tarefa."); return; }
  if (tipo !== "Composição" && !artista) { alert("Selecione ou cadastre um artista."); return; }
  if (!produtor) { alert("Selecione ou cadastre um produtor."); return; }
  if (!obraId && !obraTemp) { alert("Selecione uma obra cadastrada ou digite um nome temporário."); return; }

  const obraNome = obraId
    ? (state.obras.find((o) => o.id === obraId) || {}).titulo || ""
    : obraTemp;

  const payload = {
    titulo, tipo, artista, produtor, cliente, status,
    obraId, obraNome, concluida, observacoes,
    mixagem: { data: mixData, confirmada: state.taskMixDraft.confirmada, linkBackup: state.taskMixDraft.link },
    master: { data: masterData, confirmada: state.taskMasterDraft.confirmada, link: state.taskMasterDraft.link },
  };

  if (state.editingTaskId) {
    db.collection("tasks").doc(state.editingTaskId).update(payload);
  } else {
    payload.lancamentoData = "";
    payload.lancado = false;
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection("tasks").add(payload);
  }

  taskModal.classList.add("hidden");
  state.editingTaskId = null;
});

/* ---------------------- MODAL: NOVA/EDITAR OBRA ---------------------- */

const obraModal = document.getElementById("obra-modal");

function openObraModal(obraId) {
  state.editingObraId = obraId || null;
  const obra = obraId ? state.obras.find((o) => o.id === obraId) : null;

  document.getElementById("obra-modal-title").textContent = obra ? "Editar Obra" : "Nova Obra";
  document.getElementById("save-obra-btn").textContent = obra ? "Salvar alterações" : "Salvar obra";

  document.getElementById("o-titulo").value = obra ? obra.titulo : "";
  document.getElementById("o-letra").value = obra ? obra.letra || "" : "";

  state.obraAutoresDraft = obra ? JSON.parse(JSON.stringify(obra.autores || [])) : [];
  fillObraAutorSelect();
  renderObraAutoresDraft();

  obraModal.classList.remove("hidden");
}

document.getElementById("new-obra-btn").addEventListener("click", () => openObraModal(null));
document.getElementById("close-obra-modal-btn").addEventListener("click", () => obraModal.classList.add("hidden"));

/* ---------------------- VER OBRA (somente leitura) ---------------------- */

const obraViewModal = document.getElementById("obra-view-modal");

function openObraViewModal(obraId) {
  const obra = state.obras.find((o) => o.id === obraId);
  if (!obra) return;
  state.viewingObraId = obraId;

  document.getElementById("ov-titulo").textContent = obra.titulo + (obra.editado ? " ✅" : "");

  const autores = obra.autores || [];
  document.getElementById("ov-autores-list").innerHTML = autores.length === 0
    ? `<p class="field-hint">Nenhum autor cadastrado</p>`
    : autores.map((a) => `
        <div class="people-task-row">
          <span>${a.nome}${a.editora ? ` — ${a.editora}` : ""}</span>
          <span class="pill" style="color:#E8C468;border:1px solid #E8C46855;background:#E8C46814">${a.percentual}%</span>
        </div>
      `).join("");

  document.getElementById("ov-letra").textContent = obra.letra || "Sem letra cadastrada.";

  document.getElementById("obra-view-edit-btn").classList.toggle("hidden", state.role !== "editor");
  obraViewModal.classList.remove("hidden");
}

document.getElementById("close-obra-view-modal-btn").addEventListener("click", () => obraViewModal.classList.add("hidden"));
document.getElementById("obra-view-edit-btn").addEventListener("click", () => {
  obraViewModal.classList.add("hidden");
  openObraModal(state.viewingObraId);
});

function renderObraAutoresDraft() {
  const list = document.getElementById("o-autores-list");
  list.innerHTML = state.obraAutoresDraft.map((a, i) => `
    <div class="autor-row">
      <span>${a.nome}</span>
      <input type="number" min="0" max="100" value="${a.percentual}" data-autor-idx="${i}" />
      <span>%</span>
      <select data-autor-editora-idx="${i}">
        <option value="">Sem editora</option>
        ${state.editoras.map((e) => `<option value="${e.nome}" ${e.nome === a.editora ? "selected" : ""}>${e.nome}</option>`).join("")}
      </select>
      <button type="button" data-remove-autor="${i}">✕</button>
    </div>
  `).join("");

  list.querySelectorAll("input[data-autor-idx]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.autorIdx);
      state.obraAutoresDraft[idx].percentual = Number(e.target.value) || 0;
      updateObraTotalLabel();
    });
  });
  list.querySelectorAll("select[data-autor-editora-idx]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.autorEditoraIdx);
      state.obraAutoresDraft[idx].editora = e.target.value;
    });
  });
  list.querySelectorAll("[data-remove-autor]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeAutor);
      state.obraAutoresDraft.splice(idx, 1);
      renderObraAutoresDraft();
      updateObraTotalLabel();
    });
  });

  updateObraTotalLabel();
}

function updateObraTotalLabel() {
  const total = state.obraAutoresDraft.reduce((s, a) => s + (a.percentual || 0), 0);
  const label = document.getElementById("o-total-label");
  label.textContent = `Total: ${total}%`;
  label.className = "field-hint " + (total === 100 ? "ok" : "warn");
}

document.getElementById("o-add-autor-btn").addEventListener("click", () => {
  const select = document.getElementById("o-add-autor-select");
  const nome = select.value;
  if (!nome) { alert("Cadastre um autor na aba Autores primeiro."); return; }
  if (state.obraAutoresDraft.some((a) => a.nome === nome)) { alert("Esse autor já foi adicionado."); return; }
  state.obraAutoresDraft.push({ nome, percentual: 0, editora: "" });
  renderObraAutoresDraft();
});

document.getElementById("save-obra-btn").addEventListener("click", () => {
  const titulo = document.getElementById("o-titulo").value.trim();
  const letra = document.getElementById("o-letra").value.trim();
  const autores = state.obraAutoresDraft;

  if (!titulo) { alert("Preencha o título da obra."); return; }
  if (autores.length === 0) { alert("Adicione ao menos um autor."); return; }
  const total = autores.reduce((s, a) => s + (a.percentual || 0), 0);
  if (total !== 100) { alert(`Os percentuais precisam somar 100%. Atualmente somam ${total}%.`); return; }

  const payload = { titulo, letra, autores };

  if (state.editingObraId) {
    payload.editora = firebase.firestore.FieldValue.delete();
    payload.editoras = firebase.firestore.FieldValue.delete();
    db.collection("obras").doc(state.editingObraId).update(payload);
  } else {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection("obras").add(payload);
  }

  obraModal.classList.add("hidden");
  state.editingObraId = null;
});
