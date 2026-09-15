# Individual crew referral paths

`crew-referral.mjs` serves the public homepage at `/r/RC-<code>` without
changing the visitor's URL. The homepage script reads the path, sends the
code with inquiries, and records a visit through the existing friends API.

Deploy the homepage `script.js` and the crew sharing UI before attaching
this Worker to the Cloudflare route `recarplan.com/r/*`. Otherwise the page
will load but the deployed script will not recognize the path. Keep the
existing `/crew`, `/_next/*`, and friends-proxy routes unchanged.

After deployment, verify a valid path returns the same homepage and an
invalid path returns 404. Submit only a non-production test inquiry and
confirm `referralCode` and `referralEntryPath` in the scoped admin COM lead
view. SQL crew rewards are not automatically created from Firestore leads;
they remain subject to the existing review and settlement workflow.
