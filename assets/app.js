const API_BASE = "https://www.thesportsdb.com/api/v1/json/123";
const EPL_LEAGUE = "English_Premier_League";
const EPL_ID = "4328";
const CACHE_KEY = "epl_scout_cache_v3";
const CACHE_TTL_MS = 30 * 60 * 1000;

const appState = {
  teams: [],
  playersByTeam: new Map(),
  playersById: new Map(),
  teamStatsBySeason: new Map(),
  managerProfiles: new Map(),
  loadedAt: null,
  seasonLabel: currentSeasonLabel(),
  isLoading: true
};

const managerCareerFallback = {
  "Mikel Arteta": "아스널 수석코치 경험 후 아스널 감독으로 부임, 점유 기반 전개와 젊은 스쿼드 육성이 강점.",
  "Pep Guardiola": "바르셀로나, 바이에른 뮌헨, 맨체스터 시티를 거치며 포지셔널 플레이를 정교화한 경력.",
  "Arne Slot": "페예노르트에서 빌드업 중심 축구를 구축했고 이후 프리미어리그에서 전술 완성도를 확장.",
  "Enzo Maresca": "맨시티 코치 경력과 챔피언십 우승 경험을 바탕으로 점유형 4-3-3/4-2-3-1 운용.",
  "Ange Postecoglou": "셀틱 우승 경력과 높은 라인·공격 전개를 강조하는 감독 스타일.",
  "Eddie Howe": "본머스 장기 프로젝트를 이끌었고 뉴캐슬에서 압박 강도와 전환 속도를 강화.",
  "Unai Emery": "세비야 유로파리그 다회 우승, 비야레알 유럽 대회 우승 등 토너먼트 운영 경험 풍부."
};

const positionProfile = {
  gk: ["Reflexes", "Shot Stopping", "Distribution", "Aerial Control"],
  df: ["Tackling", "Positioning", "Aerial Duel", "1v1 Defending"],
  mf: ["Passing", "Vision", "Press Resistance", "Ball Progression"],
  fw: ["Finishing", "Off Ball Movement", "Chance Creation", "Acceleration"]
};

const viewEl = document.getElementById("view");
const heroMetaEl = document.getElementById("hero-meta");

function currentSeasonLabel() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function normalizeName(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  const retries = options.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API 요청 실패: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("요청 실패");
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function parseGoalDetails(goalDetails, teamId, map) {
  if (!goalDetails) return;
  const chunks = goalDetails.split(";").map((v) => v.trim()).filter(Boolean);

  for (const chunk of chunks) {
    const withoutMinute = chunk
      .replace(/\d{1,3}'(\+\d{1,2})?/g, "")
      .replace(/pen\.?/gi, "")
      .replace(/og\.?/gi, "")
      .trim();

    const assistMatch = withoutMinute.match(/\(([^)]+)\)$/);
    const scorerName = withoutMinute.replace(/\(([^)]+)\)$/, "").trim();
    const assistName = assistMatch ? assistMatch[1].trim() : "";

    if (scorerName) {
      const scorerKey = `${teamId}:${normalizeName(scorerName)}`;
      if (!map.has(scorerKey)) map.set(scorerKey, { goals: 0, assists: 0 });
      map.get(scorerKey).goals += 1;
    }

    if (assistName) {
      const assistKey = `${teamId}:${normalizeName(assistName)}`;
      if (!map.has(assistKey)) map.set(assistKey, { goals: 0, assists: 0 });
      map.get(assistKey).assists += 1;
    }
  }
}

async function loadSeasonStats() {
  const byPlayer = new Map();
  const teamFormationAgg = new Map();

  let events = [];
  try {
    const seasonData = await fetchJson(`${API_BASE}/eventsseason.php?id=${EPL_ID}&s=${appState.seasonLabel}`, { retries: 0 });
    events = seasonData.events || [];
  } catch {
    events = [];
  }

  for (const ev of events) {
    const hId = ev.idHomeTeam;
    const aId = ev.idAwayTeam;

    parseGoalDetails(ev.strHomeGoalDetails, hId, byPlayer);
    parseGoalDetails(ev.strAwayGoalDetails, aId, byPlayer);

    if (ev.strHomeFormation) {
      if (!teamFormationAgg.has(hId)) teamFormationAgg.set(hId, new Map());
      const fm = teamFormationAgg.get(hId);
      fm.set(ev.strHomeFormation, (fm.get(ev.strHomeFormation) || 0) + 1);
    }

    if (ev.strAwayFormation) {
      if (!teamFormationAgg.has(aId)) teamFormationAgg.set(aId, new Map());
      const fm = teamFormationAgg.get(aId);
      fm.set(ev.strAwayFormation, (fm.get(ev.strAwayFormation) || 0) + 1);
    }
  }

  appState.teamStatsBySeason = teamFormationAgg;
  return byPlayer;
}

function formationStyle(formation) {
  if (!formation) return "데이터 없음";
  if (formation.includes("4-3-3")) return `${formation} (측면 침투/전방 압박)`;
  if (formation.includes("4-2-3-1")) return `${formation} (10번 활용 + 밸런스)`;
  if (formation.includes("3-4-2-1") || formation.includes("3-5-2")) return `${formation} (백3 기반 전환)`;
  return `${formation} (상대/선수 구성 기반 유연 운용)`;
}

function mostUsedFormation(teamId) {
  const entry = appState.teamStatsBySeason.get(teamId);
  if (!entry || !entry.size) return "데이터 없음";
  return [...entry.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function managerCareerFromDescription(desc) {
  if (!desc) return "공식 데이터에서 감독 경력 설명을 찾지 못했습니다.";
  const sentences = desc.replace(/\s+/g, " ").split(".").map((s) => s.trim()).filter(Boolean);
  return sentences.slice(0, 2).join(". ") + (sentences.length ? "." : "");
}

async function ensureManagerProfile(team) {
  if (appState.managerProfiles.has(team.id)) return appState.managerProfiles.get(team.id);

  const managerName = team.manager || "정보 없음";
  const preferredFormation = mostUsedFormation(team.id);
  let profile = {
    teamId: team.id,
    teamName: team.name,
    managerName,
    preferredPosition: formationStyle(preferredFormation),
    career: managerCareerFallback[managerName] || "공식 데이터에서 감독 경력 설명을 찾지 못했습니다."
  };

  if (managerName && managerName !== "정보 없음") {
    try {
      const person = await fetchJson(`${API_BASE}/searchplayers.php?p=${encodeURIComponent(managerName)}`, { retries: 0 });
      const candidates = person.player || [];
      const best = candidates.find((p) => (p.strTeam || "").toLowerCase() === team.name.toLowerCase()) || candidates[0];
      if (best?.strDescriptionEN) {
        profile = { ...profile, career: managerCareerFromDescription(best.strDescriptionEN) };
      }
    } catch {
      // keep fallback
    }
  }

  appState.managerProfiles.set(team.id, profile);
  return profile;
}

function detectPositionBucket(position) {
  const p = (position || "").toLowerCase();
  if (p.includes("goal")) return "gk";
  if (p.includes("back") || p.includes("defen") || p.includes("centre-back") || p.includes("full-back")) return "df";
  if (p.includes("mid")) return "mf";
  return "fw";
}

function playerSeasonStat(player) {
  return player.season || { goals: 0, assists: 0 };
}

function hydrateFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (!parsed?.loadedAt || !Array.isArray(parsed?.teams) || !Array.isArray(parsed?.players)) return false;

    const age = Date.now() - new Date(parsed.loadedAt).getTime();
    if (age > CACHE_TTL_MS) return false;

    appState.teams = parsed.teams;
    appState.playersById = new Map();
    appState.playersByTeam = new Map();

    parsed.players.forEach((p) => {
      appState.playersById.set(p.id, p);
      if (!appState.playersByTeam.has(p.teamId)) appState.playersByTeam.set(p.teamId, []);
      appState.playersByTeam.get(p.teamId).push(p);
    });

    appState.loadedAt = new Date(parsed.loadedAt);
    appState.isLoading = false;
    heroMetaEl.textContent = `캐시 데이터 표시중 (${appState.loadedAt.toLocaleString("ko-KR")}) · 백그라운드 갱신 중`;
    return true;
  } catch {
    return false;
  }
}

function saveCache() {
  try {
    const payload = {
      loadedAt: appState.loadedAt?.toISOString(),
      teams: appState.teams,
      players: [...appState.playersById.values()]
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function playerCard(p) {
  const s = playerSeasonStat(p);
  return `
    <article class="card">
      <h3>${p.name}</h3>
      <div class="meta">${p.teamName} · ${p.position || "정보 없음"}</div>
      <div class="kv">
        <div class="box"><span class="k">국적</span><span class="v">${p.nationality}</span></div>
        <div class="box"><span class="k">공격포인트</span><span class="v">${s.goals + s.assists} (${s.goals}+${s.assists})</span></div>
      </div>
      <div class="actions">
        <a class="btn primary" href="#/player/${p.id}">선수 페이지</a>
        <a class="btn" href="#/team/${p.teamId}">팀 페이지</a>
      </div>
    </article>
  `;
}

function renderHome() {
  const allPlayers = [...appState.playersById.values()];
  const teamOptions = appState.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="controls">
        <div class="field">
          <label for="q">선수명/국적 검색</label>
          <input id="q" type="text" placeholder="예: Son, Brazilian" />
        </div>
        <div class="field">
          <label for="team">팀별 검색</label>
          <select id="team"><option value="">전체 팀</option>${teamOptions}</select>
        </div>
        <div class="field">
          <label for="pos">포지션</label>
          <select id="pos">
            <option value="">전체 포지션</option>
            <option value="Goalkeeper">Goalkeeper</option>
            <option value="Defender">Defender</option>
            <option value="Midfielder">Midfielder</option>
            <option value="Forward">Forward</option>
          </select>
        </div>
      </div>
      <p class="note">현재 시즌(${appState.seasonLabel}) 공격포인트는 경기 Goal Details 집계 기반입니다.</p>
    </section>
    <section class="section" id="list-wrap"></section>
  `;

  const qEl = document.getElementById("q");
  const teamEl = document.getElementById("team");
  const posEl = document.getElementById("pos");
  const listWrap = document.getElementById("list-wrap");

  const apply = () => {
    const q = normalizeName(qEl.value);
    const teamId = teamEl.value;
    const pos = posEl.value.toLowerCase();

    const filtered = allPlayers.filter((p) => {
      const byTeam = !teamId || p.teamId === teamId;
      const byPos = !pos || p.position.toLowerCase().includes(pos);
      const byQ = !q || normalizeName(`${p.name} ${p.nationality} ${p.teamName}`).includes(q);
      return byTeam && byPos && byQ;
    });

    if (!filtered.length) {
      listWrap.innerHTML = `<div class="empty">조건에 맞는 선수가 없습니다.</div>`;
      return;
    }

    listWrap.innerHTML = `<div class="grid">${filtered.map(playerCard).join("")}</div>`;
  };

  [qEl, teamEl, posEl].forEach((el) => {
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
  });

  apply();
}

function renderTeam(teamId) {
  const team = appState.teams.find((t) => t.id === teamId);
  if (!team) {
    viewEl.innerHTML = `<div class="section empty">팀 정보를 찾지 못했습니다.</div>`;
    return;
  }

  const squad = appState.playersByTeam.get(teamId) || [];

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="actions">
        <a class="btn" href="#/">전체 선수로 돌아가기</a>
        <a class="btn primary" href="#/manager/${team.id}">감독 페이지</a>
      </div>
      <h2>${team.name}</h2>
      <p class="meta">감독: ${team.manager || "정보 없음"} · 홈 구장: ${team.stadium || "정보 없음"}</p>
      <div class="field" style="margin-top:10px;">
        <label for="team-player-q">이 팀 내 선수 검색</label>
        <input id="team-player-q" type="text" placeholder="이름, 포지션, 국적" />
      </div>
    </section>
    <section class="section" id="team-list"></section>
  `;

  const qEl = document.getElementById("team-player-q");
  const listEl = document.getElementById("team-list");

  const renderSquad = () => {
    const q = normalizeName(qEl.value);
    const filtered = squad.filter((p) => normalizeName(`${p.name} ${p.position} ${p.nationality}`).includes(q));

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty">조건에 맞는 선수가 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = `<div class="grid">${filtered.map(playerCard).join("")}</div>`;
  };

  qEl.addEventListener("input", renderSquad);
  renderSquad();
}

function renderPlayer(playerId) {
  const p = appState.playersById.get(playerId);
  if (!p) {
    viewEl.innerHTML = `<div class="section empty">선수 정보를 찾지 못했습니다.</div>`;
    return;
  }

  const stats = playerSeasonStat(p);
  const keySkills = positionProfile[detectPositionBucket(p.position)];

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="actions">
        <a class="btn" href="#/team/${p.teamId}">${p.teamName}로 돌아가기</a>
        <a class="btn" href="#/">전체 보기</a>
      </div>
      <h2>${p.name}</h2>
      <p class="meta">${p.teamName} · ${p.position || "정보 없음"} · ${p.nationality}</p>
      <div class="split" style="margin-top:10px;">
        <div class="card">
          <h3>현재 시즌 공격포인트</h3>
          <table class="table">
            <thead><tr><th>골</th><th>어시스트</th><th>공격포인트</th></tr></thead>
            <tbody><tr><td>${stats.goals}</td><td>${stats.assists}</td><td>${stats.goals + stats.assists}</td></tr></tbody>
          </table>
        </div>
        <div class="card">
          <h3>포지션 주요 능력치</h3>
          <div class="tag-row">${keySkills.map((s) => `<span class="tag">${s}</span>`).join("")}</div>
          <p class="note">능력치는 포지션별 핵심 템플릿이며 실제 수치 통계는 API 제공 범위를 따릅니다.</p>
        </div>
      </div>
      <div class="card" style="margin-top:12px;">
        <h3>기본 정보</h3>
        <div class="kv">
          <div class="box"><span class="k">생년월일</span><span class="v">${p.birth}</span></div>
          <div class="box"><span class="k">신장</span><span class="v">${p.height}</span></div>
          <div class="box"><span class="k">체중</span><span class="v">${p.weight}</span></div>
          <div class="box"><span class="k">소속팀</span><span class="v">${p.teamName}</span></div>
        </div>
      </div>
    </section>
  `;
}

async function renderManager(teamId) {
  const team = appState.teams.find((t) => t.id === teamId);
  if (!team) {
    viewEl.innerHTML = `<div class="section empty">감독 정보를 찾지 못했습니다.</div>`;
    return;
  }

  viewEl.innerHTML = `<div class="section panel">감독 정보를 불러오는 중...</div>`;
  const profile = await ensureManagerProfile(team);

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="actions">
        <a class="btn" href="#/team/${team.id}">${team.name} 페이지</a>
        <a class="btn" href="#/">전체 보기</a>
      </div>
      <h2>${profile.managerName}</h2>
      <p class="meta">${profile.teamName} 감독</p>
      <div class="split" style="margin-top:10px;">
        <div class="card"><h3>선호 포지션/전술 성향</h3><p>${profile.preferredPosition}</p></div>
        <div class="card"><h3>감독 경력</h3><p>${profile.career}</p></div>
      </div>
    </section>
  `;
}

function parseRoute() {
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return { page: "home" };
  if (parts[0] === "team" && parts[1]) return { page: "team", id: parts[1] };
  if (parts[0] === "player" && parts[1]) return { page: "player", id: parts[1] };
  if (parts[0] === "manager" && parts[1]) return { page: "manager", id: parts[1] };
  return { page: "home" };
}

async function router() {
  const route = parseRoute();

  if (appState.isLoading && appState.playersById.size === 0) {
    viewEl.innerHTML = `<div class="section empty">데이터 로딩 중입니다. 잠시만 기다려주세요...</div>`;
    return;
  }

  if (route.page === "home") return renderHome();
  if (route.page === "team") return renderTeam(route.id);
  if (route.page === "player") return renderPlayer(route.id);
  if (route.page === "manager") return renderManager(route.id);
}

async function refreshData() {
  appState.isLoading = true;
  heroMetaEl.textContent = "최신 데이터 동기화 중...";

  const teamData = await fetchJson(`${API_BASE}/search_all_teams.php?l=${EPL_LEAGUE}`, { retries: 1 });
  const teams = (teamData.teams || [])
    .filter((t) => t.strSport === "Soccer")
    .map((t) => ({
      id: t.idTeam,
      name: t.strTeam,
      manager: t.strManager || "정보 없음",
      stadium: t.strStadium || "정보 없음"
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const seasonStats = await loadSeasonStats();
  const playersById = new Map();
  const playersByTeam = new Map();

  let completed = 0;
  await mapLimit(teams, 6, async (team) => {
    try {
      const data = await fetchJson(`${API_BASE}/lookup_all_players.php?id=${team.id}`, { retries: 0 });
      const rows = data.player || [];

      rows.forEach((r) => {
        const norm = normalizeName(r.strPlayer);
        const season = seasonStats.get(`${team.id}:${norm}`) || { goals: 0, assists: 0 };
        const p = {
          id: r.idPlayer || `${team.id}:${norm}`,
          teamId: team.id,
          teamName: team.name,
          name: r.strPlayer || "이름 없음",
          position: r.strPosition || "정보 없음",
          nationality: r.strNationality || "정보 없음",
          birth: r.dateBorn || "정보 없음",
          height: r.strHeight || "정보 없음",
          weight: r.strWeight || "정보 없음",
          season
        };

        playersById.set(p.id, p);
        if (!playersByTeam.has(team.id)) playersByTeam.set(team.id, []);
        playersByTeam.get(team.id).push(p);
      });
    } catch {
      // Skip failing teams and continue.
    } finally {
      completed += 1;
      heroMetaEl.textContent = `최신 데이터 동기화 중... (${completed}/${teams.length}팀)`;
    }
  });

  appState.teams = teams;
  appState.playersById = playersById;
  appState.playersByTeam = playersByTeam;
  appState.loadedAt = new Date();
  appState.isLoading = false;

  saveCache();

  heroMetaEl.textContent = `업데이트: ${appState.loadedAt.toLocaleString("ko-KR")} · 팀 ${teams.length}개 · 선수 ${playersById.size}명 · 시즌 ${appState.seasonLabel}`;
  await router();
}

async function bootstrap() {
  const hasCache = hydrateFromCache();
  await router();

  try {
    await refreshData();
  } catch (err) {
    appState.isLoading = false;
    if (hasCache) {
      heroMetaEl.textContent = `${heroMetaEl.textContent} · 최신 갱신 실패`;
      return;
    }
    heroMetaEl.textContent = "데이터 로드 실패";
    viewEl.innerHTML = `<div class="section empty">오류: ${err.message}</div>`;
  }
}

window.addEventListener("hashchange", () => {
  router();
});

bootstrap();
