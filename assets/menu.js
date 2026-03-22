const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS2yr7f-2kowmlPZNjP2GpVl66rfqUDgomvfWq2K1jJj2eJ_5-I4wxDRqGeVTGDr_pOVK9f37fcv-NT/pub?gid=0&single=true&output=csv";

let allItems = [];
let currentTab = "Comidas";
let currentCategory = null;

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function yes(v) {
  const s = norm(v);
  return s === "sim" || s === "s" || s === "true" || s === "1" || s === "yes";
}

function brl(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* =========================
   REGRA: CERVEJAS + ALCOÓLICOS => BEBIDAS
   ========================= */

const ALCOOL_KEYWORDS = [
  "cerveja", "cervejas", "chopp", "chope", "long neck", "longneck",
  "alcool", "alcoolico", "alco", "alcolico", "alcoólico", "alcoólicas", "alcolicas",
  "drink", "drinks", "coquetel", "coqueteis", "cocktail",
  "caipirinha", "caipiroska", "caipivodka",
  "vodka", "gin", "rum", "tequila", "whisky", "whiskey", "cachaca", "cachaça",
  "licor", "vinho", "espumante", "champanhe", "sake", "saque", "conhaque",
  "pinga", "cerveja artesanal"
];

const ALCOOL_BRANDS = [
  "heineken", "skol", "brahma", "antarctica", "bohemia", "budweiser", "bud",
  "stella", "corona", "original", "serra malte", "amstel", "itaipava",
  "devassa", "eisenbahn", "patagonia", "becks"
];

function isAlcoholOrBeer(categoria, nome, descricao) {
  const text = `${norm(categoria)} ${norm(nome)} ${norm(descricao)}`;

  // Se já é bebidas, beleza
  if (text.includes("bebidas")) return true;

  // Palavras-chave gerais
  if (ALCOOL_KEYWORDS.some(k => text.includes(norm(k)))) return true;

  // Marcas comuns
  if (ALCOOL_BRANDS.some(b => text.includes(norm(b)))) return true;

  return false;
}

// define a aba correta com a regra acima
function computeTab(categoria, nome, descricao) {
  if (isAlcoholOrBeer(categoria, nome, descricao)) return "Bebidas";
  return norm(categoria) === "bebidas" ? "Bebidas" : "Comidas";
}

// tenta pegar campo mesmo se o nome do cabeçalho variar
function pick(row, keys) {
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return row[k];
    const nk = norm(k);
    for (const realKey of rowKeys) {
      if (norm(realKey) === nk && String(row[realKey] ?? "").trim() !== "") return row[realKey];
    }
  }
  return "";
}

function showMessage(title, msg) {
  const t = document.getElementById("boardTitle");
  const el = document.getElementById("menuList");
  if (t) t.textContent = title;
  if (el) el.innerHTML = `<div style="padding:14px;font-weight:800">${msg}</div>`;
}

async function loadMenu() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const csv = await res.text();

    if (csv.toLowerCase().includes("<html") || csv.toLowerCase().includes("<!doctype")) {
      throw new Error("O link retornou HTML (não CSV). Gere o link com output=csv.");
    }

    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data || [];

    const items = rows.map(r => {
      const categoria = pick(r, ["categoria", "Categoria"]);
      const nome = pick(r, ["nome", "Nome", "item", "Item", "produto", "Produto"]);
      const descricao = pick(r, ["descricao", "Descrição", "desc", "Desc"]);
      const preco = pick(r, ["preco", "Preço", "valor", "Valor"]);
      const imagem = pick(r, ["imagem", "Imagem", "img", "Img", "foto", "Foto"]);
      const ativo = pick(r, ["ativo", "Ativo", "disponivel", "Disponível"]);
      const ordem = pick(r, ["ordem", "Ordem"]);

      const catStr = String(categoria).trim();
      const nomeStr = String(nome).trim();
      const descStr = String(descricao).trim();

      return {
        categoria: catStr,
        nome: nomeStr,
        descricao: descStr,
        preco,
        imagem: String(imagem).trim(),
        ativo: yes(ativo),
        ordem: Number(ordem || 9999),

        // AQUI a mudança:
        tab: computeTab(catStr, nomeStr, descStr),
      };
    });

    allItems = items
      .filter(i => i.ativo && i.categoria && i.nome)
      .sort((a, b) =>
        a.tab.localeCompare(b.tab) ||
        a.categoria.localeCompare(b.categoria) ||
        a.ordem - b.ordem
      );

    if (!allItems.length) {
      showMessage(
        "Sem itens",
        "Carreguei a planilha, mas nenhum item passou no filtro. Confira se existe coluna 'ativo' com SIM e colunas de 'categoria' e 'nome'."
      );
      return;
    }

    const first = allItems.find(i => i.tab === currentTab);
    currentCategory = first?.categoria || allItems[0].categoria;

    render();
  } catch (e) {
    showMessage("Erro", `Não carregou a planilha: ${e.message}`);
    console.error(e);
  }
}

function categories() {
  return [...new Set(allItems.filter(i => i.tab === currentTab).map(i => i.categoria))];
}

function viewItems() {
  return allItems.filter(i => i.tab === currentTab && i.categoria === currentCategory);
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === currentTab);
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      const cats = categories();
      currentCategory = cats[0] || currentCategory;
      render();
    };
  });
}

function renderChips() {
  const el = document.getElementById("categoryChips");
  const cats = categories();

  el.innerHTML = cats.map(cat => `
    <button class="chip ${cat === currentCategory ? "active" : ""}" data-cat="${cat}">
      ${cat}
    </button>
  `).join("");

  el.querySelectorAll(".chip").forEach(b => {
    b.onclick = () => { currentCategory = b.dataset.cat; render(); };
  });
}

function renderFeatured() {
  const el = document.getElementById("featuredCards");
  if (!el) return;
  el.innerHTML = "";
}

function renderList() {
  document.getElementById("boardTitle").textContent = currentCategory || "Itens";
  const el = document.getElementById("menuList");
  const items = viewItems();

  el.innerHTML = items.map(i => `
    <div class="row">
      <div class="left">
        <div class="name">${i.nome}</div>
        ${i.descricao ? `<div class="desc">${i.descricao}</div>` : ""}
      </div>
      <div class="price">${brl(i.preco)}</div>
    </div>
  `).join("");
}

function render() {
  renderTabs();
  renderChips();
  renderFeatured();
  renderList();
}

loadMenu();
setInterval(loadMenu, 5 * 60 * 1000);
