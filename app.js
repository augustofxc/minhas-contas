/* ==========================================================================
   MINHAS CONTAS — app.js
   Tudo salvo em localStorage. Sem dependências externas além das fontes.
========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     CONSTANTES E ESTADO
  ------------------------------------------------------------------ */
  const STORAGE_KEY = "minhasContas_lancamentos_v1";
  const CATEGORIAS_KEY = "minhasContas_categoriasExtra_v1";
  const CATEGORIAS_OCULTAS_KEY = "minhasContas_categoriasOcultas_v1";
  const CATEGORIAS_SAIDA_BASE = [
    "Alimentação", "Moradia", "Transporte", "Saúde", "Lazer",
    "Educação", "Compras", "Contas fixas", "Outros"
  ];
  const CATEGORIAS_ENTRADA_BASE = [
    "Salário", "Freelance", "Vendas", "Investimentos", "Outros"
  ];
  const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];
  const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

  let categoriasExtra = { saida: [], entrada: [] };  // categorias customizadas pelo usuário
  let categoriasOcultas = { saida: [], entrada: [] }; // categorias (padrão ou extra) excluídas pelo usuário
  let lancamentos = [];          // array de objetos lançamento
  let tipoAtual = "saida";       // "saida" | "entrada" — tela de lançar
  let formaSelecionada = "Pix";
  let filtroCategoriaHistorico = "todas";
  let filtroMesHistorico = null; // {ano, mes} ou null = todos
  let resumoData = new Date();   // mês exibido na aba resumo
  let editandoId = null;

  /* ------------------------------------------------------------------
     UTILITÁRIOS
  ------------------------------------------------------------------ */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatarMoeda(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function parseValorInput(str) {
    if (!str) return 0;
    // aceita "1.234,56" ou "1234.56" ou "1234,56"
    let s = String(str).trim().replace(/[^\d,.-]/g, "");
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function hojeISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function parseDataLocal(isoDate) {
    // evita bug de timezone ao converter "YYYY-MM-DD" para Date
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatarDataLabel(isoDate) {
    const hoje = hojeISO();
    const ontemDate = new Date();
    ontemDate.setDate(ontemDate.getDate() - 1);
    const ontem = ontemDate.toISOString().slice(0, 10);

    if (isoDate === hoje) return "Hoje";
    if (isoDate === ontem) return "Ontem";

    const d = parseDataLocal(isoDate);
    const dia = DIAS_SEMANA[d.getDay()];
    return `${d.getDate()} de ${MESES[d.getMonth()]} · ${dia}`;
  }

  function formatarDataCurta(isoDate) {
    const d = parseDataLocal(isoDate);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function mostrarToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function vibrarLeve() {
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch (e) {}
    }
  }

  /* ------------------------------------------------------------------
     STORAGE
  ------------------------------------------------------------------ */
  function carregarDados() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      lancamentos = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(lancamentos)) lancamentos = [];
    } catch (e) {
      console.error("Erro ao carregar dados salvos:", e);
      lancamentos = [];
    }

    try {
      const rawCat = localStorage.getItem(CATEGORIAS_KEY);
      const parsed = rawCat ? JSON.parse(rawCat) : null;
      if (parsed && Array.isArray(parsed.saida) && Array.isArray(parsed.entrada)) {
        categoriasExtra = parsed;
      } else {
        categoriasExtra = { saida: [], entrada: [] };
      }
    } catch (e) {
      console.error("Erro ao carregar categorias extras:", e);
      categoriasExtra = { saida: [], entrada: [] };
    }

    try {
      const rawOcultas = localStorage.getItem(CATEGORIAS_OCULTAS_KEY);
      const parsedOcultas = rawOcultas ? JSON.parse(rawOcultas) : null;
      if (parsedOcultas && Array.isArray(parsedOcultas.saida) && Array.isArray(parsedOcultas.entrada)) {
        categoriasOcultas = parsedOcultas;
      } else {
        categoriasOcultas = { saida: [], entrada: [] };
      }
    } catch (e) {
      console.error("Erro ao carregar categorias ocultas:", e);
      categoriasOcultas = { saida: [], entrada: [] };
    }
  }

  function salvarDados() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lancamentos));
      return true;
    } catch (e) {
      console.error("Erro ao salvar:", e);
      mostrarToast("Não consegui salvar — espaço de armazenamento pode estar cheio.");
      return false;
    }
  }

  function salvarCategoriasExtra() {
    try {
      localStorage.setItem(CATEGORIAS_KEY, JSON.stringify(categoriasExtra));
      return true;
    } catch (e) {
      console.error("Erro ao salvar categorias extras:", e);
      return false;
    }
  }

  function salvarCategoriasOcultas() {
    try {
      localStorage.setItem(CATEGORIAS_OCULTAS_KEY, JSON.stringify(categoriasOcultas));
      return true;
    } catch (e) {
      console.error("Erro ao salvar categorias ocultas:", e);
      return false;
    }
  }

  function listaCategorias(tipo) {
    const base = tipo === "entrada" ? CATEGORIAS_ENTRADA_BASE : CATEGORIAS_SAIDA_BASE;
    const extras = tipo === "entrada" ? categoriasExtra.entrada : categoriasExtra.saida;
    const ocultas = tipo === "entrada" ? categoriasOcultas.entrada : categoriasOcultas.saida;
    // categorias extras aparecem antes de "Outros", que fica sempre por último
    const semOutros = base.filter((c) => c !== "Outros");
    const todas = [...semOutros, ...extras, "Outros"];
    return todas.filter((c) => !ocultas.includes(c));
  }

  function listaCategoriasParaGerenciar(tipo) {
    // retorna todas as categorias (mesmo ocultas não entram aqui pq já foram excluídas),
    // junto com a info de serem base (padrão) ou extra (criada pelo usuário)
    const base = tipo === "entrada" ? CATEGORIAS_ENTRADA_BASE : CATEGORIAS_SAIDA_BASE;
    const extras = tipo === "entrada" ? categoriasExtra.entrada : categoriasExtra.saida;
    const ocultas = tipo === "entrada" ? categoriasOcultas.entrada : categoriasOcultas.saida;

    const semOutros = base.filter((c) => c !== "Outros");
    const lista = [
      ...semOutros.map((nome) => ({ nome, origem: "padrão" })),
      ...extras.map((nome) => ({ nome, origem: "criada por você" })),
      { nome: "Outros", origem: "padrão" }
    ];
    return lista.filter((item) => !ocultas.includes(item.nome));
  }

  function excluirCategoria(tipo, nomeCategoria) {
    if (nomeCategoria === "Outros") {
      return { ok: false, motivo: "protegida" };
    }

    const isExtra = (tipo === "entrada" ? categoriasExtra.entrada : categoriasExtra.saida).includes(nomeCategoria);

    if (isExtra) {
      // remove de vez da lista de extras
      if (tipo === "entrada") {
        categoriasExtra.entrada = categoriasExtra.entrada.filter((c) => c !== nomeCategoria);
      } else {
        categoriasExtra.saida = categoriasExtra.saida.filter((c) => c !== nomeCategoria);
      }
      salvarCategoriasExtra();
    } else {
      // categoria padrão: não dá pra remover da constante, então marcamos como oculta
      if (tipo === "entrada") {
        if (!categoriasOcultas.entrada.includes(nomeCategoria)) categoriasOcultas.entrada.push(nomeCategoria);
      } else {
        if (!categoriasOcultas.saida.includes(nomeCategoria)) categoriasOcultas.saida.push(nomeCategoria);
      }
      salvarCategoriasOcultas();
    }

    return { ok: true };
  }

  function contarLancamentosPorCategoria(tipo, nomeCategoria) {
    return lancamentos.filter((l) => l.tipo === tipo && l.categoria === nomeCategoria).length;
  }

  function adicionarCategoriaExtra(tipo, nomeCategoria) {
    const nome = nomeCategoria.trim();
    if (!nome) return { ok: false, motivo: "vazio" };

    const todasExistentes = listaCategorias(tipo).map((c) => c.toLowerCase());
    if (todasExistentes.includes(nome.toLowerCase())) {
      return { ok: false, motivo: "duplicada" };
    }

    if (tipo === "entrada") {
      categoriasExtra.entrada.push(nome);
    } else {
      categoriasExtra.saida.push(nome);
    }
    salvarCategoriasExtra();
    return { ok: true };
  }

  /* ------------------------------------------------------------------
     MODELO DE LANÇAMENTO
     {
       id, tipo: 'entrada'|'saida', nome, valor, data (ISO), categoria,
       forma, obs, parcelado: bool,
       parcelaInfo: { grupoId, numParcelas, indice, pagas: [bool,...] } | null
     }

     Para contas parceladas, criamos N registros (um por parcela futura),
     todos com o mesmo grupoId, datas mensais a partir da data informada,
     e marcamos como "paga" as primeiras conforme informado pelo usuário.
  ------------------------------------------------------------------ */

  function criarLancamentoSimples(dados) {
    lancamentos.push({
      id: uid(),
      tipo: dados.tipo,
      nome: dados.nome,
      valor: dados.valor,
      data: dados.data,
      categoria: dados.categoria,
      forma: dados.forma,
      obs: dados.obs || "",
      parcelado: false,
      grupoId: null,
      parcelaIndice: null,
      parcelaTotal: null,
      paga: true
    });
  }

  function criarLancamentoParcelado(dados) {
    const grupoId = uid();
    const dataBase = parseDataLocal(dados.data);

    for (let i = 0; i < dados.numParcelas; i++) {
      const dataParcela = new Date(dataBase.getFullYear(), dataBase.getMonth() + i, dataBase.getDate());
      const isoParcela = `${dataParcela.getFullYear()}-${String(dataParcela.getMonth() + 1).padStart(2, "0")}-${String(dataParcela.getDate()).padStart(2, "0")}`;

      lancamentos.push({
        id: uid(),
        tipo: dados.tipo,
        nome: dados.nome,
        valor: dados.valor,
        data: isoParcela,
        categoria: dados.categoria,
        forma: dados.forma,
        obs: dados.obs || "",
        parcelado: true,
        grupoId: grupoId,
        parcelaIndice: i + 1,
        parcelaTotal: dados.numParcelas,
        paga: i < dados.parcelasPagas
      });
    }
  }

  function getLancamento(id) {
    return lancamentos.find((l) => l.id === id);
  }

  function removerLancamento(id) {
    lancamentos = lancamentos.filter((l) => l.id !== id);
    salvarDados();
  }

  function removerGrupo(grupoId) {
    lancamentos = lancamentos.filter((l) => l.grupoId !== grupoId);
    salvarDados();
  }

  /* expõe pro resto do arquivo (carregado em sequência) */
  window.__app = {
    get lancamentos() { return lancamentos; },
    set lancamentos(v) { lancamentos = v; },
    get tipoAtual() { return tipoAtual; },
    set tipoAtual(v) { tipoAtual = v; },
    get formaSelecionada() { return formaSelecionada; },
    set formaSelecionada(v) { formaSelecionada = v; },
    get filtroCategoriaHistorico() { return filtroCategoriaHistorico; },
    set filtroCategoriaHistorico(v) { filtroCategoriaHistorico = v; },
    get filtroMesHistorico() { return filtroMesHistorico; },
    set filtroMesHistorico(v) { filtroMesHistorico = v; },
    get resumoData() { return resumoData; },
    set resumoData(v) { resumoData = v; },
    get editandoId() { return editandoId; },
    set editandoId(v) { editandoId = v; },
    CATEGORIAS_SAIDA_BASE, CATEGORIAS_ENTRADA_BASE, MESES, DIAS_SEMANA,
    uid, formatarMoeda, parseValorInput, hojeISO, parseDataLocal,
    formatarDataLabel, formatarDataCurta, escapeHtml, mostrarToast, vibrarLeve,
    carregarDados, salvarDados,
    criarLancamentoSimples, criarLancamentoParcelado,
    getLancamento, removerLancamento, removerGrupo,
    listaCategorias, listaCategoriasParaGerenciar, adicionarCategoriaExtra,
    excluirCategoria, contarLancamentosPorCategoria,
    get categoriasExtra() { return categoriasExtra; }
  };

  // carrega lançamentos e categorias extras do localStorage ANTES de qualquer
  // outra parte do script popular telas/selects — evita categorias "somem" no reload
  carregarDados();
})();

/* ==========================================================================
   PARTE 2 — NAVEGAÇÃO E TELA "LANÇAR"
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;

  /* ------------------------------------------------------------------
     NAVEGAÇÃO ENTRE TELAS
  ------------------------------------------------------------------ */
  const TITULOS = {
    lancar: "Lançar",
    historico: "Histórico",
    resumo: "Resumo",
    parcelas: "Parcelas",
    projecao: "Projeção"
  };

  function irPara(tela) {
    document.querySelectorAll("[data-screen]").forEach((el) => {
      el.hidden = el.id !== `screen-${tela}`;
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.target === tela);
    });
    document.getElementById("screenTitle").textContent = TITULOS[tela] || "";

    if (tela === "historico" && window.__renderHistorico) window.__renderHistorico();
    if (tela === "resumo" && window.__renderResumo) window.__renderResumo();
    if (tela === "parcelas" && window.__renderParcelas) window.__renderParcelas();
    if (tela === "projecao" && window.__renderProjecao) window.__renderProjecao();

    window.scrollTo(0, 0);
  }
  window.__irPara = irPara;

  document.getElementById("bottomNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;
    A.vibrarLeve();
    irPara(btn.dataset.target);
  });

  /* ------------------------------------------------------------------
     TELA LANÇAR — preencher categorias conforme tipo
  ------------------------------------------------------------------ */
  function popularCategorias() {
    const select = document.getElementById("campoCategoria");
    const lista = A.listaCategorias(A.tipoAtual);
    const optionsHtml = lista.map((c) => `<option value="${c}">${c}</option>`).join("");
    select.innerHTML = optionsHtml + `<option value="__nova__">+ Extra (criar categoria)</option>`;
  }

  function abrirModalNovaCategoria(tipo, onCriada, onCancelar) {
    document.getElementById("modalConteudo").innerHTML = `
      <h3 class="modal-title">Nova categoria</h3>
      <form class="edit-form" id="formNovaCategoria">
        <label class="field">
          <span class="field-label">Nome da categoria</span>
          <input type="text" id="novaCategoriaNome" placeholder="Ex: Pet, Viagem, Academia..." autocomplete="off" required />
        </label>
        <p class="hint" id="novaCategoriaErro" style="color:var(--terracotta);" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="btnCancelarNovaCategoria">Cancelar</button>
          <button type="submit" class="btn-primary" style="margin-top:0;flex:1;">Criar categoria</button>
        </div>
      </form>
    `;
    document.getElementById("modalOverlay").hidden = false;
    document.getElementById("novaCategoriaNome").focus();

    document.getElementById("btnCancelarNovaCategoria").addEventListener("click", () => {
      window.__fecharModal();
      if (onCancelar) onCancelar();
    });

    document.getElementById("formNovaCategoria").addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = document.getElementById("novaCategoriaNome").value;
      const resultado = A.adicionarCategoriaExtra(tipo, nome);

      if (!resultado.ok) {
        const erroEl = document.getElementById("novaCategoriaErro");
        erroEl.hidden = false;
        erroEl.textContent = resultado.motivo === "duplicada"
          ? "Essa categoria já existe."
          : "Dá um nome pra categoria.";
        return;
      }

      window.__fecharModal();
      A.mostrarToast(`Categoria "${nome.trim()}" criada ✓`);
      if (onCriada) onCriada(nome.trim());
    });

    // se o usuário fechar o modal clicando fora, tratamos como cancelar
    document.getElementById("modalOverlay").addEventListener("click", function handler(e) {
      if (e.target.id === "modalOverlay") {
        document.getElementById("modalOverlay").removeEventListener("click", handler);
        if (onCancelar) onCancelar();
      }
    });
  }
  window.__abrirModalNovaCategoria = abrirModalNovaCategoria;

  document.getElementById("campoCategoria").addEventListener("change", (e) => {
    if (e.target.value === "__nova__") {
      const valorAnterior = A.listaCategorias(A.tipoAtual)[0];
      abrirModalNovaCategoria(A.tipoAtual, (nomeCriado) => {
        popularCategorias();
        document.getElementById("campoCategoria").value = nomeCriado;
      }, () => {
        popularCategorias();
        document.getElementById("campoCategoria").value = valorAnterior;
      });
    }
  });

  document.getElementById("tipoSegmented").addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    A.tipoAtual = btn.dataset.tipo;
    document.querySelectorAll("#tipoSegmented .segmented-btn").forEach((b) =>
      b.classList.toggle("is-active", b === btn)
    );
    popularCategorias();

    // entradas geralmente não são parceladas — esconder opção de parcelamento
    const parceladoRow = document.getElementById("parceladoRow");
    parceladoRow.style.display = A.tipoAtual === "entrada" ? "none" : "flex";
    if (A.tipoAtual === "entrada") {
      document.getElementById("campoParcelado").checked = false;
      document.getElementById("parcelasFields").hidden = true;
      document.getElementById("parceladoHint").hidden = true;
    }
  });

  /* ------------------------------------------------------------------
     FORMA DE PAGAMENTO (chips)
  ------------------------------------------------------------------ */
  document.getElementById("formaPagamentoChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    A.formaSelecionada = chip.dataset.forma;
    document.querySelectorAll("#formaPagamentoChips .chip").forEach((c) =>
      c.classList.toggle("is-active", c === chip)
    );
  });

  function selecionarChipPadrao() {
    const primeiro = document.querySelector("#formaPagamentoChips .chip");
    if (primeiro) primeiro.classList.add("is-active");
  }

  /* ------------------------------------------------------------------
     SWITCH PARCELADO
  ------------------------------------------------------------------ */
  document.getElementById("campoParcelado").addEventListener("change", (e) => {
    const ligado = e.target.checked;
    document.getElementById("parcelasFields").hidden = !ligado;
    document.getElementById("parceladoHint").hidden = !ligado;
    if (ligado) {
      document.getElementById("campoNumParcelas").focus();
      if (!document.getElementById("campoParcelasPagas").value) {
        document.getElementById("campoParcelasPagas").value = 0;
      }
    }
  });

  /* ------------------------------------------------------------------
     MÁSCARA SIMPLES DE VALOR (formata enquanto digita)
  ------------------------------------------------------------------ */
  const campoValor = document.getElementById("campoValor");
  campoValor.addEventListener("input", (e) => {
    let digits = e.target.value.replace(/\D/g, "");
    if (!digits) { e.target.value = ""; return; }
    digits = digits.replace(/^0+(?=\d)/, "");
    while (digits.length < 3) digits = "0" + digits;
    const reais = digits.slice(0, -2);
    const centavos = digits.slice(-2);
    const reaisFormatado = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    e.target.value = `${reaisFormatado},${centavos}`;
  });

  /* ------------------------------------------------------------------
     INICIALIZAÇÃO DO FORMULÁRIO
  ------------------------------------------------------------------ */
  function resetarFormulario() {
    document.getElementById("formLancamento").reset();
    document.getElementById("campoData").value = A.hojeISO();
    A.tipoAtual = "saida";
    document.querySelectorAll("#tipoSegmented .segmented-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.tipo === "saida")
    );
    document.getElementById("parceladoRow").style.display = "flex";
    popularCategorias();
    document.querySelectorAll("#formaPagamentoChips .chip").forEach((c, i) =>
      c.classList.toggle("is-active", i === 0)
    );
    A.formaSelecionada = "Pix";
    document.getElementById("parcelasFields").hidden = true;
    document.getElementById("parceladoHint").hidden = true;
    document.getElementById("campoNome").focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------
     SUBMIT DO FORMULÁRIO
  ------------------------------------------------------------------ */
  document.getElementById("formLancamento").addEventListener("submit", (e) => {
    e.preventDefault();

    const nome = document.getElementById("campoNome").value.trim();
    const valor = A.parseValorInput(document.getElementById("campoValor").value);
    const data = document.getElementById("campoData").value;
    const categoria = document.getElementById("campoCategoria").value;
    const obs = document.getElementById("campoObs").value.trim();
    const parcelado = document.getElementById("campoParcelado").checked;

    // validações amigáveis
    if (!nome) {
      A.mostrarToast("Dá um nome pro lançamento, tipo \"Mercado\" ou \"Salário\".");
      document.getElementById("campoNome").focus();
      return;
    }
    if (!valor || valor <= 0) {
      A.mostrarToast("Informa um valor maior que zero.");
      document.getElementById("campoValor").focus();
      return;
    }
    if (!data) {
      A.mostrarToast("Escolhe uma data.");
      document.getElementById("campoData").focus();
      return;
    }

    if (parcelado) {
      const numParcelas = parseInt(document.getElementById("campoNumParcelas").value, 10);
      const parcelasPagas = parseInt(document.getElementById("campoParcelasPagas").value || "0", 10);

      if (!numParcelas || numParcelas < 2) {
        A.mostrarToast("O número de parcelas precisa ser pelo menos 2.");
        document.getElementById("campoNumParcelas").focus();
        return;
      }
      if (parcelasPagas < 0 || parcelasPagas > numParcelas) {
        A.mostrarToast("As parcelas pagas não podem ser mais que o total de parcelas.");
        document.getElementById("campoParcelasPagas").focus();
        return;
      }

      A.criarLancamentoParcelado({
        tipo: A.tipoAtual, nome, valor, data, categoria,
        forma: A.formaSelecionada, obs, numParcelas, parcelasPagas
      });
      A.salvarDados();
      A.mostrarToast(`Compra parcelada em ${numParcelas}x salva ✓`);
    } else {
      A.criarLancamentoSimples({
        tipo: A.tipoAtual, nome, valor, data, categoria,
        forma: A.formaSelecionada, obs
      });
      A.salvarDados();
      A.mostrarToast(A.tipoAtual === "entrada" ? "Entrada salva ✓" : "Saída salva ✓");
    }

    A.vibrarLeve();
    resetarFormulario();
  });

  window.__resetarFormulario = resetarFormulario;
  window.__popularCategorias = popularCategorias;

  /* inicialização */
  document.getElementById("campoData").value = A.hojeISO();
  popularCategorias();
})();

/* ==========================================================================
   PARTE 3 — TELA "HISTÓRICO" + EDITAR/EXCLUIR
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;

  function todasCategoriasDisponiveis() {
    return [...new Set([...A.listaCategorias("saida"), ...A.listaCategorias("entrada")])]
      .filter((c) => c !== "Outros")
      .concat(["Outros"]);
  }

  function renderFiltrosCategoria() {
    const wrap = document.getElementById("filtroCategorias");
    const cats = ["todas", ...todasCategoriasDisponiveis()];
    wrap.innerHTML = cats.map((c) => {
      const label = c === "todas" ? "Todas" : c;
      const ativo = A.filtroCategoriaHistorico === c ? "is-active" : "";
      return `<button class="filter-chip ${ativo}" data-cat="${c}">${label}</button>`;
    }).join("");
  }

  document.getElementById("filtroCategorias").addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-chip");
    if (!btn) return;
    A.filtroCategoriaHistorico = btn.dataset.cat;
    renderHistorico();
  });

  /* ---------------- filtro de mês (bottom sheet) ---------------- */
  function mesesDisponiveis() {
    const set = new Set();
    A.lancamentos.forEach((l) => {
      const d = A.parseDataLocal(l.data);
      set.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    return [...set].map((s) => {
      const [ano, mes] = s.split("-").map(Number);
      return { ano, mes };
    }).sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes));
  }

  function abrirModalMes() {
    const grid = document.getElementById("modalMesGrid");
    const opcoes = mesesDisponiveis();
    if (opcoes.length === 0) {
      grid.innerHTML = `<p class="hint">Ainda não há lançamentos para filtrar por mês.</p>`;
    } else {
      grid.innerHTML = opcoes.map((o) => {
        const ativo = A.filtroMesHistorico && A.filtroMesHistorico.ano === o.ano && A.filtroMesHistorico.mes === o.mes;
        return `<button class="${ativo ? "is-active" : ""}" data-ano="${o.ano}" data-mes="${o.mes}">${A.MESES[o.mes]} de ${o.ano}</button>`;
      }).join("");
    }
    document.getElementById("modalMesOverlay").hidden = false;
  }

  document.getElementById("btnFiltroAvancado").addEventListener("click", abrirModalMes);

  document.getElementById("modalMesOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalMesOverlay") {
      document.getElementById("modalMesOverlay").hidden = true;
      return;
    }
    const btn = e.target.closest("[data-ano]");
    if (!btn) return;
    A.filtroMesHistorico = { ano: Number(btn.dataset.ano), mes: Number(btn.dataset.mes) };
    document.getElementById("modalMesOverlay").hidden = true;
    renderHistorico();
  });

  document.getElementById("btnLimparFiltroMes").addEventListener("click", () => {
    A.filtroMesHistorico = null;
    document.getElementById("modalMesOverlay").hidden = true;
    renderHistorico();
  });

  /* ---------------- render principal do histórico ---------------- */
  function renderHistorico() {
    renderFiltrosCategoria();

    let lista = [...A.lancamentos];

    if (A.filtroCategoriaHistorico !== "todas") {
      lista = lista.filter((l) => l.categoria === A.filtroCategoriaHistorico);
    }
    if (A.filtroMesHistorico) {
      lista = lista.filter((l) => {
        const d = A.parseDataLocal(l.data);
        return d.getFullYear() === A.filtroMesHistorico.ano && d.getMonth() === A.filtroMesHistorico.mes;
      });
    }

    lista.sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));

    const container = document.getElementById("listaHistorico");
    const empty = document.getElementById("emptyHistorico");

    if (lista.length === 0) {
      container.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    // agrupar por data
    const grupos = {};
    lista.forEach((l) => {
      if (!grupos[l.data]) grupos[l.data] = [];
      grupos[l.data].push(l);
    });

    const diasOrdenados = Object.keys(grupos).sort((a, b) => b.localeCompare(a));

    container.innerHTML = diasOrdenados.map((dia) => {
      const itens = grupos[dia];
      const itensHtml = itens.map((l) => itemCardHtml(l)).join("");
      return `
        <div>
          <div class="day-group-label">${A.formatarDataLabel(dia)}</div>
          <div class="day-group-items">${itensHtml}</div>
        </div>
      `;
    }).join("");
  }

  function itemCardHtml(l) {
    const sinal = l.tipo === "entrada" ? "+" : "−";
    const icone = l.tipo === "entrada" ? "↑" : "↓";
    let meta = `${l.categoria} · ${l.forma}`;
    if (l.parcelado) meta += ` · parcela ${l.parcelaIndice}/${l.parcelaTotal}`;
    return `
      <button class="item-card" data-id="${l.id}" type="button">
        <span class="item-icon ${l.tipo === "entrada" ? "in" : "out"}">${icone}</span>
        <span class="item-body">
          <span class="item-name">${A.escapeHtml(l.nome)}</span>
          <span class="item-meta">${A.escapeHtml(meta)}</span>
        </span>
        <span class="item-value ${l.tipo === "entrada" ? "in" : "out"}">${sinal} ${A.formatarMoeda(l.valor)}</span>
      </button>
    `;
  }


  document.getElementById("listaHistorico").addEventListener("click", (e) => {
    const card = e.target.closest(".item-card");
    if (!card) return;
    abrirModalEdicao(card.dataset.id);
  });

  /* ---------------- modal de editar/excluir ---------------- */
  function abrirModalEdicao(id) {
    const l = A.getLancamento(id);
    if (!l) return;
    A.editandoId = id;

    const cats = A.listaCategorias(l.tipo);
    const formas = ["Pix", "Débito", "Crédito", "Dinheiro", "Outro"];

    const avisoParcelado = l.parcelado ? `
      <p class="hint">Esta é a parcela <strong>${l.parcelaIndice} de ${l.parcelaTotal}</strong>. Editar aqui altera só esta parcela. Para excluir todas as parcelas dessa compra, use o botão abaixo.</p>
    ` : "";

    document.getElementById("modalConteudo").innerHTML = `
      <h3 class="modal-title">Editar lançamento</h3>
      <form class="edit-form" id="formEditar">
        <label class="field">
          <span class="field-label">Nome</span>
          <input type="text" id="editNome" value="${A.escapeHtml(l.nome)}" required />
        </label>
        <label class="field">
          <span class="field-label">Valor</span>
          <div class="value-input-wrap">
            <span class="value-prefix">R$</span>
            <input type="text" inputmode="decimal" id="editValor" value="${l.valor.toFixed(2).replace(".", ",")}" required />
          </div>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field-label">Data</span>
            <input type="date" id="editData" value="${l.data}" required />
          </label>
          <label class="field">
            <span class="field-label">Categoria</span>
            <select id="editCategoria">
              ${cats.map((c) => `<option value="${c}" ${c === l.categoria ? "selected" : ""}>${c}</option>`).join("")}
              <option value="__nova__">+ Extra (criar categoria)</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span class="field-label">Forma de pagamento</span>
          <select id="editForma">
            ${formas.map((f) => `<option value="${f}" ${f === l.forma ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </label>
        ${l.parcelado ? `
        <label class="switch-row">
          <span class="field-label">Esta parcela está paga</span>
          <span class="switch">
            <input type="checkbox" id="editPaga" ${l.paga ? "checked" : ""} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </span>
        </label>` : ""}
        <label class="field">
          <span class="field-label">Observação</span>
          <input type="text" id="editObs" value="${A.escapeHtml(l.obs || "")}" />
        </label>
        ${avisoParcelado}
        <div class="modal-actions">
          <button type="button" class="btn-secondary btn-danger-text" id="btnExcluirItem">Excluir</button>
          <button type="submit" class="btn-primary" style="margin-top:0;flex:1;">Salvar</button>
        </div>
        ${l.parcelado ? `<button type="button" class="btn-secondary btn-danger-text" id="btnExcluirGrupo">Excluir todas as ${l.parcelaTotal} parcelas dessa compra</button>` : ""}
      </form>
    `;

    document.getElementById("modalOverlay").hidden = false;

    document.getElementById("formEditar").addEventListener("submit", (e) => {
      e.preventDefault();
      salvarEdicao(id);
    });
    document.getElementById("btnExcluirItem").addEventListener("click", () => {
      confirmarExclusao(id, false);
    });
    const btnGrupo = document.getElementById("btnExcluirGrupo");
    if (btnGrupo) {
      btnGrupo.addEventListener("click", () => confirmarExclusao(id, true));
    }

    // máscara de valor no modal
    const editValor = document.getElementById("editValor");
    editValor.addEventListener("input", (e) => {
      let digits = e.target.value.replace(/\D/g, "");
      if (!digits) { e.target.value = ""; return; }
      digits = digits.replace(/^0+(?=\d)/, "");
      while (digits.length < 3) digits = "0" + digits;
      const reais = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const centavos = digits.slice(-2);
      e.target.value = `${reais},${centavos}`;
    });

    // permite criar categoria nova direto no modal de edição
    document.getElementById("editCategoria").addEventListener("change", (e) => {
      if (e.target.value === "__nova__") {
        const valorAnterior = l.categoria;
        window.__abrirModalNovaCategoria(l.tipo, (nomeCriado) => {
          abrirModalEdicao(id);
          setTimeout(() => {
            const sel = document.getElementById("editCategoria");
            if (sel) sel.value = nomeCriado;
          }, 0);
        }, () => {
          abrirModalEdicao(id);
          setTimeout(() => {
            const sel = document.getElementById("editCategoria");
            if (sel) sel.value = valorAnterior;
          }, 0);
        });
      }
    });
  }

  function salvarEdicao(id) {
    const l = A.getLancamento(id);
    if (!l) return;

    const nome = document.getElementById("editNome").value.trim();
    const valor = A.parseValorInput(document.getElementById("editValor").value);
    const data = document.getElementById("editData").value;

    if (!nome) { A.mostrarToast("Dá um nome pro lançamento."); return; }
    if (!valor || valor <= 0) { A.mostrarToast("Informa um valor maior que zero."); return; }

    l.nome = nome;
    l.valor = valor;
    l.data = data;
    l.categoria = document.getElementById("editCategoria").value;
    l.forma = document.getElementById("editForma").value;
    l.obs = document.getElementById("editObs").value.trim();

    const editPaga = document.getElementById("editPaga");
    if (editPaga) l.paga = editPaga.checked;

    A.salvarDados();
    fecharModal();
    A.mostrarToast("Lançamento atualizado ✓");
    renderHistorico();
    if (window.__renderResumo) window.__renderResumo();
    if (window.__renderParcelas) window.__renderParcelas();
  }

  function confirmarExclusao(id, grupoTodo) {
    const l = A.getLancamento(id);
    if (!l) return;

    document.getElementById("modalConteudo").innerHTML = `
      <h3 class="modal-title">${grupoTodo ? "Excluir todas as parcelas?" : "Excluir este lançamento?"}</h3>
      <p class="hint" style="margin-bottom:18px;">${grupoTodo
        ? `Isso vai remover as ${l.parcelaTotal} parcelas de "${A.escapeHtml(l.nome)}", incluindo as já pagas. Essa ação não pode ser desfeita.`
        : `"${A.escapeHtml(l.nome)}" será removido para sempre. Essa ação não pode ser desfeita.`}</p>
      <div class="modal-actions">
        <button class="btn-secondary" id="btnCancelarExclusao">Cancelar</button>
        <button class="btn-primary" id="btnConfirmarExclusao" style="margin-top:0;background:var(--terracotta);">Excluir</button>
      </div>
    `;
    document.getElementById("btnCancelarExclusao").addEventListener("click", () => abrirModalEdicao(id));
    document.getElementById("btnConfirmarExclusao").addEventListener("click", () => {
      if (grupoTodo) {
        A.removerGrupo(l.grupoId);
      } else {
        A.removerLancamento(id);
      }
      fecharModal();
      A.mostrarToast("Removido ✓");
      renderHistorico();
      if (window.__renderResumo) window.__renderResumo();
      if (window.__renderParcelas) window.__renderParcelas();
      if (window.__renderProjecao) window.__renderProjecao();
    });
  }

  function fecharModal() {
    document.getElementById("modalOverlay").hidden = true;
    document.getElementById("modalConteudo").innerHTML = "";
    A.editandoId = null;
  }

  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") fecharModal();
  });

  window.__renderHistorico = renderHistorico;
  window.__fecharModal = fecharModal;
  window.__abrirModalEdicaoPublic = abrirModalEdicao;
})();

/* ==========================================================================
   PARTE 4 — TELA "RESUMO" (mensal)
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;
  let categoriaExpandida = null; // nome da categoria atualmente expandida no resumo, ou null

  function lancamentosDoMes(ano, mes) {
    return A.lancamentos.filter((l) => {
      const d = A.parseDataLocal(l.data);
      return d.getFullYear() === ano && d.getMonth() === mes;
    });
  }

  function renderResumo() {
    const ano = A.resumoData.getFullYear();
    const mes = A.resumoData.getMonth();

    document.getElementById("resumoMesLabel").textContent =
      `${A.MESES[mes][0].toUpperCase()}${A.MESES[mes].slice(1)} ${ano}`;

    const itens = lancamentosDoMes(ano, mes);

    let totalEntrou = 0, totalSaiu = 0;
    const porForma = {}; // forma -> {total, count, tipo predominante não importa, separamos por entrada/saida}
    const porCategoria = {}; // categoria -> total (considerando saídas, que é o que mais importa para orçar)

    itens.forEach((l) => {
      if (l.tipo === "entrada") {
        totalEntrou += l.valor;
      } else {
        totalSaiu += l.valor;
        porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + l.valor;
      }
      if (!porForma[l.forma]) porForma[l.forma] = { total: 0, count: 0 };
      porForma[l.forma].total += l.valor;
      porForma[l.forma].count += 1;
    });

    const saldo = totalEntrou - totalSaiu;

    document.getElementById("resumoSaldo").textContent = A.formatarMoeda(saldo);
    document.getElementById("resumoSaldo").style.color = saldo < 0 ? "#E0463E" : "#F2F1ED";
    document.getElementById("resumoEntrou").textContent = A.formatarMoeda(totalEntrou);
    document.getElementById("resumoSaiu").textContent = A.formatarMoeda(totalSaiu);

    // grid de formas de pagamento
    const formaGrid = document.getElementById("resumoFormaPagamento");
    const formasOrdenadas = Object.entries(porForma).sort((a, b) => b[1].total - a[1].total);
    if (formasOrdenadas.length === 0) {
      formaGrid.innerHTML = `<p class="hint" style="grid-column:1/-1;">Nenhum lançamento neste mês ainda.</p>`;
    } else {
      formaGrid.innerHTML = formasOrdenadas.map(([forma, info]) => `
        <div class="payment-card">
          <div class="payment-card-label">${forma}</div>
          <div class="payment-card-value">${A.formatarMoeda(info.total)}</div>
          <div class="payment-card-count">${info.count} ${info.count === 1 ? "lançamento" : "lançamentos"}</div>
        </div>
      `).join("");
    }

    // lista de categorias (saídas)
    const catList = document.getElementById("resumoCategorias");
    const catsOrdenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    if (catsOrdenadas.length === 0) {
      catList.innerHTML = `<p class="hint">Nenhuma saída registrada neste mês.</p>`;
      categoriaExpandida = null;
    } else {
      const maior = catsOrdenadas[0][1];
      // se a categoria expandida não existe mais neste mês (ex: foi a última saída dela
      // e acabou de ser excluída), fecha a expansão automaticamente
      if (categoriaExpandida && !catsOrdenadas.some(([cat]) => cat === categoriaExpandida)) {
        categoriaExpandida = null;
      }

      catList.innerHTML = catsOrdenadas.map(([cat, valor]) => {
        const pct = maior > 0 ? Math.max(4, Math.round((valor / maior) * 100)) : 0;
        const expandida = cat === categoriaExpandida;
        const itensCategoria = itens
          .filter((l) => l.tipo === "saida" && l.categoria === cat)
          .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));

        const itensHtml = itensCategoria.map((l) => {
          let meta = `${A.formatarDataCurta(l.data)} · ${l.forma}`;
          if (l.parcelado) meta += ` · parcela ${l.parcelaIndice}/${l.parcelaTotal}`;
          return `
            <button class="item-card" data-id="${l.id}" type="button">
              <span class="item-icon out">↓</span>
              <span class="item-body">
                <span class="item-name">${A.escapeHtml(l.nome)}</span>
                <span class="item-meta">${meta}</span>
              </span>
              <span class="item-value out">− ${A.formatarMoeda(l.valor)}</span>
            </button>
          `;
        }).join("");

        return `
          <div class="category-row">
            <button class="category-row-top category-row-toggle" type="button" data-cat="${A.escapeHtml(cat)}">
              <span class="cat-name">${cat}</span>
              <span class="category-row-right">
                <span class="cat-value">${A.formatarMoeda(valor)}</span>
                <svg class="category-chevron ${expandida ? "is-open" : ""}" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </button>
            <div class="category-bar-track"><div class="category-bar-fill" style="width:${pct}%"></div></div>
            ${expandida ? `
              <div class="category-itens-list">
                ${itensHtml || `<p class="hint" style="margin:8px 0 2px;">Nenhum lançamento encontrado.</p>`}
              </div>
            ` : ""}
          </div>
        `;
      }).join("");
    }
  }

  document.getElementById("resumoCategorias").addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".category-row-toggle");
    if (toggleBtn) {
      const cat = toggleBtn.dataset.cat;
      categoriaExpandida = categoriaExpandida === cat ? null : cat;
      renderResumo();
      return;
    }

    const itemCard = e.target.closest(".item-card");
    if (itemCard && window.__abrirModalEdicaoPublic) {
      window.__abrirModalEdicaoPublic(itemCard.dataset.id);
    }
  });

  document.getElementById("resumoMesAnterior").addEventListener("click", () => {
    A.resumoData = new Date(A.resumoData.getFullYear(), A.resumoData.getMonth() - 1, 1);
    renderResumo();
  });
  document.getElementById("resumoMesProximo").addEventListener("click", () => {
    A.resumoData = new Date(A.resumoData.getFullYear(), A.resumoData.getMonth() + 1, 1);
    renderResumo();
  });

  window.__renderResumo = renderResumo;
})();

/* ==========================================================================
   PARTE 5 — TELA "PARCELAS"
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;

  function renderParcelas() {
    // agrupar por grupoId
    const grupos = {};
    A.lancamentos.forEach((l) => {
      if (!l.parcelado) return;
      if (!grupos[l.grupoId]) grupos[l.grupoId] = [];
      grupos[l.grupoId].push(l);
    });

    const ids = Object.keys(grupos);
    const container = document.getElementById("listaParcelas");
    const empty = document.getElementById("emptyParcelas");

    if (ids.length === 0) {
      container.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    // ordenar grupos pela data da primeira parcela (mais recente primeiro)
    const gruposOrdenados = ids.map((id) => {
      const parcelas = grupos[id].sort((a, b) => a.parcelaIndice - b.parcelaIndice);
      return { id, parcelas };
    }).sort((a, b) => b.parcelas[0].data.localeCompare(a.parcelas[0].data));

    container.innerHTML = gruposOrdenados.map(({ id, parcelas }) => {
      const primeira = parcelas[0];
      const total = primeira.parcelaTotal;
      const pagas = parcelas.filter((p) => p.paga).length;
      const restantes = total - pagas;
      const valorTotal = primeira.valor * total;
      const valorPago = primeira.valor * pagas;
      const pct = Math.round((pagas / total) * 100);

      const proximaPendente = parcelas.find((p) => !p.paga);
      const statusTexto = restantes === 0
        ? "Todas as parcelas pagas"
        : `Próxima: ${A.formatarDataCurta(proximaPendente.data)}`;

      return `
        <div class="parcela-card" data-grupo="${id}">
          <div class="parcela-top">
            <div>
              <div class="parcela-name">${A.escapeHtml(primeira.nome)}</div>
              <div class="parcela-meta">${primeira.categoria} · ${primeira.forma} · ${statusTexto}</div>
            </div>
            <div>
              <div class="parcela-value">${A.formatarMoeda(primeira.valor)}<span style="font-size:11px;color:var(--ink-soft);font-weight:500;">/mês</span></div>
              <div class="parcela-value-sub">total ${A.formatarMoeda(valorTotal)}</div>
            </div>
          </div>
          <div class="parcela-progress-track"><div class="parcela-progress-fill" style="width:${pct}%"></div></div>
          <div class="parcela-progress-label">
            <span>${pagas} de ${total} pagas</span>
            <span>faltam ${restantes} · ${A.formatarMoeda(valorTotal - valorPago)}</span>
          </div>
          <div class="parcela-actions">
            ${restantes > 0 ? `<button class="is-primary" data-acao="marcar-paga" data-grupo="${id}">Marcar próxima como paga</button>` : ""}
            <button data-acao="ver-parcelas" data-grupo="${id}">Ver parcelas</button>
          </div>
        </div>
      `;
    }).join("");
  }


  document.getElementById("listaParcelas").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;
    const grupoId = btn.dataset.grupo;

    if (btn.dataset.acao === "marcar-paga") {
      const parcelasGrupo = A.lancamentos
        .filter((l) => l.grupoId === grupoId)
        .sort((a, b) => a.parcelaIndice - b.parcelaIndice);
      const proxima = parcelasGrupo.find((p) => !p.paga);
      if (proxima) {
        proxima.paga = true;
        A.salvarDados();
        A.mostrarToast(`Parcela ${proxima.parcelaIndice}/${proxima.parcelaTotal} marcada como paga ✓`);
        renderParcelas();
        if (window.__renderResumo) window.__renderResumo();
      }
    }

    if (btn.dataset.acao === "ver-parcelas") {
      abrirDetalheGrupo(grupoId);
    }
  });

  function abrirDetalheGrupo(grupoId) {
    const parcelas = A.lancamentos
      .filter((l) => l.grupoId === grupoId)
      .sort((a, b) => a.parcelaIndice - b.parcelaIndice);
    if (parcelas.length === 0) return;

    const linhas = parcelas.map((p) => `
      <button class="item-card" data-id="${p.id}" type="button" style="width:100%;">
        <span class="item-icon ${p.paga ? "in" : "out"}">${p.paga ? "✓" : p.parcelaIndice}</span>
        <span class="item-body">
          <span class="item-name">Parcela ${p.parcelaIndice}/${p.parcelaTotal}</span>
          <span class="item-meta">${A.formatarDataCurta(p.data)} · ${p.paga ? "Paga" : "Pendente"}</span>
        </span>
        <span class="item-value out">${A.formatarMoeda(p.valor)}</span>
      </button>
    `).join("");

    document.getElementById("modalConteudo").innerHTML = `
      <h3 class="modal-title">${A.escapeHtml(parcelas[0].nome)}</h3>
      <p class="hint" style="margin-bottom:14px;">Toque numa parcela para editar a data, marcar como paga ou excluir.</p>
      <div class="lista-container" style="gap:8px;">${linhas}</div>
    `;
    document.getElementById("modalOverlay").hidden = false;

    document.getElementById("modalConteudo").addEventListener("click", (e) => {
      const card = e.target.closest(".item-card");
      if (!card) return;
      if (window.__abrirModalEdicaoPublic) window.__abrirModalEdicaoPublic(card.dataset.id);
    });
  }

  window.__renderParcelas = renderParcelas;
})();

/* ==========================================================================
   PARTE 6 — TELA "PROJEÇÃO" (até dezembro do ano atual)
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;

  function renderProjecao() {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    document.getElementById("projecaoAno").textContent = anoAtual;

    const mesAtual = hoje.getMonth();
    const meses = [];
    for (let m = mesAtual; m <= 11; m++) meses.push(m);

    const container = document.getElementById("listaProjecao");

    if (meses.length === 0) {
      container.innerHTML = `<p class="hint">Já estamos em dezembro — não há próximos meses neste ano para projetar.</p>`;
      return;
    }

    container.innerHTML = meses.map((mes) => {
      // parcelas futuras (não pagas) que cairão nesse mês/ano, já cadastradas
      const parcelasNoMes = A.lancamentos.filter((l) => {
        if (!l.parcelado) return false;
        const d = A.parseDataLocal(l.data);
        return d.getFullYear() === anoAtual && d.getMonth() === mes;
      });

      // despesas/entradas simples (não parceladas) já cadastradas para esse mês/ano futuro
      // (ex: usuário já lançou uma conta futura manualmente)
      const simplesNoMes = A.lancamentos.filter((l) => {
        if (l.parcelado) return false;
        const d = A.parseDataLocal(l.data);
        return d.getFullYear() === anoAtual && d.getMonth() === mes && (mes !== mesAtual || d >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
      });

      const totalParcelas = parcelasNoMes.reduce((s, l) => s + l.valor, 0);
      const totalSimples = simplesNoMes.reduce((s, l) => s + (l.tipo === "saida" ? l.valor : 0), 0);
      const totalGeral = totalParcelas + totalSimples;

      const linhasParcelas = parcelasNoMes.map((l) => `
        <div class="projecao-line">
          <span>${A.escapeHtml(l.nome)} <strong>(${l.parcelaIndice}/${l.parcelaTotal})</strong></span>
          <span>${A.formatarMoeda(l.valor)}</span>
        </div>
      `).join("");

      const linhasSimples = simplesNoMes.filter((l) => l.tipo === "saida").map((l) => `
        <div class="projecao-line">
          <span>${A.escapeHtml(l.nome)}</span>
          <span>${A.formatarMoeda(l.valor)}</span>
        </div>
      `).join("");

      const conteudo = (linhasParcelas + linhasSimples) || `<div class="projecao-empty">Nenhum gasto previsto cadastrado para este mês ainda.</div>`;

      const nomeMes = A.MESES[mes];
      const nomeMesCap = nomeMes[0].toUpperCase() + nomeMes.slice(1);

      return `
        <div class="projecao-month-card">
          <div class="projecao-month-header">
            <span class="projecao-month-name">${nomeMesCap} de ${anoAtual}</span>
            <span class="projecao-month-total">${A.formatarMoeda(totalGeral)}</span>
          </div>
          ${conteudo}
        </div>
      `;
    }).join("");
  }

  window.__renderProjecao = renderProjecao;
})();

/* ==========================================================================
   PARTE 7 — MENU (exportar / importar / limpar tudo)
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;

  document.getElementById("menuBtn").addEventListener("click", () => {
    document.getElementById("modalMenuOverlay").hidden = false;
  });
  document.getElementById("modalMenuOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalMenuOverlay") document.getElementById("modalMenuOverlay").hidden = true;
  });

  document.getElementById("menuExportar").addEventListener("click", () => {
    const dados = JSON.stringify(A.lancamentos, null, 2);
    const blob = new Blob([dados], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const hoje = A.hojeISO();
    a.href = url;
    a.download = `backup-minhas-contas-${hoje}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById("modalMenuOverlay").hidden = true;
    A.mostrarToast("Backup baixado ✓");
  });

  document.getElementById("menuImportar").addEventListener("click", () => {
    document.getElementById("inputImportar").click();
  });

  /* ---------------- gerenciar categorias ---------------- */
  let categoriasTipoAtual = "saida";

  function renderListaCategoriasGerenciar() {
    const lista = A.listaCategoriasParaGerenciar(categoriasTipoAtual);
    const container = document.getElementById("listaCategoriasGerenciar");

    if (lista.length === 0) {
      container.innerHTML = `<p class="categoria-gerenciar-empty">Nenhuma categoria por aqui.</p>`;
      return;
    }

    container.innerHTML = lista.map((item) => {
      const protegida = item.nome === "Outros";
      return `
        <div class="categoria-gerenciar-row">
          <div class="categoria-gerenciar-info">
            <span class="categoria-gerenciar-nome">${A.escapeHtml(item.nome)}</span>
            <span class="categoria-gerenciar-origem">${item.origem}</span>
          </div>
          <button class="categoria-gerenciar-excluir ${protegida ? "is-protegida" : ""}"
                  data-nome="${A.escapeHtml(item.nome)}"
                  ${protegida ? "disabled" : ""}
                  aria-label="Excluir categoria ${A.escapeHtml(item.nome)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2m1 0l-1 14H8L7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      `;
    }).join("");
  }

  document.getElementById("menuGerenciarCategorias").addEventListener("click", () => {
    document.getElementById("modalMenuOverlay").hidden = true;
    categoriasTipoAtual = "saida";
    document.querySelectorAll("#categoriasTipoSegmented .segmented-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.tipo === "saida")
    );
    renderListaCategoriasGerenciar();
    document.getElementById("modalCategoriasOverlay").hidden = false;
  });

  document.getElementById("categoriasTipoSegmented").addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    categoriasTipoAtual = btn.dataset.tipo;
    document.querySelectorAll("#categoriasTipoSegmented .segmented-btn").forEach((b) =>
      b.classList.toggle("is-active", b === btn)
    );
    renderListaCategoriasGerenciar();
  });

  document.getElementById("modalCategoriasOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalCategoriasOverlay") {
      document.getElementById("modalCategoriasOverlay").hidden = true;
      return;
    }

    const btnExcluir = e.target.closest(".categoria-gerenciar-excluir");
    if (!btnExcluir || btnExcluir.disabled) return;

    const nomeCategoria = btnExcluir.dataset.nome;
    confirmarExclusaoCategoria(categoriasTipoAtual, nomeCategoria);
  });

  function confirmarExclusaoCategoria(tipo, nomeCategoria) {
    const qtd = A.contarLancamentosPorCategoria(tipo, nomeCategoria);
    const avisoUso = qtd > 0
      ? `Há ${qtd} ${qtd === 1 ? "lançamento" : "lançamentos"} usando essa categoria. ${qtd === 1 ? "Ele" : "Eles"} não ${qtd === 1 ? "será" : "serão"} apagado${qtd === 1 ? "" : "s"} — só não vai mais aparecer pra escolher em novos lançamentos.`
      : "Essa categoria não tem nenhum lançamento ainda.";

    document.getElementById("modalConteudo").innerHTML = `
      <h3 class="modal-title">Excluir "${A.escapeHtml(nomeCategoria)}"?</h3>
      <p class="hint" style="margin-bottom:18px;">${avisoUso}</p>
      <div class="modal-actions">
        <button class="btn-secondary" id="btnCancelarExclusaoCategoria">Cancelar</button>
        <button class="btn-primary" id="btnConfirmarExclusaoCategoria" style="margin-top:0;background:var(--terracotta);">Excluir</button>
      </div>
    `;
    document.getElementById("modalOverlay").hidden = false;

    document.getElementById("btnCancelarExclusaoCategoria").addEventListener("click", () => {
      window.__fecharModal();
    });
    document.getElementById("btnConfirmarExclusaoCategoria").addEventListener("click", () => {
      A.excluirCategoria(tipo, nomeCategoria);
      window.__fecharModal();
      A.mostrarToast(`Categoria "${nomeCategoria}" excluída ✓`);
      renderListaCategoriasGerenciar();
      if (window.__popularCategorias) window.__popularCategorias();
      if (window.__renderHistorico) window.__renderHistorico();
    });
  }

  document.getElementById("inputImportar").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const dados = JSON.parse(ev.target.result);
        if (!Array.isArray(dados)) throw new Error("formato inválido");
        A.lancamentos = dados;
        A.salvarDados();
        document.getElementById("modalMenuOverlay").hidden = true;
        A.mostrarToast("Backup importado ✓");
        atualizarTelaAtual();
      } catch (err) {
        A.mostrarToast("Esse arquivo não parece ser um backup válido.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("menuLimparTudo").addEventListener("click", () => {
    document.getElementById("modalMenuOverlay").hidden = true;
    document.getElementById("modalConteudo").innerHTML = `
      <h3 class="modal-title">Limpar todos os dados?</h3>
      <p class="hint" style="margin-bottom:18px;">Isso vai apagar permanentemente todos os seus lançamentos deste celular. Se quiser manter uma cópia, exporte um backup antes. Essa ação não pode ser desfeita.</p>
      <div class="modal-actions">
        <button class="btn-secondary" id="btnCancelarLimpeza">Cancelar</button>
        <button class="btn-primary" id="btnConfirmarLimpeza" style="margin-top:0;background:var(--terracotta);">Apagar tudo</button>
      </div>
    `;
    document.getElementById("modalOverlay").hidden = false;
    document.getElementById("btnCancelarLimpeza").addEventListener("click", () => window.__fecharModal());
    document.getElementById("btnConfirmarLimpeza").addEventListener("click", () => {
      A.lancamentos = [];
      A.salvarDados();
      window.__fecharModal();
      A.mostrarToast("Todos os dados foram apagados.");
      atualizarTelaAtual();
    });
  });

  function atualizarTelaAtual() {
    if (window.__renderHistorico) window.__renderHistorico();
    if (window.__renderResumo) window.__renderResumo();
    if (window.__renderParcelas) window.__renderParcelas();
    if (window.__renderProjecao) window.__renderProjecao();
  }
})();

/* ==========================================================================
   PARTE 8 — INICIALIZAÇÃO GERAL E SERVICE WORKER
========================================================================== */
(function () {
  "use strict";
  const A = window.__app;

  // garante que o formulário de lançar comece correto
  document.getElementById("campoData").value = A.hojeISO();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("Service worker não registrado:", err);
      });
    });
  }
})();
