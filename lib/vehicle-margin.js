const crypto = require("node:crypto");

const vehicleMarginMin = 30000;
const vehicleMarginMax = 40000;
const vehicleMarginStep = 100;

function getStableVehicleMargin(seed) {
  const key = String(seed || "recar-vehicle");
  const hash = crypto.createHash("sha1").update(key).digest();
  const range = Math.floor((vehicleMarginMax - vehicleMarginMin) / vehicleMarginStep) + 1;
  return vehicleMarginMin + (hash.readUInt32BE(0) % range) * vehicleMarginStep;
}

function applyVehicleMargin(quote, margin) {
  if (!quote || !Number.isFinite(Number(quote.monthlyPayment))) return quote;

  return {
    ...quote,
    monthlyPayment: Math.round(Number(quote.monthlyPayment) + margin),
    displayMonthlyLift: margin,
    monthlyPaymentBeforeLift: quote.monthlyPayment,
  };
}

module.exports = {
  applyVehicleMargin,
  getStableVehicleMargin,
  vehicleMarginMax,
  vehicleMarginMin,
};
