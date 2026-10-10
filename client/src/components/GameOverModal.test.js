import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const filename = fileURLToPath(new URL("./GameOverModal.jsx", import.meta.url));
const stubs = {
  "./Modal": "import React from 'react'; export default function Modal({ children, panelClassName }) { return React.createElement('section', { className: panelClassName }, children) }",
  "./Mascot": "export default function Mascot() { return null }",
  "./Confetti": "export default function Confetti() { return null }",
  "./Icons": "import React from 'react'; export function Icon({ name }) { return React.createElement('i', { 'data-icon': name }) }",
  "./Avatar": "import React from 'react'; export default function Avatar({ index }) { return React.createElement('i', { 'data-avatar': index }) }",
  "./YouTag": "import React from 'react'; export default function YouTag() { return React.createElement('span', { className: 'you-tag' }, 'คุณ') }",
  "../prefs": "export const getUserAuth = () => null; export const addCoins = () => {}",
};
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: "ui-stubs",
    enforce: "pre",
    resolveId(id, importer) {
      return importer === filename && id in stubs ? `\0ui-stub:${id}` : undefined;
    },
    load(id) { return id.startsWith("\0ui-stub:") ? stubs[id.slice(9)] : undefined; },
  }],
});
const { default: GameOverModal } = await vite.ssrLoadModule(filename);
await vite.close();

function render(ranking, meId, extra = {}) {
  return renderToStaticMarkup(React.createElement(GameOverModal, {
    ranking, meId, isHost: false, onPlayAgain() {}, onBackToLobby() {}, onLeave() {}, ...extra,
  }));
}

const leaderboard = (html) => html.match(/<section class="match-ranking"[^>]*>([\s\S]*?)<\/section>/)?.[1];

test("two-player podium has second left and winner centered, with no third place", () => {
  const html = render([
    { playerId: "one", name: "Winner", score: 90 },
    { playerId: "two", name: "Runner", score: 60 },
  ], "two");
  const podium = html.match(/<ol class="podium[^"]*">([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(podium);
  assert.match(podium, /podium__item--2 podium__item--me[\s\S]*Runner[\s\S]*60[\s\S]*podium__item--1[\s\S]*Winner[\s\S]*90/);
  assert.doesNotMatch(podium, /podium__item--3|คุณ|You/);
});

test("Classic podium and full leaderboard keep server rank order and current player identity", () => {
  const html = render([
    { playerId: "one", name: "First", score: 100 },
    { playerId: "two", name: "Second", score: 80 },
    { playerId: "three", name: "Third", score: 60 },
    { playerId: "four", name: "Fourth", score: 40 },
  ], "four");
  assert.match(html, /podium__item--2[\s\S]*Second[\s\S]*podium__item--1[\s\S]*First[\s\S]*podium__item--3[\s\S]*Third/);
  const list = leaderboard(html);
  assert.ok(list);
  assert.match(list, /1\.[\s\S]*First[\s\S]*100[\s\S]*2\.[\s\S]*Second[\s\S]*80[\s\S]*3\.[\s\S]*Third[\s\S]*60[\s\S]*4\.[\s\S]*Fourth[\s\S]*40/);
  assert.equal((list.match(/class="match-ranking__row/g) ?? []).length, 4);
  assert.equal((list.match(/class="you-tag"/g) ?? []).length, 1);
  assert.equal((html.match(/podium__item--me/g) ?? []).length, 0);
  assert.doesNotMatch(html, /class="gains"/);
});

test("two-player podium uses the centered two-column layout", () => {
  const html = render([
    { playerId: "one", name: "Winner", score: 90 },
    { playerId: "two", name: "Runner", score: 60 },
  ], "one");
  assert.match(html, /<ol class="podium podium--two">/);
});

test("Multiplayer vs AI: leaderboard includes all total scores, including zero and departed players", () => {
  const html = render([
    { playerId: "one", name: "First", score: 700, drawPoints: 400, guessPoints: 300, left: false },
    { playerId: "two", name: "Second", score: 300, drawPoints: 300, guessPoints: 0, left: false },
    { playerId: "three", name: "Third", score: 100, drawPoints: 0, guessPoints: 100, left: true },
    { playerId: "four", name: "Fourth", score: 0, drawPoints: 0, guessPoints: 0, left: false },
  ], "two");
  const list = leaderboard(html);
  assert.ok(list);
  assert.equal((list.match(/class="match-ranking__row/g) ?? []).length, 4);
  assert.equal((list.match(/class="you-tag"/g) ?? []).length, 1);
  assert.match(html, /podium__item--2 podium__item--me[\s\S]*Second[\s\S]*300[\s\S]*วาด 300 · ทาย 0/);
  assert.match(html, /podium__item--3[\s\S]*Third[\s\S]*วาด 0 · ทาย 100 · ออกแล้ว/);
  assert.match(list, /1\.[\s\S]*First[\s\S]*700[\s\S]*2\.[\s\S]*Second[\s\S]*300[\s\S]*3\.[\s\S]*Third[\s\S]*ออกแล้ว[\s\S]*100[\s\S]*4\.[\s\S]*Fourth[\s\S]*0/);
  assert.doesNotMatch(list, /วาด 400|ทาย 300/);
});

test("tied and zero-score players keep server order with avatars, host badge, and long names", () => {
  const html = render([
    { playerId: "a", name: "ชื่อภาษาไทยที่ยาวมากเป็นพิเศษ", score: 50, avatar: 2, isHost: true },
    { playerId: "b", name: "ExtraordinarilyLongPlayerName", score: 50, avatar: 3 },
    { playerId: "c", name: "Zero", score: 0, left: true },
  ], "b");
  const list = leaderboard(html);
  assert.match(list, /1\.[\s\S]*ชื่อภาษาไทยที่ยาวมากเป็นพิเศษ[\s\S]*50[\s\S]*2\.[\s\S]*ExtraordinarilyLongPlayerName[\s\S]*50[\s\S]*3\.[\s\S]*Zero[\s\S]*ออกแล้ว[\s\S]*0/);
  assert.match(list, /data-avatar="2"/);
  assert.match(list, /data-avatar="3"/);
  assert.match(list, /tag--host[^>]*title="หัวห้อง"/);
  assert.equal((list.match(/class="you-tag"/g) ?? []).length, 1);
  assert.match(html, /กลับห้องรอ[\s\S]*กลับหน้าแรก/);
});

test("a full individual ranking retains every row and the bottom actions", () => {
  const ranking = Array.from({ length: 8 }, (_, i) => ({
    playerId: `player-${i}`, name: `ผู้เล่นชื่อยาว-${i}`, avatar: i % 6, score: (8 - i) * 10,
  }));
  const html = render(ranking, "player-7", { isHost: true });
  const list = leaderboard(html);
  assert.equal((list.match(/class="match-ranking__row/g) ?? []).length, ranking.length);
  for (const p of ranking) assert.match(list, new RegExp(`title="${p.name}">${p.name}<\\/span>`));
  assert.match(html, /กลับห้องรอ[\s\S]*เล่นอีกรอบเลย[\s\S]*กลับหน้าแรก/);
});

const individualRanking = [
  { playerId: "a1", name: "Private player score", score: 99 },
  { playerId: "b1", name: "Second", score: 1 },
];
const teams = ["A", "B", "C", "D", "E"].map((team, i) => ({
  team, name: `ทีม ${team}`, score: (5 - i) * 100,
  members: [
    { playerId: `${team}1`, name: `สมาชิก ${team} คนแรก`, avatar: i, left: false },
    { playerId: `${team}2`, name: `Long English name ${team}`, avatar: i + 1, left: false },
  ],
}));
const renderTeams = (teamRanking, winner = teamRanking[0]?.team, extra = {}) => render(individualRanking, "a1", { teamRanking, winner, ...extra });
const teamStandings = (html) => html.match(/<section class="team-standings"[^>]*>([\s\S]*?)<\/section>/)?.[1];

test("Team Battle: two actual teams, team winner, no individual podium or private player scores", () => {
  const html = renderTeams(teams.slice(0, 2), "A", { myTeam: "A" });
  assert.match(html, /modal__panel--team-over/);
  assert.match(html, /ทีมผู้ชนะ![\s\S]*ทีม A[\s\S]*สมาชิก A คนแรก × Long English name A[\s\S]*500 คะแนน · ทีมคุณ/);
  assert.match(html, /<ol class="team-podium team-podium--two">/);
  assert.match(html, /team-podium__item--2[\s\S]*ทีม B[\s\S]*team-podium__item--1[\s\S]*ทีม A/);
  assert.doesNotMatch(html, /team-podium__item--3|class="podium__item|match-ranking|Private player score|99/);
  assert.equal((teamStandings(html).match(/class="team-standings__row"/g) ?? []).length, 2);
  assert.match(html, /กลับห้องรอ[\s\S]*กลับหน้าแรก/);
});

test("Team Battle: three-team podium follows server order and standings include all teams", () => {
  const html = renderTeams(teams.slice(0, 3));
  assert.match(html, /team-podium__item--2[\s\S]*ทีม B[\s\S]*team-podium__item--1[\s\S]*ทีม A[\s\S]*team-podium__item--3[\s\S]*ทีม C/);
  const list = teamStandings(html);
  assert.match(list, /1\.[\s\S]*ทีม A[\s\S]*500[\s\S]*2\.[\s\S]*ทีม B[\s\S]*400[\s\S]*3\.[\s\S]*ทีม C[\s\S]*300/);
  assert.equal((list.match(/class="team-standings__row"/g) ?? []).length, 3);
});

for (const count of [4, 5]) {
  test(`Team Battle: ${count} teams all appear in standings with bottom actions`, () => {
    const html = renderTeams(teams.slice(0, count), "A", { isHost: true });
    const list = teamStandings(html);
    assert.equal((list.match(/class="team-standings__row"/g) ?? []).length, count);
    for (const t of teams.slice(0, count)) assert.match(list, new RegExp(t.name));
    assert.match(html, /กลับห้องรอ[\s\S]*เล่นอีกรอบเลย[\s\S]*กลับหน้าแรก/);
  });
}

test("Team Battle: tied zero-score teams do not claim a sole winner and keep server order", () => {
  const tied = teams.slice(0, 3).map((t) => ({ ...t, score: 0 }));
  const html = renderTeams(tied, null);
  assert.match(html, /เสมอกัน![\s\S]*ไม่มีทีมชนะเพียงทีมเดียว/);
  assert.doesNotMatch(html, /ทีมผู้ชนะ!/);
  assert.match(teamStandings(html), /1\.[\s\S]*ทีม A[\s\S]*0[\s\S]*2\.[\s\S]*ทีม B[\s\S]*0[\s\S]*3\.[\s\S]*ทีม C[\s\S]*0/);
});

test("Team Battle: saved departed identities and long names remain visible", () => {
  const departed = { ...teams[0], members: [
    { playerId: "a1", name: "ชื่อภาษาไทยที่ยาวมากเป็นพิเศษ", avatar: 2, left: true },
    { playerId: "a2", name: "ExtraordinarilyLongPlayerName", avatar: 3, left: false },
  ] };
  const html = renderTeams([departed, teams[1]]);
  assert.match(html, /ชื่อภาษาไทยที่ยาวมากเป็นพิเศษ · ออกแล้ว/);
  assert.match(html, /ExtraordinarilyLongPlayerName/);
  assert.match(html, /data-avatar="2"/);
  assert.equal((teamStandings(html).match(/class="team-standings__row"/g) ?? []).length, 2);
});
