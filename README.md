# FlowOS Logic MVP

This branch is intentionally narrow: **capture connected logic on an iPhone/iPad and exchange it through the existing RIT JSON format.**

## MVP features

- Add/edit/delete statements.
- Drag statements around a touch canvas.
- Pan and pinch-to-zoom.
- Connect one statement to another.
- Create explicit AND junctors from 2+ jointly necessary conditions.
- Import `P3_FLYING_LOGIC_EXCHANGE` JSON.
- Export the same JSON format for the RIT/Flying Logic importer.
- Preserve imported groups and metadata even though group editing is not exposed in the MVP.
- Preserve stable source IDs.
- Save the working model automatically on-device in browser storage.
- Copy JSON directly for use in ChatGPT.
- Paste revised RIT JSON from ChatGPT directly back into the app.
- Share JSON using the iOS share sheet when the browser supports file sharing.
- Work offline after the web app has been loaded once, via its service worker.

## Why this is a PWA for the MVP

A Progressive Web App gets the working surface onto iPhone and iPad without waiting on App Store/TestFlight packaging. In Safari, add the site to the Home Screen and it launches as a standalone web app. Once its service worker has cached the files, the editor itself can run offline.

## Fastest deployment: GitHub Pages

1. Create a new GitHub repository, e.g. `flowos-logic`.
2. Upload the contents of this folder to the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose the `main` branch and `/ (root)` folder, then Save.
6. Open the Pages URL in Safari on iPhone/iPad.
7. Tap **Share → Add to Home Screen**. On iOS/iPadOS 26, keep **Open as Web App** enabled.
8. Open it once while connected so the offline cache is populated.

## Phone workflow

1. Open **FlowOS Logic** from the Home Screen.
2. Tap **Add** to capture a statement.
3. Tap **Connect**, then tap the cause and the effect.
4. Tap **AND** when several conditions are jointly necessary.
5. Use **File → Copy JSON** to paste the model into ChatGPT for CLR/logic challenge.
6. Ask ChatGPT to return revised RIT JSON while preserving stable IDs.
7. Copy the returned JSON and use **File → Paste revised JSON** in the phone app.
8. Continue editing, or use **File → Export RIT JSON** / **Share JSON**.
9. At the computer, import that JSON with the existing RIT/Flying Logic importer.

## RIT compatibility decisions

- The app uses `P3_FLYING_LOGIC_EXCHANGE` version `0.3` directly rather than a separate FlowOS schema.
- New entity IDs use stable `MOB_E_<uuid>` identifiers.
- New ANDs are stored as explicit `junctors` plus incoming/outgoing edges.
- Mobile-only X/Y positions are stored in `attributes.FLOWOS_MOBILE_X/Y`; a Flying Logic importer can safely ignore these attributes.
- Imported `groups`, unknown attributes, annotations, classes, and source IDs are retained.
- If imported JSON has no mobile layout attributes, the app generates a basic hierarchical layout.

## Deliberately not in the MVP

- AI inside the app.
- Collaboration.
- CLR workflow engine.
- Group editing.
- Presentation-quality automatic layout.
- Critical Chain execution/planning.
- Evidence management.
- User accounts or cloud sync.

Those are later. The MVP is for **thinking anywhere**.
