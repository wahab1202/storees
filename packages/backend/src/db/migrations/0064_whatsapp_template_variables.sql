-- WhatsApp templates: store the default CDP variable mapping per numbered param.
-- variables is TemplateVariable[] with key = the param number ('1','2',..); it is
-- inherited by campaigns/flows that use the template so send-time resolution can
-- fill {{1}},{{2}} from customer data.
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS variables jsonb;
