# ⚠️ ВНИМАНИЕ ДЛЯ ИИ-АССИСТЕНТОВ (AI Studio / Claude / Gemini / Codex)

Следующие файлы и модули реализуют **полностью отлаженный и проверенный перенос проектов в Zuken E3.series 2022 SP2** (листы ГОСТ, изделия/УГО, 61/61 соединений, 15/15 кабелей, матрица IO, 64 атрибута).

**НЕ ИЗМЕНЯЙТЕ и НЕ РЕФАКТОРИТЕ эти файлы без явного запроса пользователя:**
- `src/core/e3Engine.ts` (особенно `generateE3ComScript`, `CreateFluxCable`, `PlaceNativeSymbol`)
- `src/core/e3DbNames.ts` (`dbeSymbolName`, `cableEntryName`, `gostFormatName`, `buildComponentGroups`)
- `scripts/e3SymbolsToDbe.ts` (особенно `WriteNodes` с `TTYPE IN (3, 12)`, `IO_MATRIX`, `Sub Cab`, `e3ColourIndex`)
- `scripts/e3_ensure_attrs.ps1` (биты `Owner`: `cable = 0x60006`, `device`, `sheet`, `project`)
- `scripts/e3_prepare.ps1`, `scripts/e3_dbe_unlock.ps1`, `scripts/e3RunTransfer.ts`
- `server.ts` (маршруты `/api/v1/e3/push-symbol`, `/api/v1/projects/:id/e3-direct-open`)
- `src/components/SymbolDesignerModal.tsx` (кнопка «Отправить в E3»)

**Критические инварианты (не ломать):**
1. Кабели создаются через `Dev.Create(des, "", "", cabEntry, "1", 0)`, а не 6-аргументный `CreateCable`.
2. `cableEntryName` должен очищать скобки, запятые и пробелы (`[^\p{L}\p{N}_\-.]` → `_`).
3. `WriteNodes` удаляет только `TTYPE IN (3, 12)` — `TTYPE=11` (фиксированные надписи) сохраняются самим E3.
4. Перед массовым обновлением `symbols.mdb` нужно снимать зависшие блокировки (`e3_dbe_unlock.ps1 -Auto`).