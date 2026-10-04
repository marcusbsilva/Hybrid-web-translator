# Privacy and security

Local matching sends no page text to translation services. Enabling fallback sends eligible text to the selected provider. With LocalTranslator Studio on localhost, translation runs on the user's computer. Install and start the separate Studio application to use the local provider. Model setup requires downloads.

API keys are stored in `chrome.storage.local`, which is not an encrypted vault. Diagnostics may contain response excerpts. Do not share keys or exports containing private content.

Compose exposes the service only on `127.0.0.1`. Do not expose it publicly without authentication. The extension reads pages across websites and calls the configured provider, so `<all_urls>` is a broad permission. Code, editable elements and `translate="no"` content are skipped.
