-- WhatsApp carousel templates: store the cards (WhatsappCarouselCard[]) for
-- carousel-type templates. NULL for standard single-message templates.
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS carousel jsonb;
