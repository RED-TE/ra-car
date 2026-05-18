const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const leadsPath = path.join(dataDir, "leads.jsonl");
const leadMetaPath = path.join(dataDir, "lead-meta.json");
const adminUsersPath = path.join(dataDir, "admin-users.json");
const adminCalendarPath = path.join(dataDir, "admin-calendar.json");
const vehiclePricingPath = path.join(dataDir, "vehicle-pricing.json");
const adminBootstrapPath = path.join(dataDir, "admin-bootstrap.txt");
const portArgIndex = process.argv.indexOf("--port");
const port = Number(process.env.PORT || (portArgIndex > -1 ? process.argv[portArgIndex + 1] : 5173));
const progressStatuses = new Set(["선택", "미배정", "부재", "재연락 예정", "상담", "심사", "발주", "출고", "부결"]);
const recarApiBase = "https://api.recarplan.com";
const vehicleDetailCache = new Map();
const quoteCache = new Map();
let vehiclePricingCache = null;
const apiCacheTtlMs = 5 * 60 * 1000;
const defaultVehicleMileageLimit = 10000;
const monthlyDisplayLiftMin = 20000;
const monthlyDisplayLiftMax = 25000;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "";
const firebaseApiKey = process.env.FIREBASE_API_KEY || "";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const publicStaticFiles = new Set([
  "/index.html",
  "/vehicles.html",
  "/privacy.html",
  "/terms.html",
  "/admin.html",
  "/inquiry/index.html",
  "/data/vehicle-static-catalog.json",
  "/data/vehicles-incomplete-report.json",
  "/data/vehicles-incomplete-report.csv",
  "/styles.css",
  "/script.js",
]);
const publicAssetExtensions = new Set([".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);

function isPublicStaticPath(requestedPath) {
  if (publicStaticFiles.has(requestedPath)) return true;
  if (!requestedPath.startsWith("/assets/")) return false;
  return publicAssetExtensions.has(path.extname(requestedPath).toLowerCase());
}

function getSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...getSecurityHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function sendOptions(response) {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    ...getSecurityHeaders(),
  });
  response.end();
}

function sanitizeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeMemo(value, maxLength = 1000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function makeLeadId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RECAR-${stamp}-${suffix}`;
}

function isLocalRequest(request) {
  return ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
}

function hasAdminAccess(request, url) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return isLocalRequest(request);

  const bearer = request.headers.authorization === `Bearer ${adminToken}`;
  const queryToken = url.searchParams.get("token") === adminToken;
  return bearer || queryToken;
}

function makeAdminId() {
  return `admin_${crypto.randomBytes(8).toString("hex")}`;
}

function makeAdminGroupId() {
  return `group_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeAdminRole(role) {
  if (role === "super") return "super";
  if (role === "sd") return "sd";
  if (role === "ad" || role === "admin") return "ad";
  return "ad";
}

function getAdminRoleLabel(role) {
  const normalizedRole = normalizeAdminRole(role);
  if (normalizedRole === "super") return "최고";
  if (normalizedRole === "sd") return "SD";
  return "AD";
}

function isSuperAdminUser(user) {
  return normalizeAdminRole(user?.role) === "super";
}

function isSdAdminUser(user) {
  return normalizeAdminRole(user?.role) === "sd";
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, passwordHash };
}

function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;

  const hash = crypto.scryptSync(String(password), user.salt, 64);
  const storedHash = Buffer.from(user.passwordHash, "hex");

  return storedHash.length === hash.length && crypto.timingSafeEqual(storedHash, hash);
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function publicAdminUser(user) {
  if (!user) return null;
  const role = normalizeAdminRole(user.role);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role,
    roleLabel: getAdminRoleLabel(role),
    status: user.status,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt || "",
    rejectedAt: user.rejectedAt || "",
  };
}

function publicAdminGroup(group, store) {
  const userById = new Map((store.users || []).map((user) => [user.id, user]));
  const sdUser = group.sdUserId ? userById.get(group.sdUserId) : null;

  return {
    id: group.id,
    name: group.name,
    sdUserId: group.sdUserId || "",
    sdUserName: sdUser ? sdUser.name || sdUser.username : "",
    adUserIds: Array.isArray(group.adUserIds) ? group.adUserIds : [],
    createdAt: group.createdAt || "",
    updatedAt: group.updatedAt || "",
  };
}

async function writeAdminStore(store) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  await fs.promises.writeFile(adminUsersPath, JSON.stringify(store, null, 2), "utf8");
}

async function readAdminStore() {
  await fs.promises.mkdir(dataDir, { recursive: true });

  let store;
  try {
    store = JSON.parse(await fs.promises.readFile(adminUsersPath, "utf8"));
  } catch (error) {
    store = { users: [], sessions: {} };
  }

  if (!Array.isArray(store.users)) store.users = [];
  if (!store.sessions || typeof store.sessions !== "object") store.sessions = {};

  if (!store.users.some((user) => user.role === "super" && user.status === "approved")) {
    const username = normalizeUsername(process.env.SUPER_ADMIN_USERNAME || "owner");
    const password = process.env.SUPER_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
    const { salt, passwordHash } = hashPassword(password);
    const createdAt = new Date().toISOString();

    store.users.unshift({
      id: "owner",
      username,
      name: "총관리자",
      role: "super",
      status: "approved",
      salt,
      passwordHash,
      createdAt,
      approvedAt: createdAt,
    });

    await writeAdminStore(store);
    await fs.promises.writeFile(
      adminBootstrapPath,
      `RE:CAR 총관리자 초기 계정\n아이디: ${username}\n비밀번호: ${password}\n\n로그인 후 비밀번호 파일은 별도 보관하거나 삭제하세요.\n`,
      "utf8",
    );
  }

  return store;
}

async function getAuthenticatedAdmin(request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const store = await readAdminStore();
  const session = store.sessions[token];

  if (!session || Number(session.expiresAt) < Date.now()) {
    if (session) {
      delete store.sessions[token];
      await writeAdminStore(store);
    }
    return null;
  }

  const user = store.users.find((item) => item.id === session.userId);
  if (!user || user.status !== "approved") return null;

  return { token, store, user };
}

async function requireAdmin(request, response) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    sendJson(response, 401, { ok: false, error: "admin_login_required" });
    return null;
  }

  return auth;
}

async function requireSuperAdmin(request, response) {
  const auth = await requireAdmin(request, response);
  if (!auth) return null;

  if (auth.user.role !== "super") {
    sendJson(response, 403, { ok: false, error: "super_admin_required" });
    return null;
  }

  return auth;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error("request_body_too_large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readLeadMeta() {
  try {
    const text = await fs.promises.readFile(leadMetaPath, "utf8");
    return JSON.parse(text || "{}");
  } catch (error) {
    return {};
  }
}

async function writeLeadMeta(meta) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  await fs.promises.writeFile(leadMetaPath, JSON.stringify(meta, null, 2), "utf8");
}

async function readAdminCalendar() {
  try {
    const text = await fs.promises.readFile(adminCalendarPath, "utf8");
    const parsed = JSON.parse(text || "{}");
    return {
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      events: parsed.events && typeof parsed.events === "object" ? parsed.events : {},
    };
  } catch (error) {
    return { notes: {}, events: {} };
  }
}

async function writeAdminCalendar(store) {
  await fs.promises.mkdir(dataDir, { recursive: true });
  await fs.promises.writeFile(adminCalendarPath, JSON.stringify(store, null, 2), "utf8");
}

function getSeoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function makeDateKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function removeMemoGeneratedEvents(store, sourceDate) {
  Object.keys(store.events).forEach((dateKey) => {
    store.events[dateKey] = (store.events[dateKey] || []).filter((event) => event.sourceDate !== sourceDate || event.sourceType !== "memo");
    if (!store.events[dateKey].length) delete store.events[dateKey];
  });
}

function parseMemoEvents(memo, sourceDate, user) {
  const sourceYear = Number(sourceDate.slice(0, 4));
  const events = [];
  const patterns = [
    /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*([^\n,.;]*)/g,
    /(?:(\d{4})[./-])?(\d{1,2})[./-](\d{1,2})\s*([^\n,.;]*)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(memo))) {
      const year = Number(match[1] || sourceYear);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const dateKey = makeDateKey(year, month, day);
      if (!dateKey) continue;

      const title = sanitizeText(
        String(match[4] || "")
          .replace(/^(에|은|는|까지|부터)\s*/, "")
          .trim() || "일정",
        90,
      );
      const idSeed = `${sourceDate}:${dateKey}:${match.index}:${title}`;

      events.push({
        id: crypto.createHash("sha1").update(idSeed).digest("hex").slice(0, 16),
        date: dateKey,
        title,
        sourceDate,
        sourceType: "memo",
        createdBy: user.id,
        createdByName: user.name || user.username,
        createdAt: new Date().toISOString(),
      });
    }
  });

  return events;
}

function getCalendarPayload(store, dateKey, monthKey) {
  const monthEvents = {};
  const monthNotes = {};

  Object.entries(store.events).forEach(([eventDate, events]) => {
    if (eventDate.startsWith(monthKey)) {
      monthEvents[eventDate] = events;
    }
  });

  Object.entries(store.notes).forEach(([noteDate, note]) => {
    if (noteDate.startsWith(monthKey)) {
      monthNotes[noteDate] = note;
    }
  });

  return {
    ok: true,
    date: dateKey,
    month: monthKey,
    memo: store.notes[dateKey]?.memo || "",
    events: store.events[dateKey] || [],
    monthEvents,
    monthNotes,
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getStableMonthlyDisplayLift(seed) {
  const key = String(seed || "recar-vehicle");
  const hash = crypto.createHash("sha1").update(key).digest();
  const step = 100;
  const range = Math.floor((monthlyDisplayLiftMax - monthlyDisplayLiftMin) / step) + 1;
  return monthlyDisplayLiftMin + (hash.readUInt32BE(0) % range) * step;
}

function applyMonthlyDisplayLift(quote, lift) {
  if (!quote || !Number.isFinite(Number(quote.monthlyPayment))) return quote;

  return {
    ...quote,
    monthlyPayment: Math.round(Number(quote.monthlyPayment) + lift),
    displayMonthlyLift: lift,
    monthlyPaymentBeforeLift: quote.monthlyPayment,
  };
}

function toAbsoluteRecarAsset(assetPath) {
  if (!assetPath) return "";
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  return `${recarApiBase}/${String(assetPath).replace(/^\/+/, "")}`;
}

function encodeAssetUrlPart(value) {
  return String(value)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getLocalBrandDirectory(brand) {
  const key = String(brand || "").toLowerCase();
  const brandDirectories = {
    hyundai: "현대",
    kia: "기아",
    genesis: "제네시스",
    "mercedes-benz": "벤츠",
    benz: "벤츠",
    bmw: "BMW",
    audi: "아우디",
    polestar: "폴스타",
    volvo: "볼보",
    landrover: "랜드로버",
    "land rover": "랜드로버",
    tesla: "테슬라",
    lexus: "렉서스",
    mini: "미니",
    porsche: "포르쉐",
    ferrari: "페라리",
    renault: "르노",
    kgm: "KGM",
  };

  return brandDirectories[key] || brandDirectories[getBrandLabel(brand)] || getBrandLabel(brand);
}

function getModelDirectoryCandidates(name, brand) {
  const cleanName = sanitizeText(name, 120);
  const candidates = [
    cleanName,
    cleanName.replace(/\s*하이브리드$/i, ""),
    cleanName.replace(/\s*hybrid$/i, ""),
    cleanName.replace(/\s*EV$/i, ""),
    cleanName.replace(/\s*전동화$/i, ""),
    cleanName.replace(/\s*쿠페$/i, ""),
  ].filter(Boolean);

  const brandKey = String(brand || "").toLowerCase();
  const bmwSeriesMatch = cleanName.match(/^The\s+([1-8])$/i);
  if (brandKey === "bmw" && bmwSeriesMatch) {
    candidates.push(`${bmwSeriesMatch[1]} Series`);
  }

  if (brandKey === "mercedes-benz" || brandKey === "benz") {
    const classMatch = cleanName.match(/^([A-Z]{1,3})-?클래스$/i);
    if (classMatch) {
      candidates.push(`${classMatch[1].toUpperCase()}-Class`);
    }
  }

  if (brandKey === "mercedes-benz" && !cleanName.includes("Class")) {
    candidates.push(`${cleanName}-Class`);
  }

  return [...new Set(candidates)];
}

function getLocalDanawaVehicleImage(brand, name) {
  const brandDirectory = getLocalBrandDirectory(brand);
  if (!brandDirectory || !name) return "";

  for (const modelDirectory of getModelDirectoryCandidates(name, brand)) {
    const filePath = path.join(rootDir, "assets", "danawa", "vehicles", brandDirectory, modelDirectory, "model_360.png");
    if (fs.existsSync(filePath)) {
      return `./assets/danawa/vehicles/${encodeAssetUrlPart(brandDirectory)}/${encodeAssetUrlPart(modelDirectory)}/model_360.png`;
    }
  }

  return "";
}

function getArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function getDefaultVehicleQuery(url) {
  return {
    term: url.searchParams.get("term") || "60",
    deposit_pct: url.searchParams.get("deposit_pct") || "0",
    mileage_limit: url.searchParams.get("mileage_limit") || String(defaultVehicleMileageLimit),
    page: url.searchParams.get("page") || "1",
    size: url.searchParams.get("size") || "20",
  };
}

function getBrandLabel(brand) {
  const key = String(brand || "").toLowerCase();
  const brandLabels = {
    hyundai: "현대",
    kia: "기아",
    genesis: "제네시스",
    tesla: "테슬라",
  };

  return brandLabels[key] || brand;
}

function getFallbackVehicleImage(brand, segment) {
  const brandKey = String(brand || "").toLowerCase();
  const segmentKey = String(segment || "").toLowerCase();

  if (["bmw", "mercedes-benz", "benz", "genesis"].includes(brandKey)) {
    return "./assets/vehicle-premium.jpg";
  }

  if (["suv", "van", "rv"].includes(segmentKey)) {
    return "./assets/vehicle-suv.jpg";
  }

  if (["sedan", "hatchback"].includes(segmentKey)) {
    return "./assets/vehicle-sedan.jpg";
  }

  return "./assets/vehicle-premium.jpg";
}

function getVehicleFallbackImage(brand, name, segment) {
  return getLocalDanawaVehicleImage(brand, name) || getFallbackVehicleImage(brand, segment);
}

function hasDisplayableVehicleImage(vehicle) {
  if (!vehicle) return false;
  if (vehicle.imageUrl) return true;
  return String(vehicle.fallbackImageUrl || "").includes("/assets/danawa/vehicles/");
}

function textIncludes(value, keyword) {
  return String(value || "").toLowerCase().includes(String(keyword || "").toLowerCase());
}

function findVehicleByName(items, brand, keywords) {
  return items.find((item) => {
    const brandMatches = !brand || String(item.brand || "").toLowerCase() === String(brand).toLowerCase();
    const vehicleName = item.name || item.model_name || item.modelName;
    return brandMatches && keywords.some((keyword) => textIncludes(vehicleName, keyword));
  });
}

function createManualVehicle({ id, brand, name, trim, year, segment, fuel, categories, ranks, conditions = {} }) {
  const queryConditions = {
    term: String(conditions.term || 60),
    deposit_pct: String(conditions.deposit_pct ?? conditions.depositPct ?? 0),
    mileage_limit: String(conditions.mileage_limit ?? conditions.mileageLimit ?? defaultVehicleMileageLimit),
  };
  const monthlyDisplayLift = getStableMonthlyDisplayLift(id || name);
  const spreadsheetQuote = applyMonthlyDisplayLift(buildSpreadsheetPricingQuote({ name, conditions: queryConditions }), monthlyDisplayLift);
  const monthlyPayment = spreadsheetQuote?.monthlyPayment ?? null;
  const normalizedConditions = {
    term: Number(queryConditions.term),
    depositPct: Number(queryConditions.deposit_pct),
    mileageLimit: Number(queryConditions.mileage_limit),
  };

  return {
    id,
    brand,
    brandLabel: getBrandLabel(brand),
    name,
    trim,
    year,
    segment,
    fuel,
    imageUrl: "",
    fallbackImageUrl: getVehicleFallbackImage(brand, name, segment),
    monthlyPayment,
    bestQuote: spreadsheetQuote,
    quotes: spreadsheetQuote ? [spreadsheetQuote] : [],
    usedQuoteFallback: !spreadsheetQuote,
    usedSpreadsheetPricing: Boolean(spreadsheetQuote),
    priceFrom: null,
    summary: "상담 후 조건 확인",
    subtitle: `${year}년식 상담 가능`,
    badge: "상담",
    recommendation: "조건 확인 후 맞춤 견적으로 안내드립니다.",
    instantDeliveryAvailable: false,
    categories,
    categoryRanks: ranks,
    conditions: normalizedConditions,
    calculation: {
      basePrice: null,
      baseMonthlyPayment: monthlyPayment,
      residualRatio: null,
      residualValue: null,
      annualIrr: null,
      monthlyIrr: null,
      isEstimated: Boolean(spreadsheetQuote?.isEstimated),
      isSpreadsheetPrice: Boolean(spreadsheetQuote),
      spreadsheetPricing: spreadsheetQuote?.spreadsheetPricing || null,
      quoteSource: spreadsheetQuote?.source || "",
      displayMonthlyLift: monthlyDisplayLift,
      method: spreadsheetQuote
        ? "엑셀 가격표를 우선 적용하고, 요청 주행거리는 1만km 기준 금액 차이를 선형 보정해 계산합니다."
        : "상담 후 금융사 조건을 확인합니다.",
    },
    trims: [],
    isManual: true,
  };
}

function applyCategoryRank(vehicle, category, rank) {
  vehicle.categories = [...new Set([...(vehicle.categories || []), category])];
  vehicle.categoryRanks = {
    ...(vehicle.categoryRanks || {}),
    [category]: rank,
  };
}

function prepareHomepageVehicles(items) {
  const vehicles = items.map((item) => ({
    ...item,
    categories: [],
    categoryRanks: {},
  }));
  const selected = new Map();

  const addTarget = (category, rank, brand, keywords, manualFactory = null) => {
    const foundVehicle = findVehicleByName(vehicles, brand, keywords) || manualFactory?.();
    if (!foundVehicle) return;

    const vehicle = selected.get(foundVehicle.id) || foundVehicle;
    if (!vehicle) return;

    applyCategoryRank(vehicle, category, rank);
    selected.set(vehicle.id, vehicle);
  };

  [
    ["Kia", ["쏘렌토"]],
    ["Kia", ["카니발"]],
    ["Mercedes-Benz", ["S-Class", "S클래스"]],
    [
      "BMW",
      ["X6"],
      () =>
        createManualVehicle({
          id: "manual-bmw-x6",
          brand: "BMW",
          name: "X6",
          trim: "xDrive40i M Sport",
          year: 2026,
          segment: "suv",
          fuel: "gas",
          categories: [],
          ranks: {},
        }),
    ],
    ["Kia", ["스포티지"]],
  ].forEach(([brand, keywords, manualFactory], index) => {
    addTarget("time", index + 1, brand, keywords, manualFactory);
  });

  [
    ["Hyundai", ["그랜저"]],
    ["Hyundai", ["아반떼"]],
    ["Kia", ["K5"]],
    ["Hyundai", ["쏘나타 디 엣지"]],
    ["Genesis", ["G80"]],
  ].forEach(([brand, keywords], index) => {
    addTarget("sedan", index + 1, brand, keywords);
  });

  [
    ["Kia", ["스포티지"]],
    ["Hyundai", ["싼타페"]],
    ["Kia", ["쏘렌토"]],
    ["Hyundai", ["투싼"]],
    ["Genesis", ["GV80"]],
  ].forEach(([brand, keywords], index) => {
    addTarget("suv", index + 1, brand, keywords);
  });

  [
    ["Mercedes-Benz", ["S-Class", "S클래스"]],
    [
      "BMW",
      ["X6"],
      () =>
        createManualVehicle({
          id: "manual-bmw-x6",
          brand: "BMW",
          name: "X6",
          trim: "xDrive40i M Sport",
          year: 2026,
          segment: "suv",
          fuel: "gas",
          categories: [],
          ranks: {},
        }),
    ],
    ["BMW", ["5시리즈", "5 Series"]],
    ["Mercedes-Benz", ["GLC"]],
    ["Mercedes-Benz", ["E-Class"]],
  ].forEach(([brand, keywords, manualFactory], index) => {
    addTarget("imported", index + 1, brand, keywords, manualFactory);
  });

  return [...selected.values()].sort((a, b) => {
    const priority = ["time", "sedan", "suv", "imported"];
    const aPriority = priority.findIndex((category) => a.categoryRanks?.[category]);
    const bPriority = priority.findIndex((category) => b.categoryRanks?.[category]);
    const aGroup = aPriority === -1 ? 99 : aPriority;
    const bGroup = bPriority === -1 ? 99 : bPriority;

    if (aGroup !== bGroup) return aGroup - bGroup;
    const category = priority[Math.min(aGroup, bGroup)] || "time";
    return (a.categoryRanks?.[category] || 999) - (b.categoryRanks?.[category] || 999);
  });
}

async function fetchRecarJson(pathname, options = {}) {
  const apiUrl = new URL(pathname, recarApiBase);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      apiUrl.searchParams.set(key, value);
    }
  });

  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
    },
  };

  if (options.body) {
    fetchOptions.headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(apiUrl, fetchOptions);
  if (response.status === 404 && options.allow404) {
    return { ok: false, status: 404, body: null };
  }

  if (!response.ok) {
    throw new Error(`recar_api_${response.status}`);
  }

  return { ok: true, status: response.status, body: await response.json() };
}

function normalizeQuote(rawQuote, source = "quotes") {
  const monthlyPayment = numberOrNull(rawQuote?.monthly_payment ?? rawQuote?.monthlyPayment);
  if (!monthlyPayment) return null;

  const annualIrr = numberOrNull(rawQuote.annual_irr ?? rawQuote.annualIrr ?? rawQuote.irr ?? rawQuote.interest_rate ?? rawQuote.interestRate);

  return {
    source,
    id: sanitizeText(rawQuote.id, 120),
    financeCompany: sanitizeText(rawQuote.finance_company ?? rawQuote.financeCompany, 80),
    financeCompanyKr: sanitizeText(rawQuote.finance_company_kr ?? rawQuote.financeCompanyKr, 80),
    contractMonths: numberOrNull(rawQuote.contract_months ?? rawQuote.contractMonths),
    prepayPct: numberOrNull(rawQuote.prepay_pct ?? rawQuote.prepayPct),
    annualKm: numberOrNull(rawQuote.annual_km ?? rawQuote.annualKm),
    monthlyPayment,
    residualValue: numberOrNull(rawQuote.residual_value ?? rawQuote.residualValue),
    residualRatio: numberOrNull(rawQuote.residual_ratio ?? rawQuote.residualRatio),
    annualIrr,
    monthlyIrr: annualIrr ? annualIrr / 12 : null,
    isEstimated: Boolean(rawQuote.is_estimated ?? rawQuote.isEstimated),
  };
}

function normalizeVehicleOption(option) {
  if (!option) return null;

  return {
    id: sanitizeText(option.id, 120),
    name: sanitizeText(option.display_name || option.displayName || option.name, 160),
    badge: sanitizeText(option.badge || (option.is_default ? "기본" : ""), 40),
    category: sanitizeText(option.category, 60),
    price: numberOrNull(option.price),
    isDefault: Boolean(option.is_default ?? option.isDefault),
  };
}

function normalizeVehicleTrim(trim) {
  if (!trim) return null;

  const options = Array.isArray(trim.options) ? trim.options.map(normalizeVehicleOption).filter(Boolean) : [];
  const colors = Array.isArray(trim.colors)
    ? trim.colors.map((color) => ({
        id: sanitizeText(color.id, 120),
        name: sanitizeText(color.display_name || color.displayName || color.name, 120),
        code: sanitizeText(color.code || color.color_code || color.colorCode, 60),
        hex: sanitizeText(color.hex || color.hex_code || color.hexCode, 30),
        imageUrl: toAbsoluteRecarAsset(color.image_url || color.imageUrl || color.thumbnail_url || color.thumbnailUrl),
      }))
    : [];

  return {
    id: sanitizeText(trim.id, 120),
    name: sanitizeText(trim.display_name || trim.displayName || trim.name, 160),
    modelSpec: sanitizeText(trim.model_spec || trim.modelSpec, 120),
    price: numberOrNull(trim.price),
    description: sanitizeText(trim.description, 220),
    badge: sanitizeText(trim.badge, 40),
    isAvailable: trim.is_available !== false && trim.isAvailable !== false,
    options,
    colors,
  };
}

function getUniqueOptions(trims, topLevelOptions = []) {
  const map = new Map();
  const sourceOptions = [
    ...(Array.isArray(topLevelOptions) ? topLevelOptions.map(normalizeVehicleOption).filter(Boolean) : []),
    ...trims.flatMap((trim) => trim.options || []),
  ];

  sourceOptions.forEach((option) => {
    const key = `${option.category || ""}:${option.name}`;
    if (!map.has(key)) map.set(key, option);
  });

  return [...map.values()];
}

function getVehicleTextTokens(...values) {
  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getInferredBasePrice({ brand, name, segment, fuel, trims = [] }) {
  const directPrice = trims.map((trim) => numberOrNull(trim.price)).find((price) => price && price > 0);
  if (directPrice) return directPrice;

  const token = getVehicleTextTokens(brand, name, segment, fuel);
  const hints = [
    [/s-?class|s클래스|s class/, 155000000],
    [/x6/, 122000000],
    [/x5/, 108000000],
    [/7시리즈|7 series|7-series/, 155000000],
    [/5시리즈|5 series|5-series/, 72000000],
    [/e-?class|e클래스|e class/, 82000000],
    [/glc/, 82000000],
    [/gle/, 118000000],
    [/g80/, 61000000],
    [/g90/, 96000000],
    [/gv80/, 72000000],
    [/gv70/, 55000000],
    [/카니발|carnival/, 41000000],
    [/쏘렌토|sorento/, 43000000],
    [/스포티지|sportage/, 32000000],
    [/싼타페|santa fe|santafe/, 42000000],
    [/팰리세이드|palisade/, 46000000],
    [/그랜저|grandeur/, 39000000],
    [/쏘나타|sonata/, 31000000],
    [/아반떼|avante|elantra/, 24000000],
    [/k8/, 38000000],
    [/k5/, 30000000],
    [/model y|모델 y/, 56000000],
    [/model 3|모델 3/, 47000000],
    [/tesla|테슬라/, 58000000],
    [/porsche|포르쉐|panamera|cayenne/, 128000000],
    [/ferrari|페라리/, 360000000],
    [/land rover|랜드로버|range rover|레인지로버/, 135000000],
  ];
  const matched = hints.find(([pattern]) => pattern.test(token));
  if (matched) return matched[1];

  if (/mercedes|benz|벤츠|bmw|audi|아우디|volvo|볼보|lexus|렉서스|mini|미니|polestar|폴스타/.test(token)) {
    if (/suv|rv|x[1-9]|gl|xc|q[1-9]/.test(token)) return 82000000;
    return 68000000;
  }

  if (/genesis|제네시스/.test(token)) {
    return /suv|rv|gv/.test(token) ? 62000000 : 54000000;
  }

  if (/suv|rv|van|mpv|카니발|스타리아/.test(token)) return 39000000;
  if (/electric|ev|전기|hybrid|하이브리드/.test(token)) return 42000000;
  return 34000000;
}

function getFallbackResidualRatio({ brand, name, segment, fuel, term, mileageLimit, basePrice }) {
  const token = getVehicleTextTokens(brand, name, segment, fuel);
  let ratio = 0.44;

  if (/suv|rv|van|mpv|카니발|쏘렌토|스포티지|팰리세이드|sorento|sportage|carnival/.test(token)) ratio += 0.04;
  if (/hybrid|하이브리드/.test(token)) ratio += 0.02;
  if (/electric|ev|전기|tesla|테슬라|polestar|폴스타/.test(token)) ratio -= 0.02;
  if (/genesis|제네시스/.test(token)) ratio += 0.01;
  if (/mercedes|benz|벤츠|bmw|audi|아우디|volvo|볼보|lexus|렉서스|porsche|포르쉐|land rover|랜드로버|mini|미니/.test(token)) ratio -= 0.03;
  if (/s-?class|s클래스|7시리즈|g90|x6|range rover|레인지로버|porsche|포르쉐|ferrari|페라리/.test(token)) ratio -= 0.03;
  if (basePrice >= 120000000) ratio -= 0.02;

  ratio += (60 - term) * 0.004;
  ratio += (defaultVehicleMileageLimit - mileageLimit) / 10000 * 0.015;

  return Math.min(0.62, Math.max(0.28, Number(ratio.toFixed(3))));
}

function getFallbackAnnualIrr({ brand, name, segment, fuel, basePrice }) {
  const token = getVehicleTextTokens(brand, name, segment, fuel);
  let rate = 0.076;

  if (/hyundai|kia|현대|기아/.test(token)) rate -= 0.004;
  if (/genesis|제네시스/.test(token)) rate += 0.004;
  if (/mercedes|benz|벤츠|bmw|audi|아우디|volvo|볼보|lexus|렉서스|porsche|포르쉐|land rover|랜드로버|mini|미니|tesla|테슬라|polestar|폴스타/.test(token)) rate += 0.012;
  if (/electric|ev|전기|tesla|테슬라|polestar|폴스타/.test(token)) rate += 0.004;
  if (/s-?class|s클래스|7시리즈|g90|x6|range rover|레인지로버|porsche|포르쉐|ferrari|페라리/.test(token)) rate += 0.008;
  if (basePrice >= 100000000) rate += 0.006;

  return Math.min(0.115, Math.max(0.062, Number(rate.toFixed(4))));
}

function calculateFallbackMonthlyPayment({ basePrice, residualRatio, annualIrr, term, depositPct, brand, segment }) {
  const prepayRatio = Math.max(0, 1 - Number(depositPct || 0) / 100);
  const capCost = basePrice * prepayRatio;
  const residualValue = basePrice * residualRatio;
  const depreciation = Math.max(0, (capCost - residualValue) / term);
  const financeCharge = ((capCost + residualValue) / 2) * (annualIrr / 12);
  const serviceFeeRate = /mercedes|benz|벤츠|bmw|audi|아우디|porsche|포르쉐|land rover|랜드로버|ferrari|페라리|tesla|테슬라|polestar|폴스타/i.test(String(brand || "")) ? 0.00065 : 0.00048;
  const operationFee = Math.max(18000, basePrice * serviceFeeRate);
  const monthlyPayment = depreciation + financeCharge + operationFee;

  return Math.max(0, Math.round(monthlyPayment / 100) * 100);
}

function buildEstimatedQuote({ brand, name, segment, fuel, basePrice, conditions }) {
  if (!basePrice || basePrice <= 0) return null;

  const term = Number(conditions.term || 60);
  const depositPct = Number(conditions.deposit_pct || 0);
  const mileageLimit = Number(conditions.mileage_limit || defaultVehicleMileageLimit);
  const residualRatio = getFallbackResidualRatio({ brand, name, segment, fuel, term, mileageLimit, basePrice });
  const residualValue = Math.round((basePrice * residualRatio) / 10000) * 10000;
  const annualIrr = getFallbackAnnualIrr({ brand, name, segment, fuel, basePrice });
  const monthlyPayment = calculateFallbackMonthlyPayment({
    basePrice,
    residualRatio,
    annualIrr,
    term,
    depositPct,
    brand,
    segment,
  });

  return {
    source: "estimated",
    id: "internal-estimate",
    financeCompany: "internal",
    financeCompanyKr: "RE:CAR 예상 산식",
    contractMonths: term,
    prepayPct: depositPct,
    annualKm: mileageLimit,
    monthlyPayment,
    residualValue,
    residualRatio,
    annualIrr,
    monthlyIrr: annualIrr / 12,
    isEstimated: true,
  };
}

function enrichQuoteWithFallbacks(quote, estimatedQuote) {
  if (!quote || !estimatedQuote) return quote || estimatedQuote || null;

  return {
    ...quote,
    residualValue: quote.residualValue ?? estimatedQuote.residualValue,
    residualRatio: quote.residualRatio ?? estimatedQuote.residualRatio,
    annualIrr: quote.annualIrr ?? estimatedQuote.annualIrr,
    monthlyIrr: quote.monthlyIrr ?? estimatedQuote.monthlyIrr,
    isEstimated: Boolean(quote.isEstimated),
  };
}

function normalizeVehiclePricingKey(value) {
  let key = String(value || "")
    .toLowerCase()
    .replace(/\b([aces])-?class\b/g, "$1클래스")
    .replace(/\b(cla|cle|gla|glb|glc|gle|gls)-?class\b/g, "$1")
    .replace(/([1-9])\s*series/g, "the$1")
    .replaceAll("하이브리드", "hybrid")
    .replaceAll("hev", "hybrid")
    .replaceAll("electric", "ev")
    .replaceAll("일렉트릭", "ev")
    .replaceAll("이브이", "ev")
    .replaceAll("전동화", "ev")
    .replaceAll("디 올 뉴", "")
    .replaceAll("더 뉴", "")
    .replaceAll("the ", "")
    .replace(/[^0-9a-z가-힣]+/g, "");
  key = key.replace(/([1-9])시리즈/g, "the$1");
  return key;
}

function readVehiclePricing() {
  if (vehiclePricingCache) return vehiclePricingCache;

  try {
    const text = fs.readFileSync(vehiclePricingPath, "utf8");
    const pricing = JSON.parse(text);
    pricing.entryByKey = new Map();
    (pricing.entries || []).forEach((entry) => {
      if (entry.key) pricing.entryByKey.set(entry.key, entry);
      const normalizedName = normalizeVehiclePricingKey(entry.name);
      if (normalizedName && !pricing.entryByKey.has(normalizedName)) {
        pricing.entryByKey.set(normalizedName, entry);
      }
    });
    vehiclePricingCache = pricing;
  } catch (error) {
    vehiclePricingCache = {
      baseAnnualKm: 10000,
      defaultMileageStepRatioPer10000Km: 0.025,
      entries: [],
      entryByKey: new Map(),
    };
  }

  return vehiclePricingCache;
}

function findSpreadsheetPricingEntry(name) {
  const pricing = readVehiclePricing();
  const key = normalizeVehiclePricingKey(name);
  if (!key) return null;

  const exact = pricing.entryByKey.get(key);
  if (exact) return exact;

  const candidates = (pricing.entries || [])
    .filter((entry) => {
      if (!entry.key || entry.key.length < 3) return false;
      return key.includes(entry.key) || entry.key.includes(key);
    })
    .sort((a, b) => b.key.length - a.key.length);

  return candidates[0] || null;
}

function selectSpreadsheetProduct(entry) {
  if (!entry?.products) return null;
  const product = entry.products.rent || entry.products.lease || Object.values(entry.products)[0];
  const productKey = entry.products.rent ? "rent" : entry.products.lease ? "lease" : Object.keys(entry.products)[0];

  return product ? { productKey, product } : null;
}

function getSpreadsheetTermMonthly(product, term) {
  const termKey = String(term);
  const actualMonthly = numberOrNull(product.actualMonthly?.[termKey]);
  const tableMonthly = numberOrNull(product.monthly?.[termKey]);

  if (actualMonthly) {
    return {
      monthly: actualMonthly,
      isTermEstimated: false,
      method: "actual",
    };
  }

  if (tableMonthly) {
    return {
      monthly: tableMonthly,
      isTermEstimated: true,
      method: "table-regression",
    };
  }

  const slope = numberOrNull(product.regression?.slopePerMonth);
  const intercept = numberOrNull(product.regression?.intercept);
  if (slope !== null && intercept !== null) {
    return {
      monthly: Math.max(0, Math.round((slope * term + intercept) / 100) * 100),
      isTermEstimated: true,
      method: "linear-regression",
    };
  }

  const fallback = numberOrNull(product.minMonthly);
  return fallback
    ? { monthly: fallback, isTermEstimated: true, method: "fallback-min" }
    : { monthly: null, isTermEstimated: true, method: "missing" };
}

function buildSpreadsheetPricingQuote({ name, conditions, entry: directEntry = null }) {
  const pricing = readVehiclePricing();
  const entry = directEntry || findSpreadsheetPricingEntry(name);
  const selection = selectSpreadsheetProduct(entry);
  if (!entry || !selection) return null;

  const term = Number(conditions.term || 60);
  const annualKm = Number(conditions.mileage_limit || conditions.annual_km || defaultVehicleMileageLimit);
  const depositPct = Number(conditions.deposit_pct || 0);
  const baseAnnualKm = Number(pricing.baseAnnualKm || 10000);
  const mileageStepRatio = Number(pricing.defaultMileageStepRatioPer10000Km || 0.025);
  const termResult = getSpreadsheetTermMonthly(selection.product, term);
  if (!termResult.monthly) return null;

  const mileageSteps = (annualKm - baseAnnualKm) / 10000;
  const mileageMultiplier = Math.max(0.75, 1 + mileageSteps * mileageStepRatio);
  const monthlyPayment = Math.max(0, Math.round((termResult.monthly * mileageMultiplier) / 100) * 100);
  const mileageDelta = monthlyPayment - termResult.monthly;
  const isMileageEstimated = Math.abs(mileageSteps) > 0.001;

  return {
    source: "spreadsheet",
    id: `spreadsheet-${entry.key}-${selection.productKey}-${term}-${annualKm}`,
    financeCompany: "spreadsheet",
    financeCompanyKr: `가격표 ${selection.product.label || selection.productKey}`,
    contractMonths: term,
    prepayPct: depositPct,
    annualKm,
    monthlyPayment,
    residualValue: null,
    residualRatio: null,
    annualIrr: null,
    monthlyIrr: null,
    isEstimated: Boolean(termResult.isTermEstimated || isMileageEstimated),
    isSpreadsheetPrice: true,
    spreadsheetPricing: {
      matchedKey: entry.key,
      matchedName: entry.name,
      productKey: selection.productKey,
      productLabel: selection.product.label,
      baseAnnualKm,
      baseMonthly: termResult.monthly,
      requestedAnnualKm: annualKm,
      mileageStepRatio,
      mileageDelta,
      mileageMultiplier,
      termMethod: termResult.method,
      basis: selection.product.basis || pricing.basis,
    },
  };
}

function inferSpreadsheetVehicleBrand(name) {
  const key = normalizeVehiclePricingKey(name);

  if (/^(g70|g80|g90|gv60|gv70|gv80)/.test(key)) return "Genesis";
  if (/^(ev[2-9]|k[589]|pv5)/.test(key) || /(니로|레이|모닝|셀토스|스포티지|쏘렌토|카니발)/.test(key)) return "Kia";
  if (/(그랜저|베뉴|스타리아|쏘나타|아반떼|아이오닉|캐스퍼|코나|투싼|팰리세이드)/.test(key)) return "Hyundai";
  if (/(그랑콜레오스|아르카나|세닉|필랑트)/.test(key)) return "Renault";
  if (/(티볼리|렉스턴|액티언|토레스)/.test(key)) return "KGM";
  if (/^(a|c|e|s)클래스/.test(key) || /^(cla|cle|eqa|eqb|eqe|gla|glb|glc|gle|sl)$/.test(key)) return "Mercedes-Benz";
  if (/^(a6|q8)$/.test(key)) return "Audi";
  if (/^(m[23458]|the[123457]|x[123567]|x[56]m|z4|i4|i5|i7|ix|ix1|ix2)$/.test(key)) return "BMW";
  if (/^(model3|modelx|modely|modelyl|cybertruck)$/.test(key)) return "Tesla";
  if (/^(es|nx|rx|ux)$/.test(key)) return "Lexus";
  if (/^(ex30|ex30cc|s90|xc40|xc60|xc90)$/.test(key)) return "Volvo";

  return "";
}

function inferSpreadsheetVehicleSegment(name) {
  const key = normalizeVehiclePricingKey(name);
  const suvLike = [
    "ev3",
    "ev5",
    "ev6",
    "ev6gt",
    "ev9",
    "pv5",
    "gv60",
    "gv70",
    "gv80",
    "gla",
    "glb",
    "glc",
    "gle",
    "eqb",
    "q8",
    "nx",
    "rx",
    "ux",
    "ex30",
    "ex30cc",
    "xc40",
    "xc60",
    "xc90",
    "x1",
    "x2",
    "x3",
    "x5",
    "x5m",
    "x6",
    "x6m",
    "x7",
    "ix",
    "ix1",
    "ix2",
    "modelx",
    "modely",
    "modelyl",
    "cybertruck",
  ];
  const suvKorean = /(니로|셀토스|스포티지|쏘렌토|카니발|스타리아|캐스퍼|코나|투싼|팰리세이드|그랑콜레오스|아르카나|세닉|티볼리|렉스턴|액티언|토레스)/;

  if (suvLike.some((item) => key.startsWith(item)) || suvKorean.test(key)) return "suv";
  return "sedan";
}

function inferSpreadsheetVehicleFuel(name, brand) {
  const key = normalizeVehiclePricingKey(name);
  const brandKey = String(brand || "").toLowerCase();

  if (key.includes("hybrid")) return "hybrid";
  if (
    key.includes("ev") ||
    key.startsWith("model") ||
    key === "cybertruck" ||
    /^(eqa|eqb|eqe|i4|i5|i7|ix|ix1|ix2|gv60)$/.test(key) ||
    brandKey === "tesla"
  ) {
    return "electric";
  }

  return "gasoline";
}

function makePricingVehicleId(entry) {
  return `pricing-${entry.key}`;
}

function getPricingEntryByVehicleId(vehicleId) {
  const id = String(vehicleId || "");
  if (!id.startsWith("pricing-")) return null;
  const key = id.slice("pricing-".length);
  return readVehiclePricing().entryByKey.get(key) || null;
}

function createPricingOnlyVehicle(entry, conditions) {
  const brand = inferSpreadsheetVehicleBrand(entry.name);
  const segment = inferSpreadsheetVehicleSegment(entry.name);
  const fuel = inferSpreadsheetVehicleFuel(entry.name, brand);
  const vehicleId = makePricingVehicleId(entry);
  const monthlyDisplayLift = getStableMonthlyDisplayLift(vehicleId);
  const quote = applyMonthlyDisplayLift(buildSpreadsheetPricingQuote({ name: entry.name, conditions, entry }), monthlyDisplayLift);
  if (!quote) return null;

  const isImported = brand && !["Hyundai", "Kia", "Genesis", "Renault", "KGM"].includes(brand);
  const segmentCategory = segment.includes("suv") || segment.includes("rv") || segment.includes("van") ? "suv" : "sedan";
  const categories = ["all", segmentCategory, isImported ? "imported" : "domestic"];
  const productLabel = quote.spreadsheetPricing?.productLabel || "가격표 기준";

  return {
    id: vehicleId,
    brand,
    brandLabel: getBrandLabel(brand),
    name: entry.name,
    trim: "기준 등급",
    year: null,
    segment,
    fuel,
    imageUrl: getLocalDanawaVehicleImage(brand, entry.name),
    fallbackImageUrl: getVehicleFallbackImage(brand, entry.name, segment),
    basePrice: null,
    monthlyPayment: quote.monthlyPayment,
    bestQuote: quote,
    quotes: [quote],
    usedQuoteFallback: false,
    usedSpreadsheetPricing: true,
    priceFrom: null,
    summary: "가격표 기준 조건",
    subtitle: `${productLabel} · 60개월 기준`,
    badge: productLabel,
    recommendation: "엑셀 가격표 기준 금액을 우선 적용합니다.",
    instantDeliveryAvailable: false,
    categories,
    trimCount: 0,
    optionCount: 0,
    optionHighlights: [],
    options: [],
    conditions: {
      term: Number(conditions.term || 60),
      depositPct: Number(conditions.deposit_pct || 0),
      mileageLimit: Number(conditions.mileage_limit || defaultVehicleMileageLimit),
    },
    calculation: {
      basePrice: null,
      baseMonthlyPayment: quote.monthlyPayment,
      residualRatio: null,
      residualValue: null,
      annualIrr: null,
      monthlyIrr: null,
      isEstimated: Boolean(quote.isEstimated),
      isSpreadsheetPrice: true,
      spreadsheetPricing: quote.spreadsheetPricing,
      quoteSource: quote.source,
      displayMonthlyLift: monthlyDisplayLift,
      baseMonthlyPaymentBeforeLift: quote.monthlyPaymentBeforeLift ?? null,
      method: "엑셀 가격표를 우선 적용하고, 요청 주행거리는 1만km 기준 금액 차이를 선형 보정해 계산합니다.",
    },
    trims: [],
    isPricingOnly: true,
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function fetchBestVehicleQuote(vehicleId, conditions, fallbackMonthlyPayment = null) {
  const term = Number(conditions.term || 60);
  const deposit = Number(conditions.deposit_pct || 0);
  const mileageLimit = Number(conditions.mileage_limit || defaultVehicleMileageLimit);
  const cacheKey = `${vehicleId}:${term}:${deposit}:${mileageLimit}`;
  const cached = quoteCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < apiCacheTtlMs) {
    return cached.value;
  }

  const finish = (value) => {
    quoteCache.set(cacheKey, { cachedAt: Date.now(), value });
    return value;
  };

  try {
    const quoteResponse = await fetchRecarJson(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}/quotes`, {
      allow404: true,
      query: {
        contract_months: term,
        prepay_pct: deposit,
        annual_km: mileageLimit,
      },
    });
    const quotes = getArrayPayload(quoteResponse.body).map((quote) => normalizeQuote(quote)).filter(Boolean);

    if (quotes.length) {
      quotes.sort((a, b) => a.monthlyPayment - b.monthlyPayment);
      return finish({ bestQuote: quotes[0], quotes, usedFallback: false });
    }
  } catch (error) {
    // Continue to instant quote fallback below.
  }

  try {
    const instantResponse = await fetchRecarJson("/api/v1/quotes/instant", {
      method: "POST",
      body: {
        vehicle_id: vehicleId,
        term,
        deposit,
        mileage_limit: mileageLimit,
      },
    });
    const instantData = instantResponse.body?.data || instantResponse.body;
    const instantQuote = normalizeQuote(instantData, "instant");

    if (instantQuote) {
      return finish({ bestQuote: instantQuote, quotes: [instantQuote], usedFallback: true });
    }
  } catch (error) {
    // Use list monthly payment as last resort.
  }

  const listMonthlyPayment = numberOrNull(fallbackMonthlyPayment);
  if (listMonthlyPayment) {
    const listQuote = {
      source: "list",
      id: "",
      financeCompany: "",
      financeCompanyKr: "",
      contractMonths: term,
      prepayPct: deposit,
      annualKm: mileageLimit,
      monthlyPayment: listMonthlyPayment,
      residualValue: null,
      residualRatio: null,
    };
    return finish({ bestQuote: listQuote, quotes: [listQuote], usedFallback: true });
  }

  return finish({ bestQuote: null, quotes: [], usedFallback: true });
}

async function fetchVehicleDetailBody(vehicleId) {
  const cached = vehicleDetailCache.get(vehicleId);
  if (cached && Date.now() - cached.cachedAt < apiCacheTtlMs) return cached.value;

  try {
    const body = (await fetchRecarJson(`/api/v1/vehicles/${encodeURIComponent(vehicleId)}`)).body;
    vehicleDetailCache.set(vehicleId, { cachedAt: Date.now(), value: body });
    return body;
  } catch (error) {
    return null;
  }
}

function normalizeVehicle(vehicle, detail, quoteResult, conditions) {
  const source = detail || vehicle || {};
  const trims = Array.isArray(detail?.trims) ? detail.trims.map(normalizeVehicleTrim).filter(Boolean) : [];
  const firstTrim = trims[0] || {};
  const brand = sanitizeText(source.brand || vehicle?.brand, 80);
  const brandLabel = sanitizeText(getBrandLabel(brand), 80);
  const name = sanitizeText(source.model_name || source.modelName || source.name || vehicle?.model_name || "차량", 120);
  const segment = sanitizeText((source.segment || vehicle?.segment || "").toLowerCase(), 40);
  const fuel = sanitizeText(source.fuel || vehicle?.fuel || "", 40);
  const trim = sanitizeText(
    firstTrim.name ||
      source.trim ||
      source.display_badge ||
      vehicle?.display_badge ||
      fuel ||
      "대표 트림",
    120,
  );
  const year = numberOrNull(source.year || vehicle?.year);
  const vehicleSeed = source.id || vehicle?.id || `${brand}:${name}`;
  const monthlyDisplayLift = getStableMonthlyDisplayLift(vehicleSeed);
  const imageUrl = toAbsoluteRecarAsset(
    source.image_url ||
      source.imageUrl ||
      vehicle?.image_url ||
      vehicle?.imageUrl ||
      source.thumbnail_url ||
      source.thumbnailUrl ||
      vehicle?.thumbnail_url ||
      vehicle?.thumbnailUrl,
  );
  const rawBasePrice = numberOrNull(source.base_price || source.basePrice || source.price_from || source.priceFrom || vehicle?.base_price || vehicle?.basePrice || vehicle?.price_from || vehicle?.priceFrom || firstTrim.price);
  const basePrice = rawBasePrice || getInferredBasePrice({ brand, name, segment, fuel, trims });
  const sourceMonthlyPayment = numberOrNull(source.monthly_payment ?? vehicle?.monthly_payment);
  const spreadsheetQuote = buildSpreadsheetPricingQuote({ name, conditions });
  const estimatedQuote = buildEstimatedQuote({ brand, name, segment, fuel, basePrice, conditions });
  const sourceListQuote =
    !quoteResult?.bestQuote && sourceMonthlyPayment
      ? {
          source: "list",
          id: "",
          financeCompany: "",
          financeCompanyKr: "",
          contractMonths: Number(conditions.term || 60),
          prepayPct: Number(conditions.deposit_pct || 0),
          annualKm: Number(conditions.mileage_limit || defaultVehicleMileageLimit),
          monthlyPayment: sourceMonthlyPayment,
          residualValue: null,
          residualRatio: null,
          annualIrr: null,
          monthlyIrr: null,
          isEstimated: false,
        }
      : null;
  const rawBestQuote = spreadsheetQuote || enrichQuoteWithFallbacks(quoteResult?.bestQuote || sourceListQuote || estimatedQuote, estimatedQuote);
  const bestQuote = applyMonthlyDisplayLift(rawBestQuote, monthlyDisplayLift);
  const apiQuoteList = quoteResult?.quotes?.length
    ? quoteResult.quotes.map((quote) => applyMonthlyDisplayLift(enrichQuoteWithFallbacks(quote, estimatedQuote), monthlyDisplayLift))
    : [];
  const quoteList = spreadsheetQuote
    ? [bestQuote, ...apiQuoteList].slice(0, 8)
    : apiQuoteList.length
      ? apiQuoteList
      : bestQuote
        ? [bestQuote]
        : [];
  const monthlyPayment = bestQuote?.monthlyPayment ?? sourceMonthlyPayment ?? estimatedQuote?.monthlyPayment ?? null;
  const isImported = brand && !["hyundai", "kia", "genesis", "현대", "기아", "제네시스"].includes(brand.toLowerCase());
  const segmentCategory = segment.includes("suv") || segment.includes("rv") || segment.includes("van") ? "suv" : segment.includes("sedan") || segment.includes("hatch") ? "sedan" : segment;
  const categories = ["all"];
  const uniqueOptions = getUniqueOptions(trims, detail?.options || source.options || []);
  const firstTrimOptions = firstTrim.options || [];

  if (segmentCategory) categories.push(segmentCategory);
  if (isImported) categories.push("imported");
  else categories.push("domestic");
  if (source.is_special_deal || source.isSpecialDeal || source.is_urgent_deal || source.isUrgentDeal) categories.push("time");

  return {
    id: sanitizeText(source.id || vehicle?.id, 120),
    brand,
    brandLabel,
    name,
    trim,
    year,
    segment,
    fuel,
    imageUrl,
    fallbackImageUrl: getVehicleFallbackImage(brand, name, segment),
    basePrice,
    monthlyPayment,
    bestQuote,
    quotes: quoteList,
    usedQuoteFallback: Boolean(!spreadsheetQuote && (quoteResult?.usedFallback || bestQuote?.source === "list" || bestQuote?.source === "estimated")),
    usedSpreadsheetPricing: Boolean(spreadsheetQuote),
    priceFrom: numberOrNull(source.price_from || source.base_price || vehicle?.price_from) || basePrice,
    summary: sanitizeText(source.display_summary || vehicle?.display_summary, 180),
    subtitle: sanitizeText(source.display_subtitle || vehicle?.display_subtitle, 120),
    badge: sanitizeText(source.display_badge || vehicle?.display_badge || fuel, 60),
    recommendation: sanitizeText(source.recommendation_summary || vehicle?.recommendation_summary, 220),
    instantDeliveryAvailable: Boolean(source.instant_delivery_available || vehicle?.instant_delivery_available),
    categories: [...new Set(categories)],
    trimCount: trims.length,
    optionCount: uniqueOptions.length,
    optionHighlights: firstTrimOptions.slice(0, 4),
    options: uniqueOptions,
    conditions: {
      term: Number(conditions.term || 60),
      depositPct: Number(conditions.deposit_pct || 0),
      mileageLimit: Number(conditions.mileage_limit || defaultVehicleMileageLimit),
    },
    calculation: {
      basePrice,
      baseMonthlyPayment: monthlyPayment,
      residualRatio: bestQuote?.residualRatio ?? estimatedQuote?.residualRatio ?? null,
      residualValue: bestQuote?.residualValue ?? estimatedQuote?.residualValue ?? null,
      annualIrr: bestQuote?.annualIrr ?? estimatedQuote?.annualIrr ?? null,
      monthlyIrr: bestQuote?.monthlyIrr ?? estimatedQuote?.monthlyIrr ?? null,
      isEstimated: Boolean(bestQuote?.isEstimated || bestQuote?.source === "estimated"),
      isSpreadsheetPrice: Boolean(spreadsheetQuote),
      spreadsheetPricing: spreadsheetQuote?.spreadsheetPricing || null,
      quoteSource: bestQuote?.source || "",
      displayMonthlyLift: monthlyDisplayLift,
      baseMonthlyPaymentBeforeLift: bestQuote?.monthlyPaymentBeforeLift ?? null,
      method: bestQuote?.source === "spreadsheet"
        ? "사용자가 제공한 엑셀 가격표의 1만km 기준 월납을 우선 적용하고, 요청 주행거리는 1만km당 선형 가산 방식으로 보정합니다."
        : bestQuote?.source === "estimated"
        ? "금융사 견적이 없는 차량은 차량가, 추정 잔존가치, 내부 IRR 기준금리, 계약기간, 선납 조건을 반영해 참고 월납을 산출합니다."
        : "API 최저 월납을 기준으로 트림·옵션 차량가 차액에 잔가율, IRR 기준금리, 계약기간을 반영한 예상 변동액을 더합니다.",
    },
    trims: trims.slice(0, 8),
  };
}

async function handleRecarVehicleList(request, response, url) {
  try {
    const query = getDefaultVehicleQuery(url);
    const mode = url.searchParams.get("mode") || "home";
    const apiQuery = {
      ...query,
      page: "1",
      size: "100",
    };
    const listResponse = await fetchRecarJson("/api/v1/vehicles/", { query: apiQuery });
    const rawItems = getArrayPayload(listResponse.body);
    const conditions = query;

    if (mode === "all") {
      const apiItems = await mapWithConcurrency(rawItems, 8, async (rawVehicle) => {
        const quoteResult = await fetchBestVehicleQuote(rawVehicle.id, conditions, rawVehicle.monthly_payment);
        return normalizeVehicle(rawVehicle, null, quoteResult, conditions);
      });
      const usedPricingKeys = new Set(
        apiItems
          .map((vehicle) => vehicle.calculation?.spreadsheetPricing?.matchedKey || findSpreadsheetPricingEntry(vehicle.name)?.key)
          .filter(Boolean),
      );
      const pricingOnlyItems = readVehiclePricing()
        .entries.filter((entry) => !usedPricingKeys.has(entry.key))
        .map((entry) => createPricingOnlyVehicle(entry, conditions))
        .filter(Boolean);
      const items = [...apiItems, ...pricingOnlyItems];
      const hiddenMissingImageCount = items.filter((vehicle) => !hasDisplayableVehicleImage(vehicle)).length;
      const sortedItems = items
        .filter((vehicle) => vehicle.id)
        .filter(hasDisplayableVehicleImage)
        .sort((a, b) => {
          const priceA = Number.isFinite(Number(a.monthlyPayment)) ? Number(a.monthlyPayment) : Number.MAX_SAFE_INTEGER;
          const priceB = Number.isFinite(Number(b.monthlyPayment)) ? Number(b.monthlyPayment) : Number.MAX_SAFE_INTEGER;
          return priceA - priceB;
        });

      sendJson(response, 200, {
        ok: true,
        mode,
        conditions: {
          term: Number(query.term),
          depositPct: Number(query.deposit_pct),
          mileageLimit: Number(query.mileage_limit),
        },
        items: sortedItems,
        hiddenMissingImageCount,
        page: listResponse.body?.page || Number(query.page),
        size: sortedItems.length,
        total: sortedItems.length,
        pages: listResponse.body?.pages || 1,
      });
      return;
    }

    const rawById = new Map(rawItems.map((vehicle) => [String(vehicle.id), vehicle]));
    const lightweightItems = rawItems.map((vehicle) => normalizeVehicle(vehicle, null, null, conditions));
    const selectedVehicles = prepareHomepageVehicles(lightweightItems);

    const items = (
      await Promise.all(
      selectedVehicles.map(async (vehicle) => {
        if (vehicle.isManual) return vehicle;

        const rawVehicle = rawById.get(String(vehicle.id)) || vehicle;
        const detail = await fetchVehicleDetailBody(vehicle.id);
        const quoteResult = await fetchBestVehicleQuote(vehicle.id, conditions, rawVehicle.monthly_payment || vehicle.monthlyPayment);
        const normalized = normalizeVehicle(rawVehicle, detail, quoteResult, conditions);

        return {
          ...normalized,
          categories: vehicle.categories,
          categoryRanks: vehicle.categoryRanks,
        };
      }),
      )
    ).filter(hasDisplayableVehicleImage);

    sendJson(response, 200, {
      ok: true,
      conditions: {
        term: Number(query.term),
        depositPct: Number(query.deposit_pct),
        mileageLimit: Number(query.mileage_limit),
      },
      items,
      page: listResponse.body?.page || Number(query.page),
      size: items.length,
      total: items.length,
      pages: listResponse.body?.pages || 1,
    });
  } catch (error) {
    sendJson(response, 502, { ok: false, error: "vehicle_api_failed" });
  }
}

async function handleRecarVehicleDetail(request, response, url, vehicleId) {
  try {
    const conditions = getDefaultVehicleQuery(url);
    const pricingEntry = getPricingEntryByVehicleId(vehicleId);

    if (pricingEntry) {
      const vehicle = createPricingOnlyVehicle(pricingEntry, conditions);
      if (!vehicle) {
        sendJson(response, 404, { ok: false, error: "vehicle_not_found" });
        return;
      }

      sendJson(response, 200, { ok: true, vehicle });
      return;
    }

    if (vehicleId === "manual-bmw-x6") {
      const vehicle = createManualVehicle({
        id: "manual-bmw-x6",
        brand: "BMW",
        name: "X6",
        trim: "xDrive40i M Sport",
        year: 2026,
        segment: "suv",
        fuel: "gas",
        categories: ["time", "imported"],
        ranks: { time: 4, imported: 2 },
        conditions,
      });
      sendJson(response, 200, { ok: true, vehicle });
      return;
    }

    const detail = await fetchVehicleDetailBody(vehicleId);
    if (!detail) {
      sendJson(response, 404, { ok: false, error: "vehicle_not_found" });
      return;
    }

    const quoteResult = await fetchBestVehicleQuote(vehicleId, conditions, detail.monthly_payment);
    sendJson(response, 200, {
      ok: true,
      vehicle: normalizeVehicle(detail, detail, quoteResult, conditions),
    });
  } catch (error) {
    sendJson(response, 502, { ok: false, error: "vehicle_api_failed" });
  }
}

async function handleAdminRegister(request, response) {
  try {
    const input = JSON.parse((await readRequestBody(request)) || "{}");
    const username = normalizeUsername(input.username);
    const password = String(input.password || "");
    const name = sanitizeText(input.name, 40);

    if (username.length < 3) {
      sendJson(response, 400, { ok: false, error: "invalid_username" });
      return;
    }

    if (password.length < 6) {
      sendJson(response, 400, { ok: false, error: "weak_password" });
      return;
    }

    if (!name) {
      sendJson(response, 400, { ok: false, error: "name_required" });
      return;
    }

    const store = await readAdminStore();
    if (store.users.some((user) => user.username === username)) {
      sendJson(response, 409, { ok: false, error: "username_exists" });
      return;
    }

    const { salt, passwordHash } = hashPassword(password);
    const user = {
      id: makeAdminId(),
      username,
      name,
      role: "admin",
      status: "pending",
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    store.users.push(user);
    await writeAdminStore(store);

    sendJson(response, 201, { ok: true, user: publicAdminUser(user) });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "admin_register_failed" });
  }
}

async function handleAdminLogin(request, response) {
  try {
    const input = JSON.parse((await readRequestBody(request)) || "{}");
    const username = normalizeUsername(input.username);
    const password = String(input.password || "");
    const store = await readAdminStore();
    const user = store.users.find((item) => item.username === username);

    if (!user || !verifyPassword(password, user)) {
      sendJson(response, 401, { ok: false, error: "invalid_login" });
      return;
    }

    if (user.status !== "approved") {
      sendJson(response, 403, { ok: false, error: user.status === "pending" ? "approval_pending" : "account_not_approved" });
      return;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    store.sessions[token] = {
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    user.lastLoginAt = new Date().toISOString();
    await writeAdminStore(store);

    sendJson(response, 200, { ok: true, token, user: publicAdminUser(user) });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "admin_login_failed" });
  }
}

async function handleAdminLogout(request, response) {
  const auth = await requireAdmin(request, response);
  if (!auth) return;

  delete auth.store.sessions[auth.token];
  await writeAdminStore(auth.store);
  sendJson(response, 200, { ok: true });
}

async function handleAdminSession(request, response) {
  const auth = await requireAdmin(request, response);
  if (!auth) return;

  sendJson(response, 200, { ok: true, user: publicAdminUser(auth.user) });
}

async function handleAdminUserList(request, response) {
  const auth = await requireSuperAdmin(request, response);
  if (!auth) return;

  sendJson(response, 200, {
    ok: true,
    users: auth.store.users.map(publicAdminUser),
  });
}

async function handleAdminUserUpdate(request, response, userId) {
  const auth = await requireSuperAdmin(request, response);
  if (!auth) return;

  try {
    const input = JSON.parse((await readRequestBody(request)) || "{}");
    const user = auth.store.users.find((item) => item.id === userId);

    if (!user) {
      sendJson(response, 404, { ok: false, error: "admin_user_not_found" });
      return;
    }

    if (user.id === auth.user.id && input.status && input.status !== "approved") {
      sendJson(response, 400, { ok: false, error: "cannot_disable_self" });
      return;
    }

    if (["pending", "approved", "rejected"].includes(input.status)) {
      user.status = input.status;
      if (input.status === "approved") {
        user.approvedAt = new Date().toISOString();
        delete user.rejectedAt;
      }
      if (input.status === "rejected") {
        user.rejectedAt = new Date().toISOString();
      }
    }

    if (["admin", "super"].includes(input.role) && user.id !== auth.user.id) {
      user.role = input.role;
    }

    await writeAdminStore(auth.store);
    sendJson(response, 200, { ok: true, user: publicAdminUser(user) });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "admin_user_update_failed" });
  }
}

async function handleLeadCreate(request, response) {
  try {
    const body = await readRequestBody(request);
    const input = JSON.parse(body || "{}");
    const phone = normalizePhone(input.phone);
    const vehicle = sanitizeText(input.vehicle, 80);
    const customerName = sanitizeText(input.customerName || input.name, 40);

    if (input.privacyConsent !== true) {
      sendJson(response, 400, { ok: false, error: "privacy_consent_required" });
      return;
    }

    if (input.termsConsent !== true) {
      sendJson(response, 400, { ok: false, error: "terms_consent_required" });
      return;
    }

    if (!/^01[016789]\d{7,8}$/.test(phone)) {
      sendJson(response, 400, { ok: false, error: "invalid_phone" });
      return;
    }

    if (!vehicle) {
      sendJson(response, 400, { ok: false, error: "vehicle_required" });
      return;
    }

    if (!customerName) {
      sendJson(response, 400, { ok: false, error: "name_required" });
      return;
    }

    const lead = {
      id: sanitizeText(input.id, 40) || makeLeadId(),
      createdAt: new Date().toISOString(),
      vehicle,
      phone,
      customerName,
      requestNote: sanitizeText(input.requestNote || input.request, 500),
      privacyConsent: true,
      consentedAt: sanitizeText(input.consentedAt, 40) || new Date().toISOString(),
      policyVersion: sanitizeText(input.policyVersion, 20) || "2026-05-10",
      termsConsent: true,
      termsAcceptedAt: sanitizeText(input.termsAcceptedAt, 40) || new Date().toISOString(),
      termsVersion: sanitizeText(input.termsVersion, 20) || "2026-05-10",
      page: sanitizeText(input.page, 240),
      source: sanitizeText(input.source, 80),
      leadSource: sanitizeText(input.leadSource, 80),
      campaign: sanitizeText(input.campaign, 80),
      campaignLabel: sanitizeText(input.campaignLabel, 80),
      timeDealOriginalMonthlyPayment: Number(input.timeDealOriginalMonthlyPayment) || null,
      timeDealMonthlyPayment: Number(input.timeDealMonthlyPayment) || null,
      timeDealDiscount: Number(input.timeDealDiscount) || null,
      ip: request.socket.remoteAddress,
      userAgent: sanitizeText(request.headers["user-agent"], 240),
    };

    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.appendFile(leadsPath, `${JSON.stringify(lead)}\n`, "utf8");
    const notified = await notifyLead(lead);
    const firebase = await saveLeadToFirebase(lead)
      .then((result) => result)
      .catch((error) => ({ stored: false, error: error.message }));

    sendJson(response, 201, {
      ok: true,
      id: lead.id,
      stored: firebase.stored ? "firebase" : "server",
      notified,
      firebase,
      path: "data/leads.jsonl",
    });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "lead_save_failed" });
  }
}

async function handleLeadList(request, response, url) {
  const auth = await requireAdmin(request, response);
  if (!auth) return;

  try {
    const exists = fs.existsSync(leadsPath);
    if (!exists) {
      sendJson(response, 200, { ok: true, leads: [], user: publicAdminUser(auth.user), users: auth.user.role === "super" ? auth.store.users.map(publicAdminUser) : [] });
      return;
    }

    const text = await fs.promises.readFile(leadsPath, "utf8");
    const meta = await readLeadMeta();
    const userById = new Map(auth.store.users.map((user) => [user.id, user]));
    const leads = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((lead) => {
        const leadMeta = meta[lead.id] || {};
        const assignedUser = leadMeta.assignedAdminId ? userById.get(leadMeta.assignedAdminId) : null;
        return {
          ...lead,
          ...leadMeta,
          assignedAdminName: assignedUser ? assignedUser.name : "",
          assignedAdminUsername: assignedUser ? assignedUser.username : "",
        };
      })
      .filter((lead) => auth.user.role === "super" || lead.assignedAdminId === auth.user.id)
      .reverse()
      .slice(0, 500);

    sendJson(response, 200, {
      ok: true,
      user: publicAdminUser(auth.user),
      users: auth.user.role === "super" ? auth.store.users.map(publicAdminUser) : [],
      leads,
    });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "lead_list_failed" });
  }
}

async function handleLeadMetaUpdate(request, response, url, leadId) {
  const auth = await requireAdmin(request, response);
  if (!auth) return;

  try {
    const body = await readRequestBody(request);
    const input = JSON.parse(body || "{}");
    const id = sanitizeText(leadId, 80);
    const meta = await readLeadMeta();
    const current = meta[id] || {};

    if (auth.user.role !== "super" && current.assignedAdminId !== auth.user.id) {
      sendJson(response, 403, { ok: false, error: "lead_not_assigned" });
      return;
    }

    meta[id] = {
      ...current,
      progressStatus: progressStatuses.has(input.progressStatus) ? input.progressStatus : current.progressStatus || "미배정",
      adminMemo: typeof input.adminMemo === "string" ? sanitizeMemo(input.adminMemo, 1000) : current.adminMemo || "",
      dbManager: typeof input.dbManager === "string" ? sanitizeText(input.dbManager, 40) : current.dbManager || "",
      adminUpdatedAt: new Date().toISOString(),
    };

    if (auth.user.role === "super" && Object.prototype.hasOwnProperty.call(input, "assignedAdminId")) {
      const assignedAdminId = sanitizeText(input.assignedAdminId, 80);
      const assignedUser = assignedAdminId ? auth.store.users.find((user) => user.id === assignedAdminId && user.status === "approved") : null;
      meta[id].assignedAdminId = assignedUser ? assignedUser.id : "";
      meta[id].assignedAt = assignedUser ? new Date().toISOString() : "";
    }

    await writeLeadMeta(meta);
    sendJson(response, 200, { ok: true, id, meta: meta[id] });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "lead_meta_save_failed" });
  }
}

async function handleAdminCalendarGet(request, response, url) {
  const auth = await requireAdmin(request, response);
  if (!auth) return;

  try {
    const todayKey = getSeoulDateKey();
    const dateKey = isDateKey(url.searchParams.get("date")) ? url.searchParams.get("date") : todayKey;
    const monthKey = isMonthKey(url.searchParams.get("month")) ? url.searchParams.get("month") : dateKey.slice(0, 7);
    const store = await readAdminCalendar();

    sendJson(response, 200, getCalendarPayload(store, dateKey, monthKey));
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "calendar_load_failed" });
  }
}

async function handleAdminCalendarSave(request, response) {
  const auth = await requireAdmin(request, response);
  if (!auth) return;

  try {
    const input = JSON.parse((await readRequestBody(request)) || "{}");
    const dateKey = isDateKey(input.date) ? input.date : getSeoulDateKey();
    const monthKey = isMonthKey(input.month) ? input.month : dateKey.slice(0, 7);
    const memo = sanitizeMemo(input.memo, 2500);
    const store = await readAdminCalendar();

    store.notes[dateKey] = {
      memo,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
      updatedByName: auth.user.name || auth.user.username,
    };

    removeMemoGeneratedEvents(store, dateKey);
    parseMemoEvents(memo, dateKey, auth.user).forEach((event) => {
      if (!store.events[event.date]) store.events[event.date] = [];
      store.events[event.date].push(event);
    });

    await writeAdminCalendar(store);
    sendJson(response, 200, getCalendarPayload(store, dateKey, monthKey));
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "calendar_save_failed" });
  }
}

async function notifyLead(lead) {
  const webhookUrl = process.env.LEAD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: `[RE:CAR 문의] ${lead.customerName} / ${lead.vehicle} / ${lead.phone}`,
        lead,
      }),
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

function toFirestoreRestValue(value) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value ?? "") };
}

function toFirestoreRestFields(payload) {
  return Object.entries(payload).reduce((fields, [key, value]) => {
    if ((key === "createdAt" || key === "updatedAt") && value) {
      fields[key] = { timestampValue: value };
    } else {
      fields[key] = toFirestoreRestValue(value);
    }
    return fields;
  }, {});
}

async function saveLeadToFirebase(lead) {
  if (!firebaseProjectId || !firebaseApiKey) {
    return { stored: false, error: "firebase_env_missing" };
  }

  const now = new Date().toISOString();
  const firebaseLead = {
    ...lead,
    createdAt: lead.createdAt,
    createdAtIso: lead.createdAt,
    clientCreatedAt: lead.createdAt,
    updatedAt: now,
    updatedAtIso: now,
    storage: "firebase",
    status: "new",
    progressStatus: "미배정",
    adminMemo: "",
    assignedAdminId: "",
    dbManager: "",
    normalizedPhone: normalizePhone(lead.phone),
  };
  const documentId = encodeURIComponent(lead.id);
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/leads/${documentId}?key=${firebaseApiKey}`;
  const firebaseResponse = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreRestFields(firebaseLead) }),
  });

  if (!firebaseResponse.ok) {
    const message = await firebaseResponse.text().catch(() => "");
    throw new Error(message || "firebase_lead_save_failed");
  }

  return { stored: true, id: lead.id, collection: "leads" };
}

function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/data/") && !isPublicStaticPath(pathname)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  let requestedPath = pathname === "/" ? "/index.html" : pathname;
  if (requestedPath === "/inquiry" || requestedPath === "/inquiry/") {
    requestedPath = "/inquiry/index.html";
  }
  if (!isPublicStaticPath(requestedPath)) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...getSecurityHeaders(),
    });
    response.end("Not found");
    return;
  }

  const filePath = path.resolve(rootDir, `.${requestedPath}`);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...getSecurityHeaders(),
    });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        ...getSecurityHeaders(),
      });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      ...getSecurityHeaders(),
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const metaMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/meta$/);
  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  const recarVehicleMatch = url.pathname.match(/^\/api\/recar\/vehicles\/([^/]+)$/);

  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    sendOptions(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/recar/vehicles") {
    handleRecarVehicleList(request, response, url);
    return;
  }

  if (request.method === "GET" && recarVehicleMatch) {
    handleRecarVehicleDetail(request, response, url, decodeURIComponent(recarVehicleMatch[1]));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/register") {
    handleAdminRegister(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    handleAdminLogin(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    handleAdminLogout(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/session") {
    handleAdminSession(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    handleAdminUserList(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/calendar") {
    handleAdminCalendarGet(request, response, url);
    return;
  }

  if (["POST", "PUT", "PATCH"].includes(request.method) && url.pathname === "/api/admin/calendar") {
    handleAdminCalendarSave(request, response);
    return;
  }

  if (adminUserMatch && ["PATCH", "PUT"].includes(request.method)) {
    handleAdminUserUpdate(request, response, decodeURIComponent(adminUserMatch[1]));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/leads") {
    handleLeadCreate(request, response);
    return;
  }

  if (metaMatch && ["POST", "PUT", "PATCH"].includes(request.method)) {
    handleLeadMetaUpdate(request, response, url, decodeURIComponent(metaMatch[1]));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/leads") {
    handleLeadList(request, response, url);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response, url);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`RE:CAR server running at http://localhost:${port}`);
  console.log(`Lead storage: ${leadsPath}`);
});
