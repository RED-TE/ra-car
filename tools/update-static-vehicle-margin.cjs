const fs = require("node:fs");
const path = require("node:path");
const {
  getStableVehicleMargin,
  vehicleMarginMax,
  vehicleMarginMin,
} = require("../lib/vehicle-margin");

const catalogPath = path.join(__dirname, "..", "data", "vehicle-static-catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

for (const item of catalog.items || []) {
  const previousMargin = Number(item.calculation?.displayMonthlyLift) || 0;
  const storedBase = Number(item.monthlyPaymentBeforeLift);
  const derivedBase = Number(item.monthlyPayment) - previousMargin;
  const baseMonthlyPayment = Number.isFinite(storedBase) ? storedBase : derivedBase;
  const vehicleMargin = getStableVehicleMargin(item.id || `${item.brand}:${item.name}`);

  if (!Number.isFinite(baseMonthlyPayment)) continue;
  item.monthlyPaymentBeforeLift = baseMonthlyPayment;
  item.monthlyPayment = Math.round(baseMonthlyPayment + vehicleMargin);
  item.calculation = {
    ...item.calculation,
    displayMonthlyLift: vehicleMargin,
  };
}

catalog.displayAdjustment = `Deterministic per-model margin of ${vehicleMarginMin.toLocaleString("en-US")}-${vehicleMarginMax.toLocaleString("en-US")} KRW applied to base monthly prices`;
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
