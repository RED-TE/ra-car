# Ricar Auto Plan Mock Payment System Implementation

## 📂 File Structure
1. `checkout.html` : Mock payment flow (Plan Selection -> Payment Button)
2. `checkout_success.html` : Success page showing order details and updated status.
3. `checkout_fail.html` : Failure page showing reject reason.
4. `license.html` : Displays generated license key and activation status.
5. `device_register.html` : Simulates device activation (1-device limit).

## 🚀 How to Run
Just open `checkout.html` in your browser.
(Or start from `index.html` and click any "Purchase" button)

## 🧪 Testing Features
### 1. Payment Flow
- **Standard**: Submit with valid email & refund check → Shows Loading → Success (80% chance)
- **Validation**: Try clicking pay without email or unchecked agreement box.
- **Force Success/Fail**: Use the small buttons at the bottom of the checkout summary card to force a result.

### 2. License & Device Flow
1. Complete Payment -> Go to `checkout_success.html`.
2. Click **"Check License Key"** -> Go to `license.html`.
   - Initial State: "ISSUED" (Yellow badge).
   - Key is generated and shown.
3. Click **"Register Device"** -> Go to `device_register.html`.
   - Enter a name (e.g., "My MacBook") and click Register.
4. Return to `license.html`.
   - State changes to "ACTIVATED" (Green badge).
   - Device info is displayed.
5. Unregister in `device_register.html` to reset status.

## 🛠️ Data Storage (Mock)
This system uses browser `localStorage` and `sessionStorage` to simulate a backend.
- `ricar_order_draft`: Latest order info.
- `ricar_license_key`: Persisted license key.
- `ricar_device_info`: Registered device data.

> **Note**: This is a frontend-only mock. No real payments are processed.
