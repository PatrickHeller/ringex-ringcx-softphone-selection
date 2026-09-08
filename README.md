# RingEX/RingCX Softphone-Auswahl (SuiteCRM)

Pro-User-Auswahl zwischen dem RingCX-Softphone ([ringcx-suitecrm-embeddable](https://github.com/PatrickHeller/ringcx-suitecrm-embeddable))
und dem RingCentral Embeddable (RingEX, normale Durchwahlen) in SuiteCRM 8 (`crm.p-h-c.de`).
Nie beide gleichzeitig — beide nutzen denselben globalen `window.RCAdapter`-Namen.

Stand: 2026-09-02, fertig, mit echten Anrufen verifiziert.

## Aufbau

- **Neues Feld** `rc_softphone_type_c` (enum: ''/`ringcx`/`ringex`) auf Users, Label "RC Softphone":
  - Vardef: `custom/Extension/modules/Users/Ext/Vardefs/rc_softphone_type.php`
  - Dropdown-Werte: `custom/Extension/application/Ext/Language/{en_us,de_DE}.rc_softphone_type_dom.php`
  - Feld-Label: `custom/Extension/modules/Users/Ext/Language/{en_us,de_DE}.rc_softphone_type.php`
  - EditView-Layout: `custom/modules/Users/metadata/editviewdefs.php` (direkt gepatcht, da Studio
    neue Custom-Felder nicht automatisch ins Layout einfügt)
  - **Wichtig für jedes künftige `_c`-Feld per Extension-Vardef:** braucht `'source' => 'custom_fields'`
    im Vardef-Array, sonst schreibt `DynamicField::save()` das Feld nie in die `_cstm`-Tabelle —
    ohne Fehler, ohne Log.
- **Flag-Route:** `custom/RC_RingCX/RC_RingCX_WidgetFlag_Route.php` liefert
  `{"type": "ringcx"|"ringex"|""}`.
- **RingEX-Adapter:** `custom/ringex/ringex-suitecrm-adapter.js` — andere API-Form als RingCX
  (rohe `window.postMessage`-Typen `rc-post-message-request`/`rc-adapter-register-third-party-service`
  statt `RCAdapter.transport.addListeners`). Click-to-Dial läuft über `RCAdapter.clickToCall(number)`
  direkt an die von SuiteCRM 8 bereits als `tel:`-Links gerenderten Telefonfelder.
- **Wiederverwendet:** `RC_RingCX_ContactMatch_Route` / `RC_RingCX_CallLog_Entry` (produktunabhängig)
  aus [ringcx-suitecrm-embeddable](https://github.com/PatrickHeller/ringcx-suitecrm-embeddable) —
  dieses Repo enthält sie nicht erneut.
- **Loader-Verzweigung** (`loadRingCX()`/`loadRingEX()`) lebt in `dist/index.html` im
  `ringcx-suitecrm-embeddable`-Repo, nicht hier.

## RingCentral-App "SuiteCRMEX"

Eigene, dedizierte App für RingEX (nicht die RingCX-App erweitert): Auth-Typ **Client-side web app
(SPA)** mit PKCE, Redirect-URI `https://apps.ringcentral.com/integration/ringcentral-embeddable/2.3.1/redirect.html`
(offizielle, versionsgepinnte Seite, kein eigenes Redirect-Hosting nötig), Sichtbarkeit **private**.
Client-ID: `03DZdsTlEI4fB7064cgcgm`.

## Lessons Learned

- Nach Custom-Field-Änderungen **zusätzlich zum CLI-Repair** immer auch einmal über die Admin-UI
  Quick Repair and Rebuild laufen lassen — der programmatische Weg hat beim ersten Versuch die
  ALTER-TABLE-Ausführung für die neue Spalte nicht ausgeführt.
- Cache-Kette bei Vardef-Problemen komplett prüfen: `custom/Extension/modules/{Module}/Ext/Vardefs/*.php`
  (Quelle) → `custom/modules/{Module}/Ext/Vardefs/vardefs.ext.php` (kompiliert) →
  `cache/modules/{Module}/{Bean}vardefs.php` (Laufzeit-Cache).
- `duration_hours`/`duration_minutes` haben nur Minuten-Auflösung — für exakte Anrufdauer wurde
  zusätzlich `date_end` in `RC_RingCX_CallLog_Entry.php` gesetzt (gilt für RingCX und RingEX
  gleichermaßen, siehe Repo `ringcx-suitecrm-embeddable`).

## Deploy

Nach `public/legacy/` der SuiteCRM-8-Installation kopieren, danach Quick Repair and Rebuild
**über die Admin-UI** ausführen (nicht nur CLI, siehe oben).
