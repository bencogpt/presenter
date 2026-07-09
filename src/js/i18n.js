/* ============ i18n.js — UI languages (English / Hebrew, RTL-aware) ============
   UI language is independent of slide-content language (which follows the
   source document / generation setting). Add a language: extend DICTS and
   the toggle logic in app.js. */
"use strict";
(function (SF) {
  const EN = {
    /* header / toolbar */
    "app.name": "SlideForge",
    "app.offline": "Offline",
    "tb.undo": "↶ Undo", "tb.redo": "↷ Redo",
    "tb.images": "✦ Images",
    "tb.present": "▶ Present",
    "tb.export": "⬇ Export",
    "tb.settings": "Settings",
    "tb.clear": "Clear session (wipes tokens, document, outline, assets)",
    "tb.theme": "Theme",
    "theme.corporate": "Light corporate", "theme.dark": "Dark", "theme.contrast": "High contrast",
    "theme.creative": "Pastel creative", "theme.gradient": "Bold gradient",
    "tb.lang": "עברית",

    /* banners */
    "banner.unsupported": "This browser is missing required features (fetch, FileReader, structuredClone, canvas). Please use Chromium ≥ 110 or Firefox ≥ 110.",
    "banner.http": "⚠️ One or more endpoints use plain http:// — traffic is unencrypted. Acceptable only in isolated lab setups.",

    /* sidebar: source */
    "src.title": "1 · Source document",
    "src.drop": "Drop a file here or click to choose",
    "src.dropSub": ".docx · .pdf · .md · .txt — up to 20 MB",
    "src.paste": "…or paste text instead",
    "src.pastePh": "Paste your document text here",
    "src.useText": "Use pasted text",
    "src.pasted": "pasted text",
    "src.loaded": "{name} — {chars} characters",
    "src.viewText": "View / trim extracted text",
    "src.trimHint": "Remove anything irrelevant or sensitive before generating.",
    "src.chunk": "Document exceeds the {cap}-character cap — it will be summarized in sections first (several model calls, a bit longer).",

    /* sidebar: generate */
    "gen.title": "2 · Generate outline",
    "gen.slides": "Slides", "gen.auto": "Auto",
    "gen.tone": "Tone", "gen.tone.business": "Business", "gen.tone.technical": "Technical", "gen.tone.educational": "Educational",
    "gen.lang": "Slide language", "gen.lang.auto": "Same as document",
    "gen.visuals": "Visuals", "gen.visuals.none": "None", "gen.visuals.light": "Light", "gen.visuals.rich": "Rich",
    "gen.source": "Content source",
    "gen.source.document": "From my input only",
    "gen.source.prompt": "Generate from topic (model knowledge)",
    "gen.go": "✦ Generate outline",
    "gen.redo": "✦ Regenerate outline",
    "gen.cancel": "Cancel",
    "gen.confirmRedo": "Regenerate the whole outline? Your current slides and edits will be replaced (undo will still work).",

    /* sidebar: slides */
    "sl.title": "3 · Slides",
    "sl.deckTitle": "Deck title", "sl.deckSubtitle": "Subtitle",
    "sl.add": "＋ Add slide",
    "sl.titlePh": "Slide title",
    "opt.transition": "Slide transition",
    "opt.tr.slide": "Slide", "opt.tr.fade": "Fade", "opt.tr.convex": "Convex", "opt.tr.zoom": "Zoom", "opt.tr.none": "None",
    "opt.fragments": "Reveal bullets one by one (fragments)",

    /* status */
    "st.sending": "Sending {n} characters to model {model}…",
    "st.summarizing": "Document over cap — summarizing section {i}/{n}…",
    "st.retryJson": "Model returned invalid JSON — retrying once with reinforcement…",
    "st.ready": "✔ Outline ready: {n} slides.",
    "st.reading": "Reading {name}…",
    "st.pdfPage": "Extracting PDF page {i}/{n}…",
    "st.fileLoaded": "✔ {name} loaded",

    /* preview */
    "pv.emptyTitle": "Your presentation will appear here",
    "pv.emptyHint": "Load a document on the side panel, then generate the outline. Every edit updates this preview live.",
    "pv.keys": "Present mode: F fullscreen · S speaker notes · ESC overview · Alt+click zoom · Ctrl+Shift+F search · arrows to navigate",

    /* editor cards */
    "layout.title": "Title", "layout.bullets": "Bullets", "layout.bullets_image": "Bullets + image",
    "layout.image_full": "Full image", "layout.chart": "Chart", "layout.two_column": "Two columns",
    "layout.quote": "Quote", "layout.section": "Section divider",
    "card.regen": "✦ Regenerate", "card.regenTitle": "Ask the model to redo this slide",
    "card.dup": "Duplicate", "card.del": "Delete slide",
    "card.drag": "Drag to reorder",
    "card.bullets": "Bullets (supports **bold**, *italic*, `code`)",
    "card.quote": "Quote (first line) + attribution (second)",
    "card.addBullet": "＋ bullet", "card.up": "Move up", "card.down": "Move down", "card.rm": "Remove",
    "card.image": "Image (generated in the Images dialog, or upload your own)",
    "card.imagePh": "Image prompt for the image model (leave empty for no image)",
    "card.rmImage": "Remove image",
    "card.upload": "Upload own image:",
    "card.chart": "Chart data (rendered locally by Chart.js — never by the image model)",
    "card.chartTitlePh": "Chart title",
    "card.series": "Series ╲ Labels", "card.addCol": "＋ col", "card.addSeries": "＋ series", "card.rmSeries": "Remove series",
    "card.notes": "Speaker notes", "card.notesPh": "Speaker notes (only you see these)",
    "card.hide": "Hide slide (kept in the project, skipped when presenting)",
    "card.show": "Show slide again",
    "card.regenDone": "Slide regenerated.", "card.regenBusy": "Regenerating slide…",

    /* visuals dialog */
    "vis.title": "Generate images",
    "vis.intro": "Images are generated one at a time by your internal image service. Charts are always rendered locally — never by the image model.",
    "vis.all": "✦ Generate all images", "vis.stop": "Stop",
    "vis.none": "No slides have an image prompt. Add prompts in the slide cards.",
    "vis.gen": "✦ Generate", "vis.retry": "↻ Retry / regenerate", "vis.rm": "✕ Remove image",
    "vis.own": "✔ your upload", "vis.ok": "✔ generated", "vis.noImg": "no image yet", "vis.busy": "generating…",
    "vis.slide": "Slide {n}: {title}",
    "vis.progress": "Generating image {i} of {n}…",
    "vis.doneAll": "Done: {ok} generated{failed}.",
    "vis.failedPart": ", {n} failed (retry individually)",
    "vis.stopped": "Stopped — {n} generated.",
    "vis.close": "Close",

    /* export dialog */
    "ex.title": "Export",
    "ex.deck": "Standalone presentation (.html)",
    "ex.deckHint": "One self-contained file. Opens on any offline machine, straight from a USB stick.",
    "ex.liveCharts": "Embed live interactive charts (default: charts baked to PNG)",
    "ex.downscale": "Downscale images to ≤1920px JPEG (smaller file)",
    "ex.kiosk": "Auto-advance in a loop (kiosk mode), seconds per slide:",
    "ex.sizeWarn": "Estimated export size {size} (>50 MB). Consider image downscaling.",
    "ex.download": "⬇ Download presentation.html",
    "ex.project": "Project file (.json)",
    "ex.projectHint": "Save your work to resume later or hand off to a colleague. Never contains tokens.",
    "ex.saveProject": "⬇ Save project.json",
    "ex.loadProject": "Resume from a project file:",
    "ex.pdf": "PDF",
    "ex.pdfHint": "Uses the browser print dialog — choose “Save as PDF”, enable background graphics, landscape.",
    "ex.print": "🖨 Print / Save as PDF",
    "ex.done": "Exported {size} — opens offline in any modern browser.",
    "ex.failed": "Export failed: {msg}",
    "ex.projLoaded": "Project loaded: {n} slides.",
    "ex.projBad": "Could not load project: {msg}",
    "ex.notProject": "Not a SlideForge project file.",

    /* settings dialog */
    "cfg.title": "Settings",
    "cfg.intro": "This tool only ever talks to the two endpoints below. Documents go to the text model; image prompts to the image model. Nothing else, ever.",
    "cfg.llm": "Text model (OpenAI-compatible)",
    "cfg.flux": "Image model (Flux2) — optional",
    "cfg.base": "Base URL", "cfg.model": "Model name", "cfg.token": "API token",
    "cfg.fluxApi": "API style",
    "cfg.fluxApi.openai": "OpenAI-compatible (/v1/images/generations)",
    "cfg.fluxApi.fastapi": "Custom FastAPI (JSON prompt → image)",
    "cfg.fluxPath": "Endpoint path",
    "cfg.test": "Test connection",
    "cfg.adv": "Advanced",
    "cfg.timeout": "Request timeout (seconds)", "cfg.maxTokens": "Max output tokens",
    "cfg.charCap": "Document character cap", "cfg.imageSize": "Image size",
    "cfg.jsonMode": "Request structured JSON output (response_format) — enable if your runtime supports it",
    "cfg.stylePrefix": "Image style prefix",
    "cfg.prompt": "Prompt template (advanced)", "cfg.sysPrompt": "Outline system prompt", "cfg.resetPrompt": "Reset to default",
    "cfg.persist": "Persistence (shared computer?)",
    "cfg.remember": "Remember settings on this machine (URLs & model names — stored in this browser)",
    "cfg.rememberTok": "Also remember API tokens",
    "cfg.rememberWarn": "⚠ never enable on a shared computer",
    "cfg.memNote": "By default tokens live only in memory and vanish when you close this tab.",
    "cfg.close": "Done",
    "cfg.needLlm": "Set the text model base URL and model name first (⚙ Settings).",
    "cfg.testing": "Testing…", "cfg.testOk": "✔ OK ({ms} ms)", "cfg.reachable": "✔ Endpoint reachable",
    "cfg.testingImg": "Testing… (generates a tiny test image — can take up to a minute)",
    "cfg.noImgApi": "No image-generation API at this URL ({status}) — this looks like a text-model endpoint or a wrong base URL.",
    "cfg.testImg": "✔ OK (test image generated)", "cfg.noUrl": "✘ No base URL set",
    "cfg.tokenConfirm": "Store API tokens in this browser's localStorage? Anyone with access to this machine account could read them. Never enable this on a shared computer.",
    "cfg.tokenBtn": "I understand — store tokens",

    /* json fix dialog */
    "jf.title": "The model returned invalid JSON",
    "jf.hint": "You can fix it by hand below, then press “Parse again”.",
    "jf.parse": "Parse again",
    "jf.still": "Still not valid: {msg}",

    /* confirm / misc */
    "cl.confirm": "Clear session? This wipes tokens, document text, outline and all generated images from memory (and stored tokens, if any).",
    "cl.btn": "Clear everything",
    "cl.done": "Session cleared.",
    "modal.cancel": "Cancel", "modal.ok": "OK",

    /* errors (also used by llm/ingest/visuals modules) */
    "err.llmNotConfigured": "Text model not configured — open ⚙ Settings.",
    "err.tokenRejected": "Token rejected ({status}) — check the API token in Settings.",
    "err.llmStatus": "LLM endpoint returned {status} — check URL/model in Settings.",
    "err.llmShape": "Unexpected response shape from LLM.",
    "err.llmTimeout": "LLM request timed out — the model may be busy; raise the timeout in Settings.",
    "err.llmUnreachable": "LLM unreachable — check the base URL in Settings (and that the route allows this app's origin: CORS).",
    "err.cancelled": "Cancelled.",
    "err.badJson": "The model did not produce valid outline JSON.",
    "err.truncated": "The model hit its output-token limit before finishing the outline. Raise “Max output tokens” in ⚙ Settings → Advanced (reasoning models need extra budget) and try again.",
    "err.emptyAnswer": "The model returned an EMPTY answer — its whole token budget was likely spent on internal reasoning before any output. Raise “Max output tokens” in ⚙ Settings → Advanced (and tick “Remember settings”, otherwise it resets on reload). The raw server response is under Details.",
    "err.ctxOverflow": "The request exceeds the model's context window. In ⚙ Settings → Advanced: lower “Document character cap” (the document is then summarized in smaller sections) and/or lower “Max output tokens” — their sum must fit the model's window.",
    "err.fileTooBig": "File is {size} — max 20 MB.",
    "err.legacyDoc": "Legacy .doc isn't supported. Open it in Word and save as .docx, then retry.",
    "err.badType": "Unsupported file type .{ext} — use .docx, .pdf, .md or .txt",
    "err.noText": "No text could be extracted from this file.",
    "err.scannedPdf": "Almost no text found in this PDF — it is probably scanned images. OCR is not supported; export the source as text or docx instead.",
    "err.imgNotConfigured": "Image endpoint not configured — open ⚙ Settings.",
    "err.imgToken": "Token rejected ({status}) — check the image model token in Settings.",
    "err.imgStatus": "Image endpoint returned {status}",
    "err.imgShape": "Image endpoint response not understood (no b64 image found).",
    "err.imgTimeout": "Image request timed out.",
    "err.imgUnreachable": "Image endpoint unreachable — check URL/CORS in Settings.",
    "err.imgTooBig": "Image too large (max 8 MB).",
  };

  const HE = {
    "app.name": "SlideForge",
    "app.offline": "לא מקוון",
    "tb.undo": "↶ ביטול", "tb.redo": "↷ ביצוע חוזר",
    "tb.images": "✦ תמונות",
    "tb.present": "▶ הצגה",
    "tb.export": "⬇ ייצוא",
    "tb.settings": "הגדרות",
    "tb.clear": "ניקוי הפעלה (מוחק טוקנים, מסמך, מתאר ותמונות)",
    "tb.theme": "ערכת עיצוב",
    "theme.corporate": "בהיר עסקי", "theme.dark": "כהה", "theme.contrast": "ניגודיות גבוהה",
    "theme.creative": "פסטל יצירתי", "theme.gradient": "גרדיאנט נועז",
    "tb.lang": "English",

    "banner.unsupported": "הדפדפן חסר יכולות נדרשות (fetch, FileReader, structuredClone, canvas). יש להשתמש ב-Chromium ‏110 ומעלה או Firefox ‏110 ומעלה.",
    "banner.http": "⚠️ אחת הכתובות משתמשת ב-http:// לא מוצפן — מקובל רק בסביבות מעבדה מבודדות.",

    "src.title": "1 · מסמך מקור",
    "src.drop": "גררו קובץ לכאן או לחצו לבחירה",
    "src.dropSub": ".docx · .pdf · .md · .txt — עד 20 MB",
    "src.paste": "…או הדביקו טקסט במקום",
    "src.pastePh": "הדביקו כאן את טקסט המסמך",
    "src.useText": "השתמש בטקסט שהודבק",
    "src.pasted": "טקסט שהודבק",
    "src.loaded": "{name} — {chars} תווים",
    "src.viewText": "צפייה / עריכת הטקסט שחולץ",
    "src.trimHint": "מחקו תוכן לא רלוונטי או רגיש לפני היצירה.",
    "src.chunk": "המסמך חורג מתקרת {cap} התווים — הוא יסוכם תחילה בחלקים (מספר קריאות למודל, מעט יותר זמן).",

    "gen.title": "2 · יצירת מתאר",
    "gen.slides": "שקפים", "gen.auto": "אוטומטי",
    "gen.tone": "סגנון", "gen.tone.business": "עסקי", "gen.tone.technical": "טכני", "gen.tone.educational": "לימודי",
    "gen.lang": "שפת השקפים", "gen.lang.auto": "כמו המסמך",
    "gen.visuals": "ויזואליה", "gen.visuals.none": "ללא", "gen.visuals.light": "מעט", "gen.visuals.rich": "עשיר",
    "gen.source": "מקור התוכן",
    "gen.source.document": "מהקלט שלי בלבד",
    "gen.source.prompt": "יצירה מנושא (ידע המודל)",
    "gen.go": "✦ צור מתאר",
    "gen.redo": "✦ צור מתאר מחדש",
    "gen.cancel": "ביטול",
    "gen.confirmRedo": "ליצור את המתאר מחדש? השקפים והעריכות הנוכחיים יוחלפו (ביטול עדיין יעבוד).",

    "sl.title": "3 · שקפים",
    "sl.deckTitle": "כותרת המצגת", "sl.deckSubtitle": "כותרת משנה",
    "sl.add": "＋ הוסף שקף",
    "sl.titlePh": "כותרת השקף",
    "opt.transition": "מעבר בין שקפים",
    "opt.tr.slide": "החלקה", "opt.tr.fade": "עמעום", "opt.tr.convex": "קמור", "opt.tr.zoom": "זום", "opt.tr.none": "ללא",
    "opt.fragments": "חשיפת נקודות אחת-אחת",

    "st.sending": "שולח {n} תווים למודל {model}…",
    "st.summarizing": "המסמך מעל התקרה — מסכם חלק {i}/{n}…",
    "st.retryJson": "המודל החזיר JSON לא תקין — מנסה שוב עם חיזוק…",
    "st.ready": "✔ המתאר מוכן: {n} שקפים.",
    "st.reading": "קורא את {name}…",
    "st.pdfPage": "מחלץ עמוד PDF‏ {i}/{n}…",
    "st.fileLoaded": "✔ {name} נטען",

    "pv.emptyTitle": "המצגת שלכם תופיע כאן",
    "pv.emptyHint": "טענו מסמך בלוח הצד וצרו מתאר. כל עריכה מתעדכנת בתצוגה המקדימה באופן מיידי.",
    "pv.keys": "מצב הצגה: F מסך מלא · S הערות דובר · ESC סקירה · Alt+לחיצה זום · Ctrl+Shift+F חיפוש · חצים לניווט",

    "layout.title": "כותרת", "layout.bullets": "נקודות", "layout.bullets_image": "נקודות + תמונה",
    "layout.image_full": "תמונה מלאה", "layout.chart": "גרף", "layout.two_column": "שתי עמודות",
    "layout.quote": "ציטוט", "layout.section": "מפריד פרקים",
    "card.regen": "✦ צור מחדש", "card.regenTitle": "בקשו מהמודל ליצור את השקף מחדש",
    "card.dup": "שכפול", "card.del": "מחיקת שקף",
    "card.drag": "גררו לשינוי סדר",
    "card.bullets": "נקודות (תומך **מודגש**, *נטוי*, `קוד`)",
    "card.quote": "ציטוט (שורה ראשונה) + מקור (שנייה)",
    "card.addBullet": "＋ נקודה", "card.up": "העברה למעלה", "card.down": "העברה למטה", "card.rm": "הסרה",
    "card.image": "תמונה (נוצרת בחלון התמונות, או העלו משלכם)",
    "card.imagePh": "הנחיית תמונה למודל התמונות (השאירו ריק ללא תמונה)",
    "card.rmImage": "הסרת תמונה",
    "card.upload": "העלאת תמונה משלכם:",
    "card.chart": "נתוני גרף (מצויר מקומית ע\"י Chart.js — לעולם לא ע\"י מודל התמונות)",
    "card.chartTitlePh": "כותרת הגרף",
    "card.series": "סדרה ╲ תוויות", "card.addCol": "＋ עמודה", "card.addSeries": "＋ סדרה", "card.rmSeries": "הסרת סדרה",
    "card.notes": "הערות דובר", "card.notesPh": "הערות דובר (רק אתם רואים אותן)",
    "card.hide": "הסתרת שקף (נשמר בפרויקט, מדולג בהצגה)",
    "card.show": "הצגת השקף שוב",
    "card.regenDone": "השקף נוצר מחדש.", "card.regenBusy": "יוצר שקף מחדש…",

    "vis.title": "יצירת תמונות",
    "vis.intro": "התמונות נוצרות אחת-אחת בשירות התמונות הפנימי. גרפים תמיד מצוירים מקומית — לעולם לא במודל התמונות.",
    "vis.all": "✦ צור את כל התמונות", "vis.stop": "עצור",
    "vis.none": "לאף שקף אין הנחיית תמונה. הוסיפו הנחיות בכרטיסי השקפים.",
    "vis.gen": "✦ צור", "vis.retry": "↻ נסה שוב / צור מחדש", "vis.rm": "✕ הסר תמונה",
    "vis.own": "✔ העלאה שלכם", "vis.ok": "✔ נוצרה", "vis.noImg": "אין תמונה עדיין", "vis.busy": "יוצר…",
    "vis.slide": "שקף {n}: {title}",
    "vis.progress": "יוצר תמונה {i} מתוך {n}…",
    "vis.doneAll": "הסתיים: {ok} נוצרו{failed}.",
    "vis.failedPart": ", {n} נכשלו (נסו שוב בנפרד)",
    "vis.stopped": "הופסק — {n} נוצרו.",
    "vis.close": "סגירה",

    "ex.title": "ייצוא",
    "ex.deck": "מצגת עצמאית (.html)",
    "ex.deckHint": "קובץ אחד עצמאי לחלוטין. נפתח בכל מחשב לא מקוון, ישירות מהחסן נייד.",
    "ex.liveCharts": "הטמעת גרפים אינטראקטיביים (ברירת מחדל: גרפים כתמונת PNG)",
    "ex.downscale": "הקטנת תמונות ל-JPEG עד ‎1920px (קובץ קטן יותר)",
    "ex.kiosk": "התקדמות אוטומטית בלולאה (מצב קיוסק), שניות לשקף:",
    "ex.sizeWarn": "גודל ייצוא משוער {size} (מעל 50 MB). מומלץ להקטין תמונות.",
    "ex.download": "⬇ הורדת presentation.html",
    "ex.project": "קובץ פרויקט (.json)",
    "ex.projectHint": "שמרו את העבודה להמשך או להעברה לעמיתים. לעולם אינו מכיל טוקנים.",
    "ex.saveProject": "⬇ שמירת project.json",
    "ex.loadProject": "המשך מקובץ פרויקט:",
    "ex.pdf": "PDF",
    "ex.pdfHint": "משתמש בחלון ההדפסה של הדפדפן — בחרו \"שמירה כ-PDF\", הפעילו גרפיקת רקע, לרוחב.",
    "ex.print": "🖨 הדפסה / שמירה כ-PDF",
    "ex.done": "יוצא {size} — נפתח לא מקוון בכל דפדפן מודרני.",
    "ex.failed": "הייצוא נכשל: {msg}",
    "ex.projLoaded": "הפרויקט נטען: {n} שקפים.",
    "ex.projBad": "לא ניתן לטעון את הפרויקט: {msg}",
    "ex.notProject": "זה אינו קובץ פרויקט של SlideForge.",

    "cfg.title": "הגדרות",
    "cfg.intro": "הכלי מתקשר אך ורק עם שתי הכתובות שלמטה. מסמכים נשלחים למודל הטקסט; הנחיות תמונה למודל התמונות. שום דבר אחר, לעולם.",
    "cfg.llm": "מודל טקסט (תואם OpenAI)",
    "cfg.flux": "מודל תמונות (Flux2) — אופציונלי",
    "cfg.base": "כתובת בסיס", "cfg.model": "שם המודל", "cfg.token": "טוקן API",
    "cfg.fluxApi": "סגנון API",
    "cfg.fluxApi.openai": "תואם OpenAI‏ (/v1/images/generations)",
    "cfg.fluxApi.fastapi": "FastAPI מותאם (JSON עם prompt ← תמונה)",
    "cfg.fluxPath": "נתיב הקצה",
    "cfg.test": "בדיקת חיבור",
    "cfg.adv": "מתקדם",
    "cfg.timeout": "זמן קצוב לבקשה (שניות)", "cfg.maxTokens": "מקסימום טוקנים בפלט",
    "cfg.charCap": "תקרת תווים למסמך", "cfg.imageSize": "גודל תמונה",
    "cfg.jsonMode": "בקש פלט JSON מובנה (response_format) — הפעילו אם השרת תומך בכך",
    "cfg.stylePrefix": "קידומת סגנון לתמונות",
    "cfg.prompt": "תבנית הנחיה (מתקדם)", "cfg.sysPrompt": "הנחיית מערכת למתאר", "cfg.resetPrompt": "איפוס לברירת מחדל",
    "cfg.persist": "שמירה (מחשב משותף?)",
    "cfg.remember": "זכור הגדרות במחשב זה (כתובות ושמות מודלים — נשמר בדפדפן זה)",
    "cfg.rememberTok": "זכור גם טוקנים",
    "cfg.rememberWarn": "⚠ לעולם לא במחשב משותף",
    "cfg.memNote": "כברירת מחדל הטוקנים נשמרים בזיכרון בלבד ונעלמים עם סגירת הלשונית.",
    "cfg.close": "סיום",
    "cfg.needLlm": "יש להגדיר תחילה כתובת בסיס ושם מודל למודל הטקסט (⚙ הגדרות).",
    "cfg.testing": "בודק…", "cfg.testOk": "✔ תקין ({ms} מ״ש)", "cfg.reachable": "✔ הכתובת זמינה",
    "cfg.testingImg": "בודק… (נוצרת תמונת בדיקה קטנה — עשוי לקחת עד דקה)",
    "cfg.noImgApi": "אין API ליצירת תמונות בכתובת זו ({status}) — נראה כמו כתובת של מודל טקסט או כתובת שגויה.",
    "cfg.testImg": "✔ תקין (נוצרה תמונת בדיקה)", "cfg.noUrl": "✘ לא הוגדרה כתובת בסיס",
    "cfg.tokenConfirm": "לשמור טוקנים ב-localStorage של הדפדפן? כל מי שיש לו גישה לחשבון במחשב זה יוכל לקרוא אותם. לעולם לא במחשב משותף.",
    "cfg.tokenBtn": "אני מבין/ה — שמור טוקנים",

    "jf.title": "המודל החזיר JSON לא תקין",
    "jf.hint": "אפשר לתקן ידנית למטה וללחוץ \"נסה לפענח שוב\".",
    "jf.parse": "נסה לפענח שוב",
    "jf.still": "עדיין לא תקין: {msg}",

    "cl.confirm": "לנקות את ההפעלה? פעולה זו מוחקת טוקנים, טקסט מסמך, מתאר וכל התמונות שנוצרו מהזיכרון (וגם טוקנים שמורים, אם יש).",
    "cl.btn": "נקה הכל",
    "cl.done": "ההפעלה נוקתה.",
    "modal.cancel": "ביטול", "modal.ok": "אישור",

    "err.llmNotConfigured": "מודל הטקסט לא מוגדר — פתחו ⚙ הגדרות.",
    "err.tokenRejected": "הטוקן נדחה ({status}) — בדקו את הטוקן בהגדרות.",
    "err.llmStatus": "שרת המודל החזיר {status} — בדקו כתובת/מודל בהגדרות.",
    "err.llmShape": "תגובת המודל במבנה לא צפוי.",
    "err.llmTimeout": "הבקשה למודל חרגה מהזמן הקצוב — ייתכן שהמודל עמוס; הגדילו את הזמן הקצוב בהגדרות.",
    "err.llmUnreachable": "המודל אינו נגיש — בדקו את כתובת הבסיס בהגדרות (וש-CORS מאפשר את מקור האפליקציה).",
    "err.cancelled": "בוטל.",
    "err.badJson": "המודל לא הפיק JSON תקין למתאר.",
    "err.truncated": "המודל הגיע לתקרת טוקני הפלט לפני שסיים את המתאר. הגדילו את \"מקסימום טוקנים בפלט\" ב-⚙ הגדרות ← מתקדם (מודלים חושבים צריכים תקציב נוסף) ונסו שוב.",
    "err.emptyAnswer": "המודל החזיר תשובה ריקה — ככל הנראה כל תקציב הטוקנים נוצל על חשיבה פנימית לפני שנוצר פלט. הגדילו את \"מקסימום טוקנים בפלט\" ב-⚙ הגדרות ← מתקדם (וסמנו \"זכור הגדרות\", אחרת הערך מתאפס ברענון). תגובת השרת המלאה נמצאת תחת פרטים.",
    "err.ctxOverflow": "הבקשה חורגת מחלון ההקשר של המודל. ב-⚙ הגדרות ← מתקדם: הקטינו את \"תקרת תווים למסמך\" (המסמך יסוכם אז בחלקים קטנים יותר) ו/או את \"מקסימום טוקנים בפלט\" — הסכום חייב להיכנס בחלון המודל.",
    "err.fileTooBig": "הקובץ שוקל {size} — המקסימום 20 MB.",
    "err.legacyDoc": "‎.doc ישן אינו נתמך. פתחו ב-Word ושמרו כ-‎.docx ונסו שוב.",
    "err.badType": "סוג קובץ לא נתמך ‎.{ext} — השתמשו ב-docx / pdf / md / txt.",
    "err.noText": "לא ניתן היה לחלץ טקסט מהקובץ.",
    "err.scannedPdf": "כמעט ולא נמצא טקסט ב-PDF — כנראה סריקה של תמונות. אין תמיכה ב-OCR; ייצאו את המקור כטקסט או docx.",
    "err.imgNotConfigured": "שירות התמונות לא מוגדר — פתחו ⚙ הגדרות.",
    "err.imgToken": "הטוקן נדחה ({status}) — בדקו את טוקן מודל התמונות בהגדרות.",
    "err.imgStatus": "שירות התמונות החזיר {status}",
    "err.imgShape": "תגובת שירות התמונות לא הובנה (לא נמצאה תמונת b64).",
    "err.imgTimeout": "בקשת התמונה חרגה מהזמן הקצוב.",
    "err.imgUnreachable": "שירות התמונות אינו נגיש — בדקו כתובת/CORS בהגדרות.",
    "err.imgTooBig": "התמונה גדולה מדי (מקסימום 8 MB).",
  };

  const DICTS = { en: EN, he: HE };
  let lang = "en";

  function t(key, params) {
    let s = (DICTS[lang] && DICTS[lang][key]) || EN[key] || key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace("{" + k + "}", String(v));
    return s;
  }

  /* Walk data-i18n / data-i18n-ph / data-i18n-title attributes. */
  function applyStatic() {
    for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.getAttribute("data-i18n"));
    for (const node of document.querySelectorAll("[data-i18n-ph]")) node.setAttribute("placeholder", t(node.getAttribute("data-i18n-ph")));
    for (const node of document.querySelectorAll("[data-i18n-title]")) node.setAttribute("title", t(node.getAttribute("data-i18n-title")));
  }

  function setLang(next) {
    lang = DICTS[next] ? next : "en";
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    try { localStorage.setItem("slideforge.uilang", lang); } catch (e) { /* ignore */ }
    applyStatic();
    SF.emit("lang-changed");
  }

  function initialLang() {
    try {
      const saved = localStorage.getItem("slideforge.uilang");
      if (saved && DICTS[saved]) return saved;
    } catch (e) { /* ignore */ }
    return (navigator.language || "").toLowerCase().startsWith("he") ? "he" : "en";
  }

  SF.t = t;
  SF.i18n = { setLang, applyStatic, initialLang, getLang: () => lang };
})(window.SF);
