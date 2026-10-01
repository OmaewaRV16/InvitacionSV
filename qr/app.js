const CSV_PATH = "./data/cupones_sociedad_valiente.csv";

// WhatsApp de Sociedad Valiente
const CHATBOT_PHONE = "5219993547812";
const DEFAULT_WHATSAPP_MESSAGE = "Hola 👋 me gustaría recibir información sobre la cuponera de Sociedad Valiente.";

const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const categoriesContainer = document.getElementById("categories");
const categoryScroller = document.getElementById("categoryScroller");
const categoryPrev = document.getElementById("categoryPrev");
const categoryNext = document.getElementById("categoryNext");
const couponGrid = document.getElementById("couponGrid");
const resultsCount = document.getElementById("resultsCount");
const emptyState = document.getElementById("emptyState");
const benefitCount = document.getElementById("benefitCount");
const categoryCount = document.getElementById("categoryCount");
const heroChatButton = document.getElementById("heroChatButton");
const emptyChatButton = document.getElementById("emptyChatButton");

const chatbotButton = document.getElementById("chatbotButton");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatBackdrop = document.getElementById("chatBackdrop");
const chatMessages = document.getElementById("chatMessages");
const chatQuickReplies = document.getElementById("chatQuickReplies");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatWhatsappLink = document.getElementById("chatWhatsappLink");

let coupons = [];
let activeCategory = "Todos";
let lastChatQuery = "";
let chatStarted = false;

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];

  // El Excel maestro puede exportar una primera fila con el título
  // "Base maestra de cupones - Sociedad Valiente". Si existe, la saltamos.
  let headerRowIndex = 0;
  const firstCell = normalizeText((rows[0][0] || "").replace(/^\uFEFF/, ""));
  if (firstCell.includes("base maestra de cupones") && rows.length > 1) {
    headerRowIndex = 1;
  }

  // Convertimos encabezados como "Categoría" o "Palabras clave" a
  // categoria / palabras_clave, que son los nombres usados por la web.
  const headers = rows[headerRowIndex].map(header =>
    String(header || "")
      .replace(/^\uFEFF/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  );

  return rows.slice(headerRowIndex + 1).map(values => {
    const item = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = (values[index] ?? "").trim();
    });
    return item;
  });
}

function getCategories() {
  const unique = new Set(
    coupons.map(coupon => coupon.categoria).filter(Boolean)
  );

  return [
    "Todos",
    ...Array.from(unique).sort((a, b) => a.localeCompare(b, "es"))
  ];
}

function updateCategoryNavigation() {
  if (!categoriesContainer || !categoryScroller || !categoryPrev || !categoryNext) return;

  // En celular las flechas están ocultas por CSS y se conserva el gesto táctil.
  if (window.matchMedia("(max-width: 720px)").matches) {
    categoryScroller.classList.remove("at-start", "at-end");
    categoryPrev.disabled = false;
    categoryNext.disabled = false;
    return;
  }

  const maxScroll = Math.max(0, categoriesContainer.scrollWidth - categoriesContainer.clientWidth);
  const atStart = categoriesContainer.scrollLeft <= 3;
  const atEnd = maxScroll <= 3 || categoriesContainer.scrollLeft >= maxScroll - 3;

  categoryScroller.classList.toggle("at-start", atStart);
  categoryScroller.classList.toggle("at-end", atEnd);
  categoryPrev.disabled = atStart;
  categoryNext.disabled = atEnd;
}

function scrollCategories(direction) {
  if (!categoriesContainer) return;

  const amount = Math.max(260, Math.round(categoriesContainer.clientWidth * 0.62));
  categoriesContainer.scrollBy({
    left: direction * amount,
    behavior: "smooth"
  });
}

function renderCategories() {
  categoriesContainer.innerHTML = getCategories()
    .map(category => `
      <button
        type="button"
        class="category-btn ${category === activeCategory ? "active" : ""}"
        data-category="${escapeHTML(category)}"
      >
        ${escapeHTML(category)}
      </button>
    `)
    .join("");

  categoriesContainer
    .querySelectorAll(".category-btn")
    .forEach(button => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        renderCategories();
        renderCoupons();

        const activeButton = categoriesContainer.querySelector(".category-btn.active");
        activeButton?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center"
        });
      });
    });

  requestAnimationFrame(updateCategoryNavigation);
}

function getFilteredCoupons() {
  const query = normalizeText(searchInput.value);

  return coupons.filter(coupon => {
    const categoryMatches =
      activeCategory === "Todos" || coupon.categoria === activeCategory;

    const searchable = normalizeText([
      coupon.nombre,
      coupon.categoria,
      coupon.subcategoria,
      coupon.beneficio,
      coupon.detalles,
      coupon.palabras_clave
    ].join(" "));

    return categoryMatches && (!query || searchable.includes(query));
  });
}

function formatPhone(phone = "") {
  const clean = String(phone).replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return clean;
}

function renderCoupons() {
  const filtered = getFilteredCoupons();

  resultsCount.textContent = filtered.length === 1
    ? "1 beneficio encontrado"
    : `${filtered.length} beneficios encontrados`;

  emptyState.hidden = filtered.length !== 0;
  couponGrid.hidden = filtered.length === 0;

  couponGrid.innerHTML = filtered.map(coupon => {
    const phone = String(coupon.telefono || "").replace(/\D/g, "");

    return `
      <article class="coupon-card">
        <div class="card-top">
          <div>
            <span class="card-category">${escapeHTML(coupon.categoria)}</span>
            ${coupon.subcategoria
              ? `<span class="card-subcategory">${escapeHTML(coupon.subcategoria)}</span>`
              : ""
            }
          </div>
          <span class="card-id">#${escapeHTML(coupon.id)}</span>
        </div>

        <h2>${escapeHTML(coupon.nombre)}</h2>
        <p class="benefit">${escapeHTML(coupon.beneficio)}</p>

        ${coupon.detalles
          ? `<p class="details">${escapeHTML(coupon.detalles)}</p>`
          : ""
        }

        <div class="card-actions">
          ${phone
            ? `<a class="phone-link" href="tel:+52${phone}">Llamar · ${escapeHTML(formatPhone(phone))}</a>`
            : ""
          }
        </div>
      </article>
    `;
  }).join("");
}

async function loadCoupons() {
  try {
    const response = await fetch(CSV_PATH, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`No se pudo cargar el CSV (${response.status})`);
    }

    const text = await response.text();
    const allCoupons = parseCSV(text);

    coupons = allCoupons
      .filter(item => normalizeText(item.estado) === "activo")
      .sort((a, b) => Number(a.orden || 9999) - Number(b.orden || 9999));

    if (benefitCount) benefitCount.textContent = coupons.length;
    if (categoryCount) {
      const totalCategories = new Set(coupons.map(coupon => coupon.categoria).filter(Boolean)).size;
      categoryCount.textContent = `${totalCategories} categorías disponibles`;
    }

    renderCategories();
    renderCoupons();
  } catch (error) {
    console.error(error);
    resultsCount.textContent = "No se pudieron cargar los beneficios.";
    couponGrid.innerHTML = `
      <section class="empty-state">
        <h2>Error al cargar la cuponera</h2>
        <p>Prueba la página con un servidor local, por ejemplo: python3 -m http.server 5500</p>
      </section>
    `;
  }
}

searchInput.addEventListener("input", () => {
  clearSearch.style.display = searchInput.value ? "block" : "none";
  renderCoupons();
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  clearSearch.style.display = "none";
  searchInput.focus();
  renderCoupons();
});


if (categoryPrev && categoryNext && categoriesContainer) {
  categoryPrev.addEventListener("click", () => scrollCategories(-1));
  categoryNext.addEventListener("click", () => scrollCategories(1));

  categoriesContainer.addEventListener("scroll", updateCategoryNavigation, { passive: true });

  // En escritorio, la rueda vertical del mouse también mueve las categorías horizontalmente.
  categoriesContainer.addEventListener("wheel", event => {
    if (window.matchMedia("(max-width: 720px)").matches) return;

    const maxScroll = categoriesContainer.scrollWidth - categoriesContainer.clientWidth;
    if (maxScroll <= 0) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (!delta) return;

    const movingRight = delta > 0;
    const atLeftEdge = categoriesContainer.scrollLeft <= 0;
    const atRightEdge = categoriesContainer.scrollLeft >= maxScroll - 1;

    if ((movingRight && !atRightEdge) || (!movingRight && !atLeftEdge)) {
      event.preventDefault();
      categoriesContainer.scrollBy({ left: delta, behavior: "auto" });
    }
  }, { passive: false });

  window.addEventListener("resize", updateCategoryNavigation, { passive: true });
}

// ------------------------------
// Asistente guiado de la cuponera
// ------------------------------

function buildWhatsAppUrl(query = "") {
  const context = query
    ? `Hola 👋 estaba viendo la cuponera de Sociedad Valiente y estoy buscando información sobre ${query}. ¿Me pueden ayudar?`
    : DEFAULT_WHATSAPP_MESSAGE;

  return `https://api.whatsapp.com/send?phone=${CHATBOT_PHONE}&text=${encodeURIComponent(context)}`;
}

function updateWhatsAppLink(query = "") {
  chatWhatsappLink.href = buildWhatsAppUrl(query);
}

function addChatMessage(content, type = "bot", options = {}) {
  const message = document.createElement("div");
  message.className = `chat-message ${type}`;

  if (options.html) {
    message.innerHTML = content;
  } else {
    message.textContent = content;
  }

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function addTypingThen(callback) {
  const typing = addChatMessage(
    '<span class="typing-dots"><i></i><i></i><i></i></span>',
    "bot typing",
    { html: true }
  );

  window.setTimeout(() => {
    typing.remove();
    callback();
  }, 450);
}

function startChat() {
  if (chatStarted) return;
  chatStarted = true;

  addChatMessage("Hola 👋 Soy el asistente de beneficios de Sociedad Valiente. ¿Qué estás buscando?");
  addChatMessage("Puedes escribir algo como: dentista, lentes, fisioterapia, comida, abogado o universidad.");
  updateWhatsAppLink();
}

function openChat() {
  chatPanel.classList.add("open");
  chatBackdrop.classList.add("open");
  chatPanel.setAttribute("aria-hidden", "false");
  chatbotButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("chat-open");
  startChat();
  window.setTimeout(() => chatInput.focus(), 120);
}

function closeChat() {
  chatPanel.classList.remove("open");
  chatBackdrop.classList.remove("open");
  chatPanel.setAttribute("aria-hidden", "true");
  chatbotButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("chat-open");
}

function getCouponSearchText(coupon) {
  return normalizeText([
    coupon.nombre,
    coupon.categoria,
    coupon.subcategoria,
    coupon.beneficio,
    coupon.detalles,
    coupon.palabras_clave
  ].join(" "));
}

function getQueryWords(query) {
  return normalizeText(query)
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 3)
    .filter(word => ![
      "quiero", "busco", "buscar", "necesito", "tienen", "tiene", "para",
      "sobre", "algo", "algun", "alguna", "informacion", "beneficio", "beneficios",
      "descuento", "descuentos", "favor", "pueden", "ayuda", "hola"
    ].includes(word));
}

function findCouponMatches(query) {
  const normalizedQuery = normalizeText(query);
  const words = getQueryWords(query);

  return coupons
    .map(coupon => {
      const text = getCouponSearchText(coupon);
      let score = 0;

      if (text.includes(normalizedQuery) && normalizedQuery.length >= 3) score += 8;

      words.forEach(word => {
        if (normalizeText(coupon.nombre).includes(word)) score += 6;
        if (normalizeText(coupon.subcategoria).includes(word)) score += 5;
        if (normalizeText(coupon.categoria).includes(word)) score += 4;
        if (normalizeText(coupon.palabras_clave).includes(word)) score += 4;
        if (normalizeText(coupon.beneficio).includes(word)) score += 3;
        if (normalizeText(coupon.detalles).includes(word)) score += 2;
      });

      return { coupon, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.coupon.orden) - Number(b.coupon.orden))
    .slice(0, 4)
    .map(item => item.coupon);
}

function renderChatMatches(matches, query) {
  if (!matches.length) {
    addChatMessage(
      `No encontré un beneficio relacionado con “${query}” en la cuponera. Si quieres, te puedo mandar con el equipo por WhatsApp para que te ayuden.`,
      "bot"
    );
    updateWhatsAppLink(query);
    return;
  }

  const intro = matches.length === 1
    ? "Encontré esta opción para ti 🙌"
    : `Encontré ${matches.length} opciones que podrían servirte 🙌`;

  addChatMessage(intro);

  const html = matches.map(coupon => `
    <button class="chat-result" type="button" data-coupon-query="${escapeHTML(coupon.nombre)}">
      <strong>${escapeHTML(coupon.nombre)}</strong>
      <span>${escapeHTML(coupon.beneficio)}</span>
      <small>${escapeHTML(coupon.categoria)}${coupon.subcategoria ? ` · ${escapeHTML(coupon.subcategoria)}` : ""}</small>
    </button>
  `).join("");

  addChatMessage(`<div class="chat-results">${html}</div>`, "bot result-wrap", { html: true });
  addChatMessage("Puedes tocar una opción para verla en la cuponera o continuar por WhatsApp si necesitas ayuda.");
  updateWhatsAppLink(query);
}

function searchFromChat(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return;

  lastChatQuery = cleanQuery;
  addChatMessage(cleanQuery, "user");
  chatInput.value = "";
  updateWhatsAppLink(cleanQuery);

  addTypingThen(() => {
    const normalized = normalizeText(cleanQuery);

    if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)$/.test(normalized)) {
      addChatMessage("¡Hola! 👋 Dime qué beneficio o servicio estás buscando y te ayudo a encontrarlo.");
      return;
    }

    if (
      normalized.includes("todos los cupones") ||
      normalized.includes("todos los beneficios") ||
      normalized === "cupones" ||
      normalized === "beneficios"
    ) {
      addChatMessage("Claro 🙌 Aquí mismo tienes toda la cuponera. Te llevo al listado completo.");
      activeCategory = "Todos";
      searchInput.value = "";
      clearSearch.style.display = "none";
      renderCategories();
      renderCoupons();
      closeChat();
      window.scrollTo({ top: document.querySelector(".tools").offsetTop, behavior: "smooth" });
      return;
    }

    renderChatMatches(findCouponMatches(cleanQuery), cleanQuery);
  });
}

chatbotButton.addEventListener("click", () => {
  if (chatPanel.classList.contains("open")) {
    closeChat();
  } else {
    openChat();
  }
});

chatClose.addEventListener("click", closeChat);
chatBackdrop.addEventListener("click", closeChat);

chatForm.addEventListener("submit", event => {
  event.preventDefault();
  searchFromChat(chatInput.value);
});

chatQuickReplies.addEventListener("click", event => {
  const button = event.target.closest("button[data-chat-action]");
  if (!button) return;

  const action = button.dataset.chatAction;

  if (action === "all") {
    addChatMessage("Quiero ver todos los beneficios", "user");
    addTypingThen(() => {
      addChatMessage("Claro 🙌 Te llevo al listado completo de la cuponera.");
      activeCategory = "Todos";
      searchInput.value = "";
      clearSearch.style.display = "none";
      renderCategories();
      renderCoupons();
      window.setTimeout(() => {
        closeChat();
        window.scrollTo({ top: document.querySelector(".tools").offsetTop, behavior: "smooth" });
      }, 350);
    });
  }

  if (action === "search") {
    addChatMessage("Quiero buscar un servicio", "user");
    addTypingThen(() => {
      addChatMessage("Perfecto. Escríbeme qué necesitas; por ejemplo: lentes, dentista, abogado, comida o fisioterapia.");
      chatInput.focus();
    });
  }

  if (action === "whatsapp") {
    window.open(buildWhatsAppUrl(lastChatQuery), "_blank", "noopener,noreferrer");
  }
});

chatMessages.addEventListener("click", event => {
  const result = event.target.closest("[data-coupon-query]");
  if (!result) return;

  const query = result.dataset.couponQuery;
  searchInput.value = query;
  clearSearch.style.display = "block";
  activeCategory = "Todos";
  renderCategories();
  renderCoupons();
  closeChat();
  window.setTimeout(() => {
    document.querySelector(".tools").scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && chatPanel.classList.contains("open")) {
    closeChat();
  }
});

if (heroChatButton) heroChatButton.addEventListener("click", openChat);
if (emptyChatButton) emptyChatButton.addEventListener("click", openChat);

updateWhatsAppLink();
loadCoupons();
