-- Hotmart: webhook hottok is configured only in Hotmart postback UI; we no longer require it in-app.
ALTER TABLE public.hotmart_credentials
 ALTER COLUMN webhook_hottok DROP NOT NULL;
