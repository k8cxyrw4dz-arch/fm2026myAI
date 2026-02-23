const API_BASE = "https://www.thesportsdb.com/api/v1/json/123";
const EPL_LEAGUE = "English_Premier_League";
const EPL_ID = "4328";
const CACHE_KEY = "epl_scout_cache_v4";
const CACHE_TTL_MS = 30 * 60 * 1000;

const appState = {
  teams: [],
  playersByTeam: new Map(),
  playersById: new Map(),
  teamStatsBySeason: new Map(),
  playerSeasonStats: new Map(),
  managerProfiles: new Map(),
  loadedAt: null,
  seasonLabel: currentSeasonLabel(),
  isLoadingTeams: true
};

const managerCareerFallback = {
  "Mikel Arteta": "아스널 수석코치 경험 후 아스널 감독으로 부임, 점유 기반 전개와 젊은 스쿼드 육성이 강점.",
  "Pep Guardiola": "바르셀로나, 바이에른 뮌헨, 맨체스터 시티를 거치며 포지셔널 플레이를 정교화한 경력.",
  "Arne Slot": "페예노르트에서 빌드업 중심 축구를 구축했고 이후 프리미어리그에서 전술 완성도를 확장.",
  "Enzo Maresca": "맨시티 코치 경력과 챔피언십 우승 경험을 바탕으로 점유형 전술 운용.",
  "Ange Postecoglou": "셀틱 우승 경력과 높은 라인·공격 전개를 강조하는 감독 스타일.",
  "Eddie Howe": "본머스 장기 프로젝트를 이끌었고 뉴캐슬에서 압박 강도와 전환 속도를 강화.",
  "Unai Emery": "세비야 유로파리그 다회 우승 등 유럽 대회 경험이 풍부한 감독."
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

function makePlayerKey(teamId, playerId, playerName) {
  return `${teamId}:${playerId || normalizeName(playerName)}`;
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

  try {
    const seasonData = await fetchJson(`${API_BASE}/eventsseason.php?id=${EPL_ID}&s=${appState.seasonLabel}`, { retries: 0 });
    const events = seasonData.events || [];

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
  } catch {
    // Keep empty stats if season endpoint is unavailable.
  }

  appState.playerSeasonStats = byPlayer;
  appState.teamStatsBySeason = teamFormationAgg;
}

function mostUsedFormation(teamId) {
  const entry = appState.teamStatsBySeason.get(teamId);
  if (!entry || !entry.size) return "데이터 없음";
  return [...entry.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function formationStyle(formation) {
  if (!formation) return "데이터 없음";
  if (formation.includes("4-3-3")) return `${formation} (측면 침투/전방 압박)`;
  if (formation.includes("4-2-3-1")) return `${formation} (10번 활용 + 밸런스)`;
  if (formation.includes("3-4-2-1") || formation.includes("3-5-2")) return `${formation} (백3 기반 전환)`;
  return `${formation} (상대/선수 구성 기반 유연 운용)`;
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
      // Keep fallback.
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
    if (!parsed?.loadedAt || !Array.isArray(parsed?.teams)) return false;

    const age = Date.now() - new Date(parsed.loadedAt).getTime();
    if (age > CACHE_TTL_MS) return false;

    appState.teams = parsed.teams;
    appState.loadedAt = new Date(parsed.loadedAt);

    const cachedTeamPlayers = parsed.playersByTeam || {};
    Object.keys(cachedTeamPlayers).forEach((teamId) => {
      const list = cachedTeamPlayers[teamId] || [];
      appState.playersByTeam.set(teamId, list);
      list.forEach((p) => appState.playersById.set(p.id, p));
    });

    appState.isLoadingTeams = false;
    heroMetaEl.textContent = `캐시 표시 (${appState.loadedAt.toLocaleString("ko-KR")}) · 최신 동기화 중`;
    return true;
  } catch {
    return false;
  }
}

function saveCache() {
  try {
    const playersByTeamObj = {};
    appState.playersByTeam.forEach((players, teamId) => {
      playersByTeamObj[teamId] = players;
    });

    const payload = {
      loadedAt: appState.loadedAt?.toISOString(),
      teams: appState.teams,
      playersByTeam: playersByTeamObj
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors.
  }
}

async function ensureTeamPlayers(teamId) {
  if (appState.playersByTeam.has(teamId)) return appState.playersByTeam.get(teamId);

  const team = appState.teams.find((t) => t.id === teamId);
  if (!team) return [];

  const data = await fetchJson(`${API_BASE}/lookup_all_players.php?id=${teamId}`, { retries: 0 });
  const rows = data.player || [];

  const players = rows.map((r) => {
    const norm = normalizeName(r.strPlayer);
    const season = appState.playerSeasonStats.get(`${teamId}:${norm}`) || { goals: 0, assists: 0 };
    const id = makePlayerKey(teamId, r.idPlayer, r.strPlayer || "");

    return {
      id,
      rawId: r.idPlayer || "",
      teamId,
      teamName: team.name,
      name: r.strPlayer || "이름 없음",
      position: r.strPosition || "정보 없음",
      nationality: r.strNationality || "정보 없음",
      birth: r.dateBorn || "정보 없음",
      height: r.strHeight || "정보 없음",
      weight: r.strWeight || "정보 없음",
      season
    };
  });

  appState.playersByTeam.set(teamId, players);
  players.forEach((p) => appState.playersById.set(p.id, p));
  saveCache();
  return players;
}

function renderHome() {
  const teamOptions = appState.teams
    .map((t) => `<option value="${t.id}">${t.name}</option>`)
    .join("");

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="controls">
        <div class="field">
          <label for="team-q">팀명 검색</label>
          <input id="team-q" type="text" placeholder="예: Arsenal" />
        </div>
        <div class="field">
          <label for="team-select">팀 바로가기</label>
          <select id="team-select"><option value="">선택</option>${teamOptions}</select>
        </div>
        <div class="field">
          <label>데이터 상태</label>
          <input value="팀 데이터 즉시 표시 / 선수는 팀 진입 시 로드" disabled />
        </div>
      </div>
      <p class="note">초기 로딩 최적화: 선수 전체를 선로딩하지 않고 팀 진입 시 가져옵니다.</p>
    </section>
    <section class="section" id="team-list"></section>
  `;

  const qEl = document.getElementById("team-q");
  const selectEl = document.getElementById("team-select");
  const listEl = document.getElementById("team-list");

  const renderTeams = () => {
    const q = normalizeName(qEl.value);
    const filtered = appState.teams.filter((t) => normalizeName(`${t.name} ${t.manager}`).includes(q));

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty">조건에 맞는 팀이 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="grid">
        ${filtered.map((t) => `
          <article class="card">
            <h3>${t.name}</h3>
            <div class="meta">감독: ${t.manager || "정보 없음"}</div>
            <div class="meta">홈 구장: ${t.stadium || "정보 없음"}</div>
            <div class="actions">
              <a class="btn primary" href="#/team/${t.id}">팀 페이지</a>
              <a class="btn" href="#/manager/${t.id}">감독 페이지</a>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  };

  qEl.addEventListener("input", renderTeams);
  selectEl.addEventListener("change", () => {
    if (!selectEl.value) return;
    window.location.hash = `#/team/${selectEl.value}`;
  });

  renderTeams();
}

function playerCard(p) {
  const s = playerSeasonStat(p);
  return `
    <article class="card">
      <h3>${p.name}</h3>
      <div class="meta">${p.position || "정보 없음"} · ${p.nationality}</div>
      <div class="kv">
        <div class="box"><span class="k">공격포인트</span><span class="v">${s.goals + s.assists} (${s.goals}+${s.assists})</span></div>
        <div class="box"><span class="k">소속팀</span><span class="v">${p.teamName}</span></div>
      </div>
      <div class="actions">
        <a class="btn primary" href="#/player/${encodeURIComponent(p.id)}">선수 페이지</a>
      </div>
    </article>
  `;
}

async function renderTeam(teamId) {
  const team = appState.teams.find((t) => t.id === teamId);
  if (!team) {
    viewEl.innerHTML = `<div class="section empty">팀 정보를 찾지 못했습니다.</div>`;
    return;
  }

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="actions">
        <a class="btn" href="#/">팀 목록</a>
        <a class="btn primary" href="#/manager/${team.id}">감독 페이지</a>
      </div>
      <h2>${team.name}</h2>
      <p class="meta">감독: ${team.manager || "정보 없음"} · 홈 구장: ${team.stadium || "정보 없음"}</p>
      <div class="note">선수 데이터를 불러오는 중...</div>
    </section>
  `;

  let squad = [];
  try {
    squad = await ensureTeamPlayers(teamId);
  } catch {
    viewEl.innerHTML = `<div class="section empty">선수 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>`;
    return;
  }

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="actions">
        <a class="btn" href="#/">팀 목록</a>
        <a class="btn primary" href="#/manager/${team.id}">감독 페이지</a>
      </div>
      <h2>${team.name}</h2>
      <p class="meta">감독: ${team.manager || "정보 없음"} · 홈 구장: ${team.stadium || "정보 없음"}</p>
      <div class="field" style="margin-top:10px;">
        <label for="team-player-q">선수 검색</label>
        <input id="team-player-q" type="text" placeholder="이름, 포지션, 국적" />
      </div>
    </section>
    <section class="section" id="team-player-list"></section>
  `;

  const qEl = document.getElementById("team-player-q");
  const listEl = document.getElementById("team-player-list");

  const paint = () => {
    const q = normalizeName(qEl.value);
    const filtered = squad.filter((p) => normalizeName(`${p.name} ${p.position} ${p.nationality}`).includes(q));

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty">조건에 맞는 선수가 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = `<div class="grid">${filtered.map(playerCard).join("")}</div>`;
  };

  qEl.addEventListener("input", paint);
  paint();
}

function renderPlayer(playerId) {
  const p = appState.playersById.get(playerId);
  if (!p) {
    viewEl.innerHTML = `
      <div class="section empty">
        선수 데이터가 아직 로드되지 않았습니다. 팀 페이지에서 먼저 선수를 불러온 뒤 다시 열어주세요.
      </div>
    `;
    return;
  }

  const stats = playerSeasonStat(p);
  const skills = positionProfile[detectPositionBucket(p.position)];

  viewEl.innerHTML = `
    <section class="section panel">
      <div class="actions">
        <a class="btn" href="#/team/${p.teamId}">${p.teamName} 팀 페이지</a>
        <a class="btn" href="#/">팀 목록</a>
      </div>
      <h2>${p.name}</h2>
      <p class="meta">${p.teamName} · ${p.position || "정보 없음"} · ${p.nationality}</p>

      <div class="split" style="margin-top:10px;">
        <div class="card">
          <h3>현재 시즌 공격포인트</h3>
          <table class="table">
            <thead><tr><th>골</th><th>어시스트</th><th>합계</th></tr></thead>
            <tbody><tr><td>${stats.goals}</td><td>${stats.assists}</td><td>${stats.goals + stats.assists}</td></tr></tbody>
          </table>
        </div>

        <div class="card">
          <h3>포지션 주요 능력치</h3>
          <div class="tag-row">${skills.map((s) => `<span class="tag">${s}</span>`).join("")}</div>
          <p class="note">능력치는 포지션 기준 핵심 지표 템플릿입니다.</p>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3>기본 정보</h3>
        <div class="kv">
          <div class="box"><span class="k">생년월일</span><span class="v">${p.birth}</span></div>
          <div class="box"><span class="k">신장</span><span class="v">${p.height}</span></div>
          <div class="box"><span class="k">체중</span><span class="v">${p.weight}</span></div>
          <div class="box"><span class="k">팀</span><span class="v">${p.teamName}</span></div>
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
        <a class="btn" href="#/team/${team.id}">${team.name} 팀 페이지</a>
        <a class="btn" href="#/">팀 목록</a>
      </div>
      <h2>${profile.managerName}</h2>
      <p class="meta">${profile.teamName} 감독</p>
      <div class="split" style="margin-top:10px;">
        <div class="card">
          <h3>선호 포지션/전술 성향</h3>
          <p>${profile.preferredPosition}</p>
        </div>
        <div class="card">
          <h3>감독 경력</h3>
          <p>${profile.career}</p>
        </div>
      </div>
    </section>
  `;
}

function parseRoute() {
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);

  if (!parts.length) return { page: "home" };
  if (parts[0] === "team" && parts[1]) return { page: "team", id: parts[1] };
  if (parts[0] === "manager" && parts[1]) return { page: "manager", id: parts[1] };
  if (parts[0] === "player" && parts[1]) return { page: "player", id: decodeURIComponent(parts[1]) };

  return { page: "home" };
}

async function router() {
  const route = parseRoute();

  if (appState.isLoadingTeams && appState.teams.length === 0) {
    viewEl.innerHTML = `<div class="section empty">팀 데이터를 불러오는 중입니다...</div>`;
    return;
  }

  if (route.page === "home") return renderHome();
  if (route.page === "team") return renderTeam(route.id);
  if (route.page === "manager") return renderManager(route.id);
  if (route.page === "player") return renderPlayer(route.id);
}

async function refreshTeamsAndStats() {
  appState.isLoadingTeams = true;
  heroMetaEl.textContent = "팀/시즌 데이터 동기화 중...";

  const [teamData] = await Promise.all([
    fetchJson(`${API_BASE}/search_all_teams.php?l=${EPL_LEAGUE}`, { retries: 1 }),
    loadSeasonStats()
  ]);

  const teams = (teamData.teams || [])
    .filter((t) => t.strSport === "Soccer")
    .map((t) => ({
      id: t.idTeam,
      name: t.strTeam,
      manager: t.strManager || "정보 없음",
      stadium: t.strStadium || "정보 없음"
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  appState.teams = teams;
  appState.loadedAt = new Date();
  appState.isLoadingTeams = false;

  saveCache();
  heroMetaEl.textContent = `업데이트: ${appState.loadedAt.toLocaleString("ko-KR")} · 팀 ${teams.length}개 · 시즌 ${appState.seasonLabel} · 선수는 팀 진입 시 로드`;
  await router();
}

async function bootstrap() {
  const hasCache = hydrateFromCache();
  await router();

  try {
    await refreshTeamsAndStats();
  } catch (err) {
    appState.isLoadingTeams = false;
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
