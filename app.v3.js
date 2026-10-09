// NFL Live Scores — pulls ESPN's public scoreboard feed and renders
// Live-Activity-style cards. Auto-refreshes every 15s during live games.
(() => {
  const API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
  const LIVE_MS = 15000, IDLE_MS = 60000;
  const $ = (s) => document.querySelector(s);
  const gamesEl = $("#games"), pickEl = $("#pick");

  // Safe storage (falls back to memory if storage is blocked, e.g. in embeds)
  const store = (() => {
    let mem = {};
    try { const k = "__t"; window.localStorage.setItem(k, k); window.localStorage.removeItem(k); return window.localStorage; }
    catch { return { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = String(v)) }; }
  })();

  // Remember a manually chosen game (cleared automatically once it drops off the schedule)
  let current = store.getItem("nfl-game") || "";
  let manual = !!current;
  const fav = "";
  let data = null, timer = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ordinal = (n) => (n > 4 ? (n === 5 ? "OT" : `${n - 4}OT`) : ["", "1st", "2nd", "3rd", "4th"][n]);

  const BALL = `<svg class="ball" viewBox="0 0 34 20" aria-hidden="true"><ellipse cx="17" cy="10" rx="16" ry="9" fill="#2f6feb"/><path d="M10 10h14M13.5 7v6M17 7v6M20.5 7v6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const TV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/></svg>`;

  function timeouts(n, state) {
    if (state !== "in" || n == null || n < 0) return `<div class="tos"></div>`;
    return `<div class="tos" aria-label="${n} timeouts left">${[0, 1, 2].map((i) => `<i class="${i < n ? "" : "used"}"></i>`).join("")}</div>`;
  }

  function parse(ev) {
    const c = ev.competitions[0];
    const st = c.status, type = st.type;
    const sit = c.situation || {};
    const side = (ha) => {
      const t = c.competitors.find((x) => x.homeAway === ha);
      return {
        id: t.team.id, abbr: t.team.abbreviation, name: t.team.displayName,
        logo: t.team.logo || `https://a.espncdn.com/i/teamlogos/nfl/500/${t.team.abbreviation.toLowerCase()}.png`,
        score: t.score ?? "", winner: t.winner,
        rec: (t.records || []).find((r) => r.type === "total")?.summary || "",
      };
    };
    const broadcasts = (c.broadcasts || []).flatMap((b) => b.names || []);
    return {
      id: ev.id, date: new Date(ev.date), state: type.state, detail: type.shortDetail, desc: type.description,
      period: st.period, clock: st.displayClock, halftime: type.name === "STATUS_HALFTIME",
      away: side("away"), home: side("home"),
      poss: sit.possession, dd: sit.downDistanceText || sit.shortDownDistanceText || "",
      redzone: !!sit.isRedZone, last: sit.lastPlay?.text || "",
      awayTO: sit.awayTimeouts, homeTO: sit.homeTimeouts,
      tv: broadcasts.join(", "),
      venue: c.venue?.fullName || "",
    };
  }

  function middle(g) {
    if (g.state === "in") {
      if (g.halftime) return `<div class="mid"><div class="badge">Live</div><div class="period">Halftime</div></div>`;
      const endQ = g.clock === "0:00";
      return `<div class="mid"><div class="badge">Live</div><div class="period">${endQ ? "End " : ""}${ordinal(g.period)}</div><div class="clock">${esc(g.clock)}</div></div>`;
    }
    if (g.state === "post") return `<div class="mid"><div class="final">${g.period > 4 ? "FINAL/OT" : "FINAL"}</div></div>`;
    const day = g.date.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
    const time = g.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `<div class="mid"><div class="pre">${esc(day)}<br>${esc(time)}</div></div>`;
  }

  function team(t, g) {
    const lose = g.state === "post" && t.winner === false;
    const score = g.state === "pre" ? `<div class="rec">${esc(t.rec)}</div>` : `<div class="score">${esc(t.score)}</div>`;
    return `<div class="team ${lose ? "loser" : ""}"><div class="abbr">${esc(t.abbr)}</div>${score}</div>`;
  }

  function card(g) {
    const isFav = fav && (g.home.id === fav || g.away.id === fav);
    const live = g.state === "in";
    const ballA = live && g.poss === g.away.id ? " on" : "";
    const ballH = live && g.poss === g.home.id ? " on" : "";
    const ddText = live ? (g.halftime ? "Halftime" : g.dd) : g.state === "pre" ? g.venue : "";
    return `
    <article class="card ${isFav ? "fav" : ""}" data-id="${g.id}">
      <div class="row">
        <img class="logo-t" src="${esc(g.away.logo)}" alt="${esc(g.away.name)}" loading="lazy">
        ${team(g.away, g)}
        ${middle(g)}
        ${team(g.home, g)}
        <img class="logo-t" src="${esc(g.home.logo)}" alt="${esc(g.home.name)}" loading="lazy">
      </div>
      <div class="sit">
        ${timeouts(g.awayTO, g.state)}
        <div class="poss">${BALL.replace('class="ball"', `class="ball${ballA}"`)}</div>
        <div class="dd ${live && g.redzone ? "rz" : ""}">${esc(ddText)}</div>
        <div class="poss">${BALL.replace('class="ball"', `class="ball${ballH}"`)}</div>
        ${timeouts(g.homeTO, g.state)}
      </div>
      ${live && g.last ? `<p class="last">${esc(g.last)}</p>` : ""}
      <div class="bottom">
        <span class="tv">${TV}${esc(g.tv || "TBD")}</span>
        <span>${esc(g.away.rec && g.state !== "pre" ? `${g.away.rec} · ${g.home.rec}` : "")}</span>
      </div>
    </article>`;
  }

  // ---------- Single-game view ----------
  const ORDER = { in: 0, pre: 1, post: 2 };
  function sorted() {
    return data.events.map(parse).sort((a, b) =>
      ORDER[a.state] - ORDER[b.state] || (a.state === "post" ? b.date - a.date : a.date - b.date));
  }
  // Default game: first live game, else next kickoff, else most recent final
  function pickDefault(games) { return games[0]?.id || ""; }

  function label(g) {
    const m = `${g.away.abbr} @ ${g.home.abbr}`;
    if (g.state === "in") return `● ${m} · ${g.away.score}-${g.home.score} · ${g.halftime ? "Half" : `${ordinal(g.period)} ${g.clock}`}`;
    if (g.state === "post") return `${m} · Final ${g.away.score}-${g.home.score}`;
    return `${m} · ${g.date.toLocaleDateString([], { weekday: "short" })} ${g.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  function fillPicker(games) {
    const groups = [["in", "Live now"], ["pre", "Upcoming"], ["post", "Final"]];
    pickEl.innerHTML = groups.map(([st, name]) => {
      const gs = games.filter((g) => g.state === st);
      return gs.length ? `<optgroup label="${name}">${gs.map((g) => `<option value="${g.id}">${esc(label(g))}</option>`).join("")}</optgroup>` : "";
    }).join("");
    pickEl.value = current;
  }

  function render() {
    if (!data) return;
    const games = sorted();
    if (!games.some((g) => g.id === current)) { current = pickDefault(games); manual = false; }
    if (!manual) current = pickDefault(games);
    fillPicker(games);
    const g = games.find((x) => x.id === current);
    gamesEl.innerHTML = g ? card(g) : `<div class="empty">No games on the schedule right now.</div>`;

    const others = games.filter((x) => x.state === "in" && x.id !== current).length;
    $("#others").textContent = others ? `${others} other game${others > 1 ? "s" : ""} live, use the menu to switch` : "";

    const w = data.week?.number, season = data.season?.year;
    const typ = data.season?.type === 3 ? "Playoffs" : data.season?.type === 1 ? "Preseason" : "Week";
    $("#week").textContent = w ? `${season} · ${typ} ${w}` : "NFL";
  }

  async function load() {
    $("#refresh").classList.add("spin");
    try {
      const r = await fetch(`${API}?_=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      render();
      $("#updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
    } catch (e) {
      $("#updated").textContent = "Couldn't reach scores, retrying";
      if (!data) gamesEl.innerHTML = `<div class="empty">Couldn't load scores. Check your connection.</div>`;
    } finally {
      setTimeout(() => $("#refresh").classList.remove("spin"), 600);
      schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    const anyLive = data?.events?.some((e) => e.competitions[0].status.type.state === "in");
    timer = setTimeout(load, anyLive ? LIVE_MS : IDLE_MS);
  }

  pickEl.addEventListener("change", () => {
    current = pickEl.value; manual = true; store.setItem("nfl-game", current); render();
  });
  $("#refresh").addEventListener("click", load);
  // Refresh immediately when the app comes back to the foreground
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });

  load();
  // Offline app shell (unavailable in sandboxed embeds; ignore failures)
  try { if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {}); } catch {}
})();
