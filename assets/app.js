const MENU_DATA = [
  { name: "김치찌개", tags: ["solo", "student", "family"] },
  { name: "된장찌개", tags: ["solo", "student", "family"] },
  { name: "닭가슴살 샐러드", tags: ["diet", "solo"] },
  { name: "연어포케", tags: ["diet", "solo"] },
  { name: "비빔밥", tags: ["solo", "student", "family"] },
  { name: "제육볶음", tags: ["student", "family"] },
  { name: "차돌숙주볶음", tags: ["family", "solo"] },
  { name: "소고기 미역국", tags: ["family", "diet"] },
  { name: "오븐 닭다리구이", tags: ["family", "student"] },
  { name: "두부 스테이크", tags: ["diet", "family"] },
  { name: "참치마요 덮밥", tags: ["student", "solo"] },
  { name: "계란볶음밥", tags: ["student", "solo", "family"] },
  { name: "샤브샤브", tags: ["family", "diet"] },
  { name: "메밀소바", tags: ["solo", "diet"] },
  { name: "삼겹살 + 쌈채소", tags: ["family"] },
  { name: "닭개장", tags: ["family", "solo"] }
];

const STORAGE_KEY = "today_dinner_saved_v1";

const resultEl = document.getElementById("menu-result");
const recommendBtn = document.getElementById("recommend-btn");
const saveBtn = document.getElementById("save-btn");
const clearBtn = document.getElementById("clear-btn");
const savedListEl = document.getElementById("saved-list");
const filterButtons = [...document.querySelectorAll(".filter-btn")];

let activeFilter = "all";
let currentMenu = "";
let savedMenus = loadSavedMenus();

function loadSavedMenus() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedMenus() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedMenus));
}

function getPool() {
  if (activeFilter === "all") return MENU_DATA;
  return MENU_DATA.filter((menu) => menu.tags.includes(activeFilter));
}

function pickRandomMenu() {
  const pool = getPool();
  if (!pool.length) {
    currentMenu = "";
    resultEl.textContent = "해당 필터의 메뉴 데이터가 없어요.";
    return;
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  currentMenu = pool[randomIndex].name;
  resultEl.textContent = currentMenu;
}

function renderSavedMenus() {
  if (!savedMenus.length) {
    savedListEl.innerHTML = '<li class="empty">아직 저장한 메뉴가 없습니다.</li>';
    return;
  }

  savedListEl.innerHTML = savedMenus
    .map((item, index) => `
      <li>
        <div>
          <strong>${item.menu}</strong>
          <div class="saved-meta">${item.filterLabel} · ${item.savedAt}</div>
        </div>
        <button class="secondary" data-remove-index="${index}">삭제</button>
      </li>
    `)
    .join("");
}

function filterLabel(filter) {
  const map = {
    all: "전체",
    solo: "혼밥",
    diet: "다이어트",
    student: "자취생",
    family: "가족용"
  };
  return map[filter] || "전체";
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter || "all";

    filterButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });

    pickRandomMenu();
  });
});

recommendBtn.addEventListener("click", pickRandomMenu);

saveBtn.addEventListener("click", () => {
  if (!currentMenu) {
    resultEl.textContent = "먼저 메뉴를 추천받아주세요.";
    return;
  }

  savedMenus.unshift({
    menu: currentMenu,
    filterLabel: filterLabel(activeFilter),
    savedAt: new Date().toLocaleString("ko-KR")
  });

  if (savedMenus.length > 20) {
    savedMenus = savedMenus.slice(0, 20);
  }

  persistSavedMenus();
  renderSavedMenus();
});

clearBtn.addEventListener("click", () => {
  savedMenus = [];
  persistSavedMenus();
  renderSavedMenus();
});

savedListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const idxText = target.getAttribute("data-remove-index");
  if (idxText === null) return;

  const index = Number(idxText);
  if (Number.isNaN(index)) return;

  savedMenus.splice(index, 1);
  persistSavedMenus();
  renderSavedMenus();
});

renderSavedMenus();
pickRandomMenu();
