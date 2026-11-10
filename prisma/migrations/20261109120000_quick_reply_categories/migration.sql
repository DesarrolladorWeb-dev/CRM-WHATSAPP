-- Create the category catalog used by quick reply templates.
CREATE TABLE "quick_reply_categories" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Tag',
    "color" TEXT NOT NULL DEFAULT 'bg-slate-100 text-slate-700',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quick_reply_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quick_reply_categories_label_key" ON "quick_reply_categories"("label");

-- Preserve the five categories currently shown by the UI.
INSERT INTO "quick_reply_categories" ("id", "label", "icon", "color", "updated_at") VALUES
    ('saludo', 'Saludos', 'Hand', 'bg-emerald-100 text-emerald-800', CURRENT_TIMESTAMP),
    ('ventas', 'Ventas', 'DollarSign', 'bg-blue-100 text-blue-800', CURRENT_TIMESTAMP),
    ('precios', 'Precios', 'Tag', 'bg-purple-100 text-purple-800', CURRENT_TIMESTAMP),
    ('soporte', 'Soporte', 'Wrench', 'bg-amber-100 text-amber-800', CURRENT_TIMESTAMP),
    ('general', 'General', 'Zap', 'bg-slate-100 text-slate-700', CURRENT_TIMESTAMP);

-- Normalize blank legacy values, then preserve any other values already assigned to templates.
UPDATE "quick_replies"
SET "category" = 'general'
WHERE "category" IS NULL OR BTRIM("category") = '';

INSERT INTO "quick_reply_categories" ("id", "label", "icon", "color", "updated_at")
SELECT DISTINCT qr."category", INITCAP(REPLACE(qr."category", '_', ' ')), 'Tag', 'bg-slate-100 text-slate-700', CURRENT_TIMESTAMP
FROM "quick_replies" AS qr
WHERE NOT EXISTS (
    SELECT 1 FROM "quick_reply_categories" AS qc WHERE qc."id" = qr."category"
);

CREATE INDEX "quick_replies_category_idx" ON "quick_replies"("category");

ALTER TABLE "quick_replies"
ADD CONSTRAINT "quick_replies_category_fkey"
FOREIGN KEY ("category") REFERENCES "quick_reply_categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
