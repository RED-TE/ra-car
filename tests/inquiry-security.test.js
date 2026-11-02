const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function bounded(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, "expected code boundary exists");
  return source.slice(start, end);
}

test("retired browser submission neither stores, sends nor retries an inquiry", async () => {
  const calls = [];
  const forbidden = name => () => { calls.push(name); throw new Error("forbidden side effect"); };
  const source = bounded(script, "async function submitLead(", "\nquoteForm?.addEventListener");
  const context = vm.createContext({
    Error, saveLocalLead: forbidden("local"),
    sendLeadToServer: forbidden("server"), sendLeadToFirebase: forbidden("firebase"),
    fetch: forbidden("network"), window: { location: { protocol: "https:" } },
  });
  vm.runInContext(source, context);
  const historical = Object.freeze({ id: "SYNTHETIC-OLD", monthly_payment: 277300 });
  for (const protocol of ["https:", "http:", "file:"]) {
    context.window.location.protocol = protocol;
    await assert.rejects(context.submitLead(historical), { message: "INQUIRY_CHANNEL_RETIRED" });
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(historical, { id: "SYNTHETIC-OLD", monthly_payment: 277300 });
  assert.doesNotMatch(script, /sendLeadToFirebase|sendLeadToServer|\.collection\(["']leads["']\)/);
  assert.match(script, /link\.href = "\/inquiry\/"/);
  assert.match(script, /자동으로 전송하지 않습니다/);
});

test("retired Node handler responds 410 before parsing, file writes, notifications or Firebase", () => {
  const calls = [];
  const fail = name => () => { calls.push(name); throw new Error("forbidden side effect"); };
  const context = vm.createContext({
    sendJson: (_response, status, body) => { calls.push({ status, body }); },
    readRequestBody: fail("parse"), notifyLead: fail("notify"),
    saveLeadToFirebase: fail("firebase"), fs: { promises: { mkdir: fail("mkdir"), appendFile: fail("write") } },
  });
  vm.runInContext(bounded(server, "function handleLeadCreate(", "\nasync function handleLeadList("), context);
  const request = new Proxy({}, { get: fail("request read") });
  context.handleLeadCreate(request, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 410);
  assert.equal(calls[0].body.ok, false);
  assert.equal(calls[0].body.error, "INQUIRY_CHANNEL_RETIRED");
  assert.equal(calls[0].body.inquiry_url, "/inquiry/");
  assert.ok(!("id" in calls[0].body) && !("stored" in calls[0].body));
  assert.match(server, /request\.method === "POST" && url\.pathname === "\/api\/leads"[\s\S]*?handleLeadCreate\(request, response\)/);
});

test("Firestore client create is denied while historical administrative read/update/delete rules remain", () => {
  const leads = bounded(rules, "    match /leads/{leadId} {", "\n    match /admins/{uid}");
  assert.match(leads, /allow create: if false;/);
  assert.equal((leads.match(/allow create:/g) || []).length, 1);
  assert.match(leads, /allow read: if isSuper\(\)[\s\S]*isSd\(\) && sameGroup\(resource\.data\.groupId\)[\s\S]*isAd\(\) && resource\.data\.assignedAdminId == request\.auth\.uid/);
  assert.match(leads, /allow update: if isSuper\(\)[\s\S]*managerLeadUpdateOnly\(\)[\s\S]*adLeadUpdateOnly\(\)/);
  assert.match(leads, /allow delete: if isSuper\(\);/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
});

test("official inquiry failures disclose no server text and never suggest changing networks", async () => {
  const { submissionFailureMessage } = await import("../inquiry/catalog.mjs");
  for (const [status, expected] of [
    [403, "현재 접속 환경"], [429, "요청이 많아"], [503, "접수 보호 기능"],
  ]) {
    const message = submissionFailureMessage(new Error("API_HTTP_" + status));
    assert.ok(message.includes(expected));
    assert.ok(message.includes("차량과 조건은 유지"));
    assert.ok(message.includes("자동 재전송하지 않습니다"));
    assert.doesNotMatch(message, /VPN|다른 IP|다른 네트워크|접수되었습니다/);
  }
  const message = submissionFailureMessage(new Error("SYNTHETIC_SERVER_DETAIL_NOT_FOR_DISPLAY"));
  assert.ok(message.includes("자동 재전송하지 않습니다"));
  assert.ok(!message.includes("SYNTHETIC_SERVER_DETAIL_NOT_FOR_DISPLAY"));
});

test("new inquiry security notice separates collection, IP/name retention and historical consent", () => {
  const inquiry = fs.readFileSync(path.join(root, "inquiry/inquiry.mjs"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
  for (const source of [inquiry, privacy]) {
    assert.match(source, /IP 주소·접수 시각·유입 경로/);
    assert.match(source, /이름 비교용 보안값/);
    assert.match(source, /기존 접수 이름에서 IP별로 생성/);
    assert.match(source, /이름 원문[은을][^<]*별도 복사하지 않습니다/);
    assert.match(source, /IP가 같아도 동일인으로 판단하지 않습니다/);
    assert.match(source, /마지막 관측 후 30일/);
    assert.match(source, /각 생성 후 30일/);
    assert.match(source, /365일 보관/);
    assert.match(source, /적용 이후 신규 문의에만 적용/);
    assert.match(source, /기존 문의·동의 기록을 소급 변경하지 않습니다/);
  }
  assert.match(inquiry, /기존 홈페이지 상담 정책에 따라 상담 종료 후 3개월까지 보관 후 파기/);
  assert.match(inquiry, /href="\/privacy\.html"/);
  assert.match(privacy, /실제 최고관리자에게만 허용/);
});
